import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy customer login path — the canonical sign-in screen lives at /login. */
export const Route = createFileRoute("/auth")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/login", search: search as { joined?: string }, replace: true });
  },
  validateSearch: (s: Record<string, unknown>) => ({ joined: typeof s['joined'] === "string" ? s['joined'] : undefined }),
  component: () => null,
});
