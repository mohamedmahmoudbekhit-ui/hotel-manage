// Server-only: fetch an iCal URL, parse, and upsert reservations for a source.
// Uses supabaseAdmin because it's called from both auth server fns and the
// public cron route. RLS is bypassed but every call is scoped by source/org id.

import { parseIcal } from "@/lib/ical/parse";
import { fetchIcal } from "@/lib/ical/fetch.server";

export interface SyncOutcome {
  ok: boolean;
  imported: number;
  removed: number;
  found: number;
  error?: string;
}

export async function syncCalendarSource(
  sourceId: string,
  trigger: "manual" | "cron" | "initial" = "manual",
): Promise<SyncOutcome> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const startedAt = Date.now();

  const { data: source, error: srcErr } = await supabaseAdmin
    .from("calendar_sources")
    .select("id, organization_id, room_id, ical_url, platform_type, is_active")
    .eq("id", sourceId)
    .maybeSingle();

  if (srcErr || !source) {
    return { ok: false, imported: 0, removed: 0, found: 0, error: srcErr?.message ?? "Source not found" };
  }
  if (!source.is_active) {
    return { ok: true, imported: 0, removed: 0, found: 0 };
  }

  const log = async (o: {
    status: string; found: number; imported: number; removed: number; error?: string | null;
  }) => {
    await supabaseAdmin.from("calendar_sync_logs").insert({
      organization_id: source.organization_id,
      source_id: source.id,
      status: o.status,
      events_found: o.found,
      imported: o.imported,
      removed: o.removed,
      duration_ms: Date.now() - startedAt,
      error_message: o.error ?? null,
      trigger_source: trigger,
    });
  };

  const fail = async (msg: string): Promise<SyncOutcome> => {
    await supabaseAdmin
      .from("calendar_sources")
      .update({ last_sync_at: new Date().toISOString(), last_sync_error: msg })
      .eq("id", source.id);
    await log({ status: "error", found: 0, imported: 0, removed: 0, error: msg });
    return { ok: false, imported: 0, removed: 0, found: 0, error: msg };
  };

  let raw: string;
  try {
    const res = await fetchIcal(source.ical_url);
    raw = res.body;
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Fetch failed");
  }

  let events;
  try {
    events = parseIcal(raw);
  } catch (e) {
    return fail(`Could not parse the calendar file: ${e instanceof Error ? e.message : String(e)}`);
  }

  const rows = events.map((e) => ({
    organization_id: source.organization_id,
    room_id: source.room_id,
    source_id: source.id,
    platform_type: source.platform_type,
    external_uid: e.uid,
    summary: e.summary || null,
    start_date: e.start,
    end_date: e.end,
    updated_at: new Date().toISOString(),
  }));

  let imported = 0;
  if (rows.length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from("ical_reservations")
      .upsert(rows, { onConflict: "source_id,external_uid" });
    if (upErr) return fail(upErr.message);
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

  await log({ status: "success", found: events.length, imported, removed });

  return { ok: true, imported, removed, found: events.length };
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
      const out = await syncCalendarSource(s.id, "cron");
      if (!out.ok) failed++;
    }),
  );
  return { total: data.length, failed };
}
