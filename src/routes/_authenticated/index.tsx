import { createFileRoute } from "@tanstack/react-router";
import { useHotel } from "@/lib/hotel/store";
import { computeMonthTotals, formatCurrency } from "@/lib/hotel/utils";
import { KpiCard } from "@/components/kpi-card";
import { MonthSelector } from "@/components/month-selector";
import { DollarSign, TrendingUp, CalendarCheck, Percent, Trophy, PiggyBank, BedDouble, Wallet } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Dashboard — 7 Heaven" },
      { name: "description", content: "Live KPIs: revenue, occupancy, bookings, and top rooms for 7 Heaven guesthouse." },
      { property: "og:title", content: "7 Heaven Dashboard" },
      { property: "og:description", content: "Live KPIs: revenue, occupancy, bookings, and top rooms." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { currentMonth, settings } = useHotel();
  const { t, formatMonthKey } = useI18n();
  const totals = computeMonthTotals(currentMonth, settings.rooms);
  const cur = settings.currency;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{t("nav.dashboard")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("common.overviewFor")} <span className="font-medium text-foreground">{formatMonthKey(currentMonth.key)}</span></p>
        </div>
        <MonthSelector />
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t("kpi.totalRevenue")} value={formatCurrency(totals.totalRevenue, cur)} icon={<DollarSign className="h-5 w-5" />} accent="primary" hint={`${totals.bookingsCount} ${t("common.bookings")}`} />
        <KpiCard label={t("kpi.occupancyRate")} value={`${totals.occupancyRate.toFixed(1)}%`} icon={<Percent className="h-5 w-5" />} accent="success" hint={`${totals.occupiedNights} / ${totals.totalNights} ${t("kpi.nights")}`} />
        <KpiCard label={t("kpi.bookings")} value={totals.bookingsCount.toString()} icon={<CalendarCheck className="h-5 w-5" />} accent="booking" />
        <KpiCard label={t("kpi.avgPerBooking")} value={formatCurrency(totals.avgRevenuePerBooking, cur)} icon={<TrendingUp className="h-5 w-5" />} accent="warning" />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label={t("kpi.airbnbRev")} value={formatCurrency(totals.revenueByType.Airbnb, cur)} icon={<Wallet className="h-5 w-5" />} accent="airbnb" hint={`${totals.bookingsByType.Airbnb} ${t("common.bookings")}`} />
        <KpiCard label={t("kpi.bookingRev")} value={formatCurrency(totals.revenueByType.Booking, cur)} icon={<Wallet className="h-5 w-5" />} accent="booking" hint={`${totals.bookingsByType.Booking} ${t("common.bookings")}`} />
        <KpiCard label={t("kpi.offlineRev")} value={formatCurrency(totals.revenueByType.Offline, cur)} icon={<Wallet className="h-5 w-5" />} accent="offline" hint={`${totals.bookingsByType.Offline} ${t("common.bookings")}`} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 shadow-soft lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("kpi.revenueByRoom")}</h2>
          </div>
          <div className="space-y-3">
            {settings.rooms.map((r) => {
              const rev = totals.revenueByRoom[r] ?? 0;
              const pct = totals.totalRevenue ? (rev / totals.totalRevenue) * 100 : 0;
              const isBest = totals.bestRoom?.room === r;
              return (
                <div key={r}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <BedDouble className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{r}</span>
                      {isBest && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">{t("kpi.best")}</span>}
                    </div>
                    <span className="tabular-nums text-muted-foreground">{formatCurrency(rev, cur)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/50 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{pct.toFixed(1)}{t("kpi.pctOfRevenue")}</span>
                    <span>{totals.emptyDaysByRoom[r]} {t("common.emptyDays")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <KpiCard label={t("kpi.bestRoom")} value={totals.bestRoom?.room ?? "—"} icon={<Trophy className="h-5 w-5" />} accent="success" hint={totals.bestRoom ? formatCurrency(totals.bestRoom.revenue, cur) : ""} />
          <KpiCard label={t("kpi.expenses")} value={formatCurrency(currentMonth.expenses, cur)} icon={<PiggyBank className="h-5 w-5" />} accent="warning" hint={`${currentMonth.expenseItems?.length ?? 0} items`} />
          <KpiCard label={t("kpi.ownerShare")} value={formatCurrency(totals.owner, cur)} icon={<DollarSign className="h-5 w-5" />} accent="primary" hint={`${t("kpi.mgmt")}: ${formatCurrency(totals.management, cur)}`} />
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("kpi.emptyDaysPerRoom")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {settings.rooms.map((r) => (
            <div key={r} className="rounded-xl border bg-background p-3 text-center">
              <div className="text-xs text-muted-foreground">{r}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{totals.emptyDaysByRoom[r]}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("common.emptyDays")}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
