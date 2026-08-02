import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Building2, ShieldCheck } from "lucide-react";

/** Gate for every console page: super admin + a verified second factor (AAL2). */
export const Route = createFileRoute("/console/_shell")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/console/login" });

    const { data: isSuperAdmin } = await supabase.rpc("ensure_super_admin_self");
    if (isSuperAdmin !== true) {
      await supabase.auth.signOut();
      throw redirect({ to: "/console/login" });
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") throw redirect({ to: "/console/login" });

    return { user: data.user };
  },
  component: ConsoleShell,
});

function ConsoleShell() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/console/login", replace: true });
  };
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 shrink-0 border-r bg-card">
        <div className="flex items-center gap-2 border-b p-4">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-bold">Platform Console</div>
            <div className="text-xs text-muted-foreground">Super Admin</div>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          <NavItem to="/console" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" active={pathname === "/console"} />
          <NavItem to="/console/hotels" icon={<Building2 className="h-4 w-4" />} label="Hotels" active={pathname.startsWith("/console/hotels")} />
          <NavItem to="/console/security" icon={<ShieldCheck className="h-4 w-4" />} label="Security" active={pathname.startsWith("/console/security")} />
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center border-b bg-background/80 px-4 backdrop-blur">
          <div className="text-sm text-muted-foreground">Platform administration</div>
          <Button variant="ghost" size="sm" onClick={signOut} className="ms-auto gap-1.5">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </header>
        <main className="flex-1 p-6"><Outlet /></main>
      </div>
    </div>
  );
}

function NavItem({ to, icon, label, active }: { to: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link to={to} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted"}`}>
      {icon} {label}
    </Link>
  );
}
