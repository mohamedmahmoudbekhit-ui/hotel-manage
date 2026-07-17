// Server-only: fetch an iCal URL, parse, and upsert reservations for a source.
// Uses supabaseAdmin because it's called from both auth server fns and the
// public cron route. RLS is bypassed but every call must scope by user_id.

import { parseIcal } from "@/lib/ical/parse";
import { promises as dns } from "node:dns";
import net from "node:net";

/**
 * SSRF-hardened fetch for user-supplied iCal URLs.
 * - Only http(s)/webcal
 * - Resolves DNS and blocks private, loopback, link-local, and metadata addresses
 * - Manually walks redirects (max 3), re-validating each hop's host
 * - Enforces a size cap and timeout
 */
const MAX_REDIRECTS = 3;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const FETCH_TIMEOUT_MS = 15_000;

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }
  if (net.isIPv6(ip)) {
    const low = ip.toLowerCase();
    if (low === "::1" || low === "::") return true;
    if (low.startsWith("fe80:") || low.startsWith("fc") || low.startsWith("fd")) return true;
    if (low.startsWith("::ffff:")) return isBlockedIp(low.replace("::ffff:", ""));
    return false;
  }
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (!hostname) throw new Error("Invalid host");
  // Reject literal IPs directly
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error("URL host is not allowed");
    return;
  }
  // Disallow obvious internal names
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".local") || lower.endsWith(".internal")) {
    throw new Error("URL host is not allowed");
  }
  let addrs: { address: string; family: number }[];
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error("Cannot resolve host");
  }
  if (addrs.length === 0) throw new Error("Cannot resolve host");
  for (const a of addrs) {
    if (isBlockedIp(a.address)) throw new Error("URL host is not allowed");
  }
}

async function safeFetchIcal(rawUrl: string): Promise<string> {
  let currentUrl = rawUrl.replace(/^webcal:/i, "https:");
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = new URL(currentUrl);
    } catch {
      throw new Error("Invalid URL");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      throw new Error("Only http(s) URLs are allowed");
    }
    await assertPublicHost(u.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(u.toString(), {
        headers: { Accept: "text/calendar, text/plain, */*", "User-Agent": "hotel-management/1.0" },
        redirect: "manual",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`Redirect without Location (${res.status})`);
      currentUrl = new URL(loc, u).toString();
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Enforce size cap while streaming
    const reader = res.body?.getReader();
    if (!reader) return await res.text();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          try { await reader.cancel(); } catch { /* noop */ }
          throw new Error("iCal response too large");
        }
        chunks.push(value);
      }
    }
    return new TextDecoder("utf-8").decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  }
  throw new Error("Too many redirects");
}


export interface SyncOutcome {
  ok: boolean;
  imported: number;
  removed: number;
  error?: string;
}

export async function syncCalendarSource(sourceId: string): Promise<SyncOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: source, error: srcErr } = await supabaseAdmin
    .from("calendar_sources")
    .select("id, organization_id, room_id, ical_url, platform_type, is_active")
    .eq("id", sourceId)
    .maybeSingle();

  if (srcErr || !source) {
    return { ok: false, imported: 0, removed: 0, error: srcErr?.message ?? "Source not found" };
  }
  if (!source.is_active) {
    return { ok: true, imported: 0, removed: 0 };
  }

  let raw: string;
  try {
    raw = await safeFetchIcal(source.ical_url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    await supabaseAdmin
      .from("calendar_sources")
      .update({ last_sync_at: new Date().toISOString(), last_sync_error: msg })
      .eq("id", source.id);
    return { ok: false, imported: 0, removed: 0, error: msg };
  }

  const events = parseIcal(raw);
  const rows = events.map((e) => ({
    organization_id: source.organization_id,
    room_id: source.room_id,
    source_id: source.id,
    platform_type: source.platform_type,
    external_uid: e.uid,
    summary: e.summary || null,
    start_date: e.start,
    end_date: e.end,
  }));

  let imported = 0;
  if (rows.length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from("ical_reservations")
      .upsert(rows, { onConflict: "source_id,external_uid" });
    if (upErr) {
      await supabaseAdmin
        .from("calendar_sources")
        .update({ last_sync_at: new Date().toISOString(), last_sync_error: upErr.message })
        .eq("id", source.id);
      return { ok: false, imported: 0, removed: 0, error: upErr.message };
    }
    imported = rows.length;
  }

  // Remove reservations for this source that no longer appear in the feed
  const keepUids = rows.map((r) => r.external_uid);
  let removed = 0;
  if (keepUids.length > 0) {
    const { data: del } = await supabaseAdmin
      .from("ical_reservations")
      .delete()
      .eq("source_id", source.id)
      .not("external_uid", "in", `(${keepUids.map((u) => `"${u.replace(/"/g, '\\"')}"`).join(",")})`)
      .select("id");
    removed = del?.length ?? 0;
  } else {
    const { data: del } = await supabaseAdmin
      .from("ical_reservations")
      .delete()
      .eq("source_id", source.id)
      .select("id");
    removed = del?.length ?? 0;
  }

  await supabaseAdmin
    .from("calendar_sources")
    .update({ last_sync_at: new Date().toISOString(), last_sync_error: null })
    .eq("id", source.id);

  return { ok: true, imported, removed };
}

export async function syncAllActiveSources(): Promise<{ total: number; failed: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("calendar_sources")
    .select("id")
    .eq("is_active", true);
  if (error || !data) return { total: 0, failed: 0 };

  let failed = 0;
  await Promise.all(
    data.map(async (s) => {
      const out = await syncCalendarSource(s.id);
      if (!out.ok) failed++;
    }),
  );
  return { total: data.length, failed };
}
