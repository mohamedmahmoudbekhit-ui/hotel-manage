import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarDays, LineChart, BarChart3, Settings as SettingsIcon, Hotel, Receipt, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useI18n } from "@/lib/i18n";
import { useHotel } from "@/lib/hotel/store";

export function AppSidebar({ side = "left" }: { side?: "left" | "right" }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { t } = useI18n();
  const { hotelName, logoUrl, isBookingAgent } = useHotel();
  const isActive = (p: string) => (p === "/" ? pathname === "/" : pathname.startsWith(p));

  const items = isBookingAgent
    ? [{ title: t("nav.bookings"), url: "/bookings", icon: CalendarDays }]
    : [
        { title: t("nav.dashboard"), url: "/", icon: LayoutDashboard },
        { title: t("nav.bookings"), url: "/bookings", icon: CalendarDays },
        { title: t("nav.expenses"), url: "/expenses", icon: Receipt },
        { title: t("nav.charts"), url: "/charts", icon: BarChart3 },
        { title: t("nav.summary"), url: "/summary", icon: LineChart },
        { title: "Users", url: "/users", icon: Users },
        { title: t("nav.settings"), url: "/settings", icon: SettingsIcon },
      ];

  return (
    <Sidebar collapsible="icon" side={side}>
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            {logoUrl ? (
              <img src={logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Hotel className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-sidebar-foreground">{hotelName || t("brand.name")}</div>
            <div className="truncate text-xs text-sidebar-foreground/60">{t("brand.tagline")}</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.workspace")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <Link to={item.url} className="flex items-center gap-2">
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
