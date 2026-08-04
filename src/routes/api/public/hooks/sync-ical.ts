import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

// Called by pg_cron every 5 minutes. The scheduler presents the project's
// publishable key in the `apikey` header; this route performs no user-scoped work.
export const Route = createFileRoute("/api/public/hooks/sync-ical")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
        const provided = request.headers.get("apikey") ?? "";
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
