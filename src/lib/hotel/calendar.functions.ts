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
  platform_type: string;
  external_uid: string;
  summary: string | null;
  start_date: string;
  end_date: string;
}

const platforms = ["airbnb", "booking", "vrbo", "direct", "other"] as const;

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  room_id: z.string().uuid(),
  source_name: z.string().trim().min(1).max(80),
  platform_type: z.enum(platforms),
  ical_url: z.string().url().max(2000),
  is_active: z.boolean(),
});

/** Ensures a `rooms` row exists per name in `names` for the caller, returns full list. */
export const ensureAndListRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ names: z.array(z.string().trim().min(1)).max(200) }).parse(input),
  )
  .handler(async ({ context, data }): Promise<RoomRow[]> => {
    const uniq = Array.from(new Set(data.names.map((n) => n.trim()).filter(Boolean)));
    if (uniq.length > 0) {
      const rows = uniq.map((n) => ({ user_id: context.userId, room_name: n }));
      const { error } = await context.supabase
        .from("rooms")
        .upsert(rows, { onConflict: "user_id,room_name", ignoreDuplicates: true });
      if (error) throw new Error(error.message);
    }
    const { data: list, error: listErr } = await context.supabase
      .from("rooms")
      .select("id, room_name")
      .eq("user_id", context.userId)
      .order("room_name", { ascending: true });
    if (listErr) throw new Error(listErr.message);
    return list ?? [];
  });

export const listCalendarSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CalendarSourceRow[]> => {
    const { data, error } = await context.supabase
      .from("calendar_sources")
      .select("id, room_id, source_name, platform_type, ical_url, is_active, last_sync_at, last_sync_error, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as CalendarSourceRow[];
  });

export const saveCalendarSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ context, data }) => {
    if (!isLikelyIcalUrl(data.ical_url)) {
      throw new Error("Invalid iCal URL");
    }
    if (data.id) {
      const { error } = await context.supabase
        .from("calendar_sources")
        .update({
          source_name: data.source_name,
          platform_type: data.platform_type,
          ical_url: data.ical_url,
          is_active: data.is_active,
          room_id: data.room_id,
        })
        .eq("id", data.id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: inserted, error } = await context.supabase
      .from("calendar_sources")
      .insert({
        user_id: context.userId,
        room_id: data.room_id,
        source_name: data.source_name,
        platform_type: data.platform_type,
        ical_url: data.ical_url,
        is_active: data.is_active,
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
    const { error } = await context.supabase
      .from("calendar_sources")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const syncOneSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    // Verify ownership before touching admin client
    const { data: owned, error: ownErr } = await context.supabase
      .from("calendar_sources")
      .select("id")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (ownErr) throw new Error(ownErr.message);
    if (!owned) throw new Error("Not found");
    const { syncCalendarSource } = await import("@/lib/hotel/calendar-sync.server");
    return syncCalendarSource(data.id);
  });

export const syncAllForUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calendar_sources")
      .select("id")
      .eq("user_id", context.userId)
      .eq("is_active", true);
    if (error) throw new Error(error.message);
    const { syncCalendarSource } = await import("@/lib/hotel/calendar-sync.server");
    let failed = 0;
    await Promise.all(
      (data ?? []).map(async (s) => {
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
      /** yyyy-mm-dd inclusive */
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      /** yyyy-mm-dd inclusive */
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(input),
  )
  .handler(async ({ context, data }): Promise<ImportedReservationRow[]> => {
    // Overlap: reservation.start < to+1 AND reservation.end > from
    const nextDay = new Date(`${data.to}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endExclusive = nextDay.toISOString().slice(0, 10);
    const { data: rows, error } = await context.supabase
      .from("ical_reservations")
      .select("id, room_id, source_id, platform_type, external_uid, summary, start_date, end_date, rooms!inner(room_name), calendar_sources!inner(source_name)")
      .eq("user_id", context.userId)
      .lt("start_date", endExclusive)
      .gt("end_date", data.from);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      room_id: r.room_id,
      // @ts-expect-error nested select shape
      room_name: r.rooms.room_name,
      source_id: r.source_id,
      // @ts-expect-error nested select shape
      source_name: r.calendar_sources.source_name,
      platform_type: r.platform_type,
      external_uid: r.external_uid,
      summary: r.summary,
      start_date: r.start_date,
      end_date: r.end_date,
    }));
  });
