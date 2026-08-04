import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isLikelyIcalUrl } from "@/lib/ical/parse";

export interface RoomRow {
  id: string;
  room_name: string;
}

export interface CalendarSourceRow {
  id: string;
  room_id: string;
  source_name: string;
  platform_type: string;
  ical_url: string;
  is_active: boolean;
  color: string;
  channel_id: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  created_at: string;
}

export interface ImportedReservationRow {
  id: string;
  room_id: string;
  room_name: string;
  source_id: string;
  source_name: string;
  source_color: string;
  channel_id: string | null;
  platform_type: string;
  external_uid: string;
  summary: string | null;
  start_date: string;
  end_date: string;
  override_price: number | null;
  override_notes: string | null;
  override_channel_id: string | null;
  status: "active" | "noshow";
}

const platforms = ["airbnb", "booking", "vrbo", "direct", "other"] as const;
const HEX_COLOR = /^#([0-9a-fA-F]{6})$/;

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  room_id: z.string().uuid(),
  source_name: z.string().trim().min(1).max(80),
  platform_type: z.enum(platforms),
  ical_url: z.string().url().max(2000),
  is_active: z.boolean(),
  color: z.string().regex(HEX_COLOR).optional(),
  channel_id: z.string().trim().min(1).max(80),
});


async function resolveOrg(supabase: any, userId: string): Promise<string> {
  const { data } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data?.organization_id) throw new Error("No organization for user");
  return data.organization_id as string;
}

export const ensureAndListRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ names: z.array(z.string().trim().min(1)).max(200) }).parse(input),
  )
  .handler(async ({ context, data }): Promise<RoomRow[]> => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    const uniq = Array.from(new Set(data.names.map((n) => n.trim()).filter(Boolean)));
    if (uniq.length > 0) {
      const { data: existing } = await context.supabase
        .from("rooms")
        .select("room_name")
        .eq("organization_id", orgId);
      const have = new Set((existing ?? []).map((r: any) => r.room_name));
      const toInsert = uniq.filter((n) => !have.has(n)).map((n) => ({ organization_id: orgId, room_name: n }));
      if (toInsert.length > 0) {
        const { error } = await context.supabase.from("rooms").insert(toInsert);
        if (error) throw new Error(error.message);
      }
    }
    const { data: list, error: listErr } = await context.supabase
      .from("rooms")
      .select("id, room_name")
      .eq("organization_id", orgId)
      .order("room_name", { ascending: true });
    if (listErr) throw new Error(listErr.message);
    return list ?? [];
  });

export const listCalendarSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CalendarSourceRow[]> => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("calendar_sources")
      .select("id, room_id, source_name, platform_type, ical_url, is_active, color, channel_id, last_sync_at, last_sync_error, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as CalendarSourceRow[];
  });

export const saveCalendarSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    if (!isLikelyIcalUrl(data.ical_url)) throw new Error("Invalid iCal URL");
    if (data.id) {
      const patch: {
        source_name: string; platform_type: string; ical_url: string; is_active: boolean; room_id: string; channel_id: string; color?: string;
      } = {
        source_name: data.source_name,
        platform_type: data.platform_type,
        ical_url: data.ical_url,
        is_active: data.is_active,
        room_id: data.room_id,
        channel_id: data.channel_id,
      };
      if (data.color) patch.color = data.color;
      const { error } = await context.supabase
        .from("calendar_sources")
        .update(patch)
        .eq("id", data.id)
        .eq("organization_id", orgId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("calendar_sources")
      .insert({
        organization_id: orgId,
        room_id: data.room_id,
        source_name: data.source_name,
        platform_type: data.platform_type,
        ical_url: data.ical_url,
        is_active: data.is_active,
        channel_id: data.channel_id,
        ...(data.color ? { color: data.color } : {}),
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const deleteCalendarSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    const { error } = await context.supabase
      .from("calendar_sources")
      .delete()
      .eq("id", data.id)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncOneSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    const { data: owned, error: ownErr } = await context.supabase
      .from("calendar_sources")
      .select("id")
      .eq("id", data.id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (ownErr) throw new Error(ownErr.message);
    if (!owned) throw new Error("Not found");
    const { syncCalendarSource } = await import("@/lib/hotel/calendar-sync.server");
    return syncCalendarSource(data.id);
  });

export const syncAllForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("calendar_sources")
      .select("id")
      .eq("organization_id", orgId)
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    const { syncCalendarSource } = await import("@/lib/hotel/calendar-sync.server");
    let failed = 0;
    await Promise.all(
      (data ?? []).map(async (s: any) => {
        const out = await syncCalendarSource(s.id);
        if (!out.ok) failed++;
      }),
    );
    return { total: data?.length ?? 0, failed };
  });

export const listImportedForMonth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(input),
  )
  .handler(async ({ context, data }): Promise<ImportedReservationRow[]> => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    const nextDay = new Date(`${data.to}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endExclusive = nextDay.toISOString().slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("ical_reservations")
      .select("id, room_id, source_id, platform_type, external_uid, summary, start_date, end_date, rooms!inner(room_name), calendar_sources!inner(source_name, color, channel_id), ical_reservation_overrides(price, notes, hidden, channel_id, status)")
      .eq("organization_id", orgId)
      .lt("start_date", endExclusive)
      .gt("end_date", data.from);
    if (error) throw new Error(error.message);
    const list: ImportedReservationRow[] = [];
    for (const r of (rows ?? []) as any[]) {
      const ov = Array.isArray(r.ical_reservation_overrides) ? r.ical_reservation_overrides[0] : r.ical_reservation_overrides;
      if (ov?.hidden) continue;
      list.push({
        id: r.id,
        room_id: r.room_id,
        room_name: r.rooms.room_name,
        source_id: r.source_id,
        source_name: r.calendar_sources.source_name,
        source_color: r.calendar_sources.color ?? "#64748b",
        channel_id: r.calendar_sources.channel_id ?? null,
        platform_type: r.platform_type,
        external_uid: r.external_uid,
        summary: r.summary,
        start_date: r.start_date,
        end_date: r.end_date,
        override_price: ov?.price != null ? Number(ov.price) : null,
        override_notes: ov?.notes ?? null,
        override_channel_id: ov?.channel_id ?? null,
        status: ov?.status === "noshow" ? "noshow" : "active",
      });
    }
    return list;
  });

const overrideSchema = z.object({
  reservation_id: z.string().uuid(),
  price: z.number().nonnegative().nullable(),
  notes: z.string().max(2000).nullable(),
  channel_id: z.string().trim().min(1).max(80).nullable(),
  status: z.enum(["active", "noshow"]),
});

export const saveImportedOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => overrideSchema.parse(input))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    // verify reservation belongs to org
    const { data: res, error: resErr } = await context.supabase
      .from("ical_reservations")
      .select("id")
      .eq("id", data.reservation_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (resErr) throw new Error(resErr.message);
    if (!res) throw new Error("Reservation not found");
    const { error } = await context.supabase
      .from("ical_reservation_overrides")
      .upsert(
        {
          reservation_id: data.reservation_id,
          organization_id: orgId,
          price: data.price,
          notes: data.notes,
          channel_id: data.channel_id,
          status: data.status,
        },
        { onConflict: "reservation_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeImportedReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ reservation_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    const { data: res } = await context.supabase
      .from("ical_reservations")
      .select("id")
      .eq("id", data.reservation_id)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!res) throw new Error("Reservation not found");
    const { error } = await context.supabase
      .from("ical_reservation_overrides")
      .upsert(
        { reservation_id: data.reservation_id, organization_id: orgId, hidden: true },
        { onConflict: "reservation_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface IcalTestResult {
  ok: boolean;
  error?: string;
  finalUrl?: string;
  contentType?: string | null;
  bytes?: number;
  totalEvents?: number;
  upcoming?: { uid: string; summary: string; start: string; end: string }[];
}

/** Validate an iCal URL, fetch it, and preview the reservations it contains. */
export const testIcalConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ical_url: z.string().trim().min(1).max(2000) }).parse(input),
  )
  .handler(async ({ data }): Promise<IcalTestResult> => {
    if (!isLikelyIcalUrl(data.ical_url)) {
      return { ok: false, error: "Enter a valid http(s) or webcal calendar URL" };
    }
    try {
      const { fetchIcal } = await import("@/lib/ical/fetch.server");
      const { parseIcal } = await import("@/lib/ical/parse");
      const res = await fetchIcal(data.ical_url);
      const events = parseIcal(res.body);
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = events
        .filter((e) => e.end >= today)
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(0, 8)
        .map((e) => ({ uid: e.uid, summary: e.summary, start: e.start, end: e.end }));
      return {
        ok: true,
        finalUrl: res.finalUrl,
        contentType: res.contentType,
        bytes: res.bytes,
        totalEvents: events.length,
        upcoming,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });

export interface SyncLogRow {
  id: string;
  source_id: string;
  status: string;
  events_found: number;
  imported: number;
  removed: number;
  duration_ms: number;
  error_message: string | null;
  trigger_source: string;
  created_at: string;
}

export const listSyncLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ source_id: z.string().uuid(), limit: z.number().int().min(1).max(50).optional() }).parse(input),
  )
  .handler(async ({ context, data }): Promise<SyncLogRow[]> => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("calendar_sync_logs")
      .select("id, source_id, status, events_found, imported, removed, duration_ms, error_message, trigger_source, created_at")
      .eq("organization_id", orgId)
      .eq("source_id", data.source_id)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 10);
    if (error) throw new Error(error.message);
    return (rows ?? []) as SyncLogRow[];
  });

// ---------------------------------------------------------------------------
// Outbound iCal export feeds (one per room)
// ---------------------------------------------------------------------------

export interface RoomFeedRow {
  id: string;
  room_name: string;
  token: string;
}

export const listRoomFeeds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RoomFeedRow[]> => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("rooms")
      .select("id, room_name, ical_export_token")
      .eq("organization_id", orgId)
      .order("room_name", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ id: r.id, room_name: r.room_name, token: r.ical_export_token }));
  });

export const regenerateRoomFeedToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ room_id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }): Promise<{ token: string }> => {
    const orgId = await resolveOrg(context.supabase, context.userId);
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    const { error } = await context.supabase
      .from("rooms")
      .update({ ical_export_token: token })
      .eq("id", data.room_id)
      .eq("organization_id", orgId);
    if (error) throw new Error(error.message);
    return { token };
  });
