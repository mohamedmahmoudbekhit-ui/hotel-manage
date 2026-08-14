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

  // ---- Reconciliation: the current feed is the source of truth for THIS source ----
  // Dedupe by UID (some feeds repeat a UID across recurrence lines); last one wins.
  const byUid = new Map<string, { start: string; end: string; summary: string }>();
  for (const e of events) {
    if (!e.uid) continue;
    byUid.set(e.uid, { start: e.start, end: e.end, summary: e.summary || "" });
  }

  // Existing local records for THIS source only (never touches manual bookings
  // or other integrations' records).
  const { data: existing, error: exErr } = await supabaseAdmin
    .from("ical_reservations")
    .select("id, external_uid, start_date, end_date, summary, room_id, platform_type")
    .eq("source_id", source.id);
  if (exErr) return fail(exErr.message);

  const existingByUid = new Map((existing ?? []).map((r) => [r.external_uid, r]));

  type InsertRow = {
    organization_id: string; room_id: string; source_id: string; platform_type: string;
    external_uid: string; summary: string | null; start_date: string; end_date: string;
  };
  type PatchRow = {
    start_date: string; end_date: string; summary: string | null;
    room_id: string; platform_type: string; updated_at: string;
  };
  const toInsert: InsertRow[] = [];
  const toUpdate: Array<{ id: string; patch: PatchRow }> = [];

  for (const [uid, e] of byUid) {
    const local = existingByUid.get(uid);
    if (!local) {
      toInsert.push({
        organization_id: source.organization_id,
        room_id: source.room_id,
        source_id: source.id,
        platform_type: source.platform_type,
        external_uid: uid,
        summary: e.summary || null,
        start_date: e.start,
        end_date: e.end,
      });
      continue;
    }
    const changed =
      local.start_date !== e.start ||
      local.end_date !== e.end ||
      (local.summary ?? "") !== e.summary ||
      local.room_id !== source.room_id ||
      local.platform_type !== source.platform_type;
    if (changed) {
      toUpdate.push({
        id: local.id,
        patch: {
          start_date: e.start,
          end_date: e.end,
          summary: e.summary || null,
          room_id: source.room_id,
          platform_type: source.platform_type,
          updated_at: new Date().toISOString(),
        },
      });
    }
  }

  // Stale: present locally for this source but gone from the current valid feed.
  const staleIds = (existing ?? [])
    .filter((r) => !byUid.has(r.external_uid))
    .map((r) => r.id);

  if (toInsert.length > 0) {
    const { error } = await supabaseAdmin.from("ical_reservations").insert(toInsert);
    if (error) return fail(error.message);
  }

  for (const u of toUpdate) {
    const { error } = await supabaseAdmin
      .from("ical_reservations")
      .update(u.patch)
      .eq("id", u.id)
      .eq("source_id", source.id);
    if (error) return fail(error.message);
  }

  let removed = 0;
  if (staleIds.length > 0) {
    // Overrides cascade-delete with the reservation row.
    const { data: del, error } = await supabaseAdmin
      .from("ical_reservations")
      .delete()
      .eq("source_id", source.id)
      .in("id", staleIds)
      .select("id");
    if (error) return fail(error.message);
    removed = del?.length ?? 0;
  }

  const imported = toInsert.length + toUpdate.length;


  await supabaseAdmin
    .from("calendar_sources")
    .update({
      last_sync_at: new Date().toISOString(),
      last_success_at: new Date().toISOString(),
      last_sync_error: null,
    })
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
