import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

// Public, read-only iCalendar feed for a single room.
// Security: the URL itself is the credential — the random per-room token is
// compared in constant time and no data is returned without an exact match.
export const Route = createFileRoute("/api/public/ical/$roomId/{$token}.ics")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const notFound = () => new Response("Not found", { status: 404 });
        const roomId = params.roomId ?? "";
        const token = params.token ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(roomId) || !/^[0-9a-f]{32,128}$/i.test(token)) return notFound();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: room } = await supabaseAdmin
          .from("rooms")
          .select("id, room_name, organization_id, ical_export_token")
          .eq("id", roomId)
          .maybeSingle();
        if (!room?.ical_export_token) return notFound();

        const a = Buffer.from(token);
        const b = Buffer.from(room.ical_export_token);
        if (a.length !== b.length || !timingSafeEqual(a, b)) return notFound();

        const { data: state } = await supabaseAdmin
          .from("hotel_state")
          .select("data")
          .eq("organization_id", room.organization_id)
          .maybeSingle();

        const { collectRoomBookings, buildIcs } = await import("@/lib/ical/export.server");
        const bookings = collectRoomBookings(state?.data ?? null, room.room_name);
        const body = buildIcs(room.room_name, bookings);

        // Availability must never be served stale: OTAs poll on their own
        // schedule, so every fetch reads the live database state.
        return new Response(body, {
          status: 200,
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Content-Disposition": `inline; filename="room-${room.id}.ics"`,
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "CDN-Cache-Control": "no-store",
            "Pragma": "no-cache",
            "Expires": "0",
            "Last-Modified": new Date().toUTCString(),
          },
        });
      },
    },
  },
});
