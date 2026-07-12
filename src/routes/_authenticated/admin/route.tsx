import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut, LayoutDashboard, Building2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "super_admin").maybeSingle();
    if (!roles) throw redirect({ to: "/" });
  },
  component: AdminShell,
});

function AdminShell() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const signOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 shrink-0 border-r bg-card">
        <div className="p-4 border-b">
          <div className="text-sm font-bold">Super Admin</div>
          <div className="text-xs text-muted-foreground">Hotel Management SaaS</div>
        </div>
        <nav className="p-3 space-y-1">
          <NavItem to="/admin" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" active={pathname === "/admin"} />
          <NavItem to="/admin/hotels" icon={<Building2 className="h-4 w-4" />} label="Hotels" active={pathname.startsWith("/admin/hotels")} />
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
    <Link to={to} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${active ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted"}`}>
      {icon} {label}
    </Link>
  );
}
