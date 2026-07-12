import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { HotelProvider, useHotel } from "@/lib/hotel/store";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Button } from "@/components/ui/button";
import { Languages, LogOut, Loader2, ShieldOff } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Route super_admin (with no org) to /admin
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "super_admin").maybeSingle();
    if (roleRow && !location.pathname.startsWith("/admin")) {
      throw redirect({ to: "/admin" });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  // Admin section owns its own layout (no HotelProvider needed)
  if (pathname.startsWith("/admin")) return <Outlet />;
  return (
    <HotelProvider>
      <OrgAccessGate>
        <OnboardingGate>
          <AppShell />
        </OnboardingGate>
      </OrgAccessGate>
    </HotelProvider>
  );
}

function OrgAccessGate({ children }: { children: ReactNode }) {
  const { loading, organizationId, accountStatus, subscriptionStatus } = useHotel();
  const navigate = useNavigate();

  const signOut = async () => { await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (!organizationId) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <ShieldOff className="mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">No hotel access yet</h1>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">Your account isn't linked to a hotel. Ask your Super Admin for an invitation link.</p>
        <Button variant="outline" className="mt-4" onClick={signOut}>Sign out</Button>
      </div>
    );
  }
  if (accountStatus === "suspended" || subscriptionStatus === "suspended" || subscriptionStatus === "expired" || subscriptionStatus === "cancelled") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <ShieldOff className="mb-3 h-10 w-10 text-red-600" />
        <h1 className="text-xl font-bold">Access is currently disabled</h1>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          {subscriptionStatus === "expired" ? "Your subscription has expired. Please contact support to renew."
            : subscriptionStatus === "cancelled" ? "Your subscription has been cancelled."
            : "Your account has been suspended. Please contact support."}
        </p>
        <Button variant="outline" className="mt-4" onClick={signOut}>Sign out</Button>
      </div>
    );
  }
  return <>{children}</>;
}

function OnboardingGate({ children }: { children: ReactNode }) {
  const { loading, onboarded } = useHotel();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    if (loading) return;
    if (!onboarded && pathname !== "/onboarding") navigate({ to: "/onboarding", replace: true });
    if (onboarded && pathname === "/onboarding") navigate({ to: "/", replace: true });
  }, [loading, onboarded, pathname, navigate]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  return <>{children}</>;
}

function AppShell() {
  const { t, toggle, lang, dir } = useI18n();
  const { hotelName, signOut, onboarded } = useHotel();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", replace: true });
  };

  if (!onboarded || pathname === "/onboarding") {
    return (
      <div className="min-h-screen bg-background" dir={dir}>
        <header className="flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
          <div className="text-sm font-semibold">{t("brand.name")}</div>
          <Button variant="ghost" size="sm" onClick={toggle} className="ms-auto gap-1.5" aria-label="Toggle language">
            <Languages className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">{lang === "en" ? "AR" : "EN"}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5">
            <LogOut className="h-4 w-4" />
            <span className="text-xs">{t("auth.signOut")}</span>
          </Button>
        </header>
        <main><Outlet /></main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background" dir={dir}>
        <AppSidebar side={dir === "rtl" ? "right" : "left"} />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="min-w-0 truncate text-sm font-medium text-muted-foreground">
              {hotelName || t("brand.name")}
            </div>
            <Button variant="ghost" size="sm" onClick={toggle} className="ms-auto gap-1.5" aria-label="Toggle language">
              <Languages className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase">{lang === "en" ? "AR" : "EN"}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="gap-1.5" title={t("auth.signOut")}>
              <LogOut className="h-4 w-4" />
              <span className="hidden text-xs sm:inline">{t("auth.signOut")}</span>
            </Button>
          </header>
          <main className="flex-1"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}
