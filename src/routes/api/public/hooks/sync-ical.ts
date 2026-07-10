import { createFileRoute } from "@tanstack/react-router";

// Called by pg_cron every 15 minutes. Also callable manually.
// Auth: the request must present the Supabase anon key as `apikey` (matches
// the pattern used by pg_cron via net.http_post).
export const Route = createFileRoute("/api/public/hooks/sync-ical")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const anon = process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!anon || !provided || provided !== anon) {
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
