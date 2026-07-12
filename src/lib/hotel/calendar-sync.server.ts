// Server-only: fetch an iCal URL, parse, and upsert reservations for a source.
// Uses supabaseAdmin because it's called from both auth server fns and the
// public cron route. RLS is bypassed but every call must scope by user_id.

import { parseIcal } from "@/lib/ical/parse";

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
    const url = source.ical_url.replace(/^webcal:/i, "https:");
    const res = await fetch(url, {
      headers: { Accept: "text/calendar, text/plain, */*", "User-Agent": "hotel-management/1.0" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.text();
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
