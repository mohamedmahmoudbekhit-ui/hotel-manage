import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Platform administration portal. Deliberately separate from the customer app:
 * its own URL space, its own sign-in page, its own gate and MFA requirement.
 */
export const Route = createFileRoute("/console")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Console" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Restricted access." },
    ],
  }),
  component: () => <Outlet />,
});
