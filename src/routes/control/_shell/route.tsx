import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LogOut, LayoutDashboard, Building2, ShieldCheck, KeyRound, Menu } from "lucide-react";

/** Gate for every console page: super admin + a verified second factor (AAL2). */
export const Route = createFileRoute("/control/_shell")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/control/login" });

    const { data: isSuperAdmin } = await supabase.rpc("ensure_super_admin_self");
    if (isSuperAdmin !== true) {
      await supabase.auth.signOut();
      throw redirect({ to: "/control/login" });
    }

    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") throw redirect({ to: "/control/login" });

    return { user: data.user };
  },
  component: ConsoleShell,
});

function ConsoleShell() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/control/login", replace: true });
  };

  const nav = (
    <nav className="space-y-1 p-3">
      <NavItem to="/control" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" active={pathname === "/control"} />
      <NavItem to="/control/hotels" icon={<Building2 className="h-4 w-4" />} label="Hotels" active={pathname.startsWith("/control/hotels")} />
      <NavItem to="/control/resets" icon={<KeyRound className="h-4 w-4" />} label="Password resets" active={pathname.startsWith("/control/resets")} />
      <NavItem to="/control/security" icon={<ShieldCheck className="h-4 w-4" />} label="Security" active={pathname.startsWith("/control/security")} />
    </nav>
  );

  const brand = (
    <div className="flex items-center gap-2 border-b p-4">
      <ShieldCheck className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">Platform Console</div>
        <div className="truncate text-xs text-muted-foreground">Super Admin</div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="hidden w-60 shrink-0 border-r bg-card md:block">
        {brand}
        {nav}
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[17rem] p-0">
          <SheetTitle className="sr-only">Console navigation</SheetTitle>
          {brand}
          {nav}
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-3 backdrop-blur sm:px-4">
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu" onClick={() => setMenuOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <div className="min-w-0 truncate text-sm text-muted-foreground">Platform administration</div>
          <Button variant="ghost" size="sm" onClick={signOut} className="ms-auto shrink-0 gap-1.5">
            <LogOut className="h-4 w-4" /> <span className="hidden sm:inline">Sign out</span>
          </Button>
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6"><Outlet /></main>
      </div>
    </div>
  );
}

function NavItem({ to, icon, label, active }: { to: string; icon: React.ReactNode; label: string; active: boolean }) {
  return (
    <Link to={to} className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-sm ${active ? "bg-primary/10 font-medium text-primary" : "text-foreground hover:bg-muted"}`}>
      {icon} {label}
    </Link>
  );
}
