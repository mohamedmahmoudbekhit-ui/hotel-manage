import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

// Called by pg_cron every 15 minutes. Also callable manually with the shared secret.
// Auth: the request must present the CRON_SYNC_SECRET (a private, server-only secret)
// in the `x-cron-secret` header. The Supabase publishable/anon key is NOT accepted
// because it ships in every client bundle.
export const Route = createFileRoute("/api/public/hooks/sync-ical")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.CRON_SYNC_SECRET;
        const provided = request.headers.get("x-cron-secret") ?? "";
        if (!expected) {
          return new Response(JSON.stringify({ error: "server_misconfigured" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        const a = Buffer.from(provided);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { syncAllActiveSources } = await import("@/lib/hotel/calendar-sync.server");
          const result = await syncAllActiveSources();
          return Response.json({ ok: true, ...result, at: new Date().toISOString() });
        } catch (e) {
          const msg = e instanceof Error ? e.message : "sync failed";
          console.error("[sync-ical]", msg);
          return new Response(JSON.stringify({ ok: false, error: msg }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
