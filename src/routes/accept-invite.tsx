import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy invitation path — kept so already-sent links keep working. */
export const Route = createFileRoute("/accept-invite")({
  validateSearch: (s: Record<string, unknown>) => ({ token: typeof s['token'] === "string" ? s['token'] : undefined }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/activate", search: search as { token?: string }, replace: true });
  },
  component: () => null,
});
