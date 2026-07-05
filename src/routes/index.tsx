import { createFileRoute } from "@tanstack/react-router";
import { useHotel } from "@/lib/hotel/store";
import { computeMonthTotals, formatCurrency } from "@/lib/hotel/utils";
import { KpiCard } from "@/components/kpi-card";
import { MonthSelector } from "@/components/month-selector";
import { DollarSign, TrendingUp, CalendarCheck, Percent, Trophy, PiggyBank, BedDouble, Wallet } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Guesthouse OS" },
      { name: "description", content: "Live KPIs: revenue, occupancy, bookings, and top rooms for your guesthouse." },
      { property: "og:title", content: "Guesthouse OS Dashboard" },
      { property: "og:description", content: "Live KPIs: revenue, occupancy, bookings, and top rooms." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { currentMonth, settings } = useHotel();
  const t = computeMonthTotals(currentMonth, settings.rooms);
  const cur = settings.currency;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Overview for <span className="font-medium text-foreground">{currentMonth.key}</span></p>
        </div>
        <MonthSelector />
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Revenue" value={formatCurrency(t.totalRevenue, cur)} icon={<DollarSign className="h-5 w-5" />} accent="primary" hint={`${t.bookingsCount} bookings`} />
        <KpiCard label="Occupancy Rate" value={`${t.occupancyRate.toFixed(1)}%`} icon={<Percent className="h-5 w-5" />} accent="success" hint={`${t.occupiedNights} / ${t.totalNights} nights`} />
        <KpiCard label="Bookings" value={t.bookingsCount.toString()} icon={<CalendarCheck className="h-5 w-5" />} accent="booking" />
        <KpiCard label="Avg Revenue / Booking" value={formatCurrency(t.avgRevenuePerBooking, cur)} icon={<TrendingUp className="h-5 w-5" />} accent="warning" />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Airbnb Revenue" value={formatCurrency(t.revenueByType.Airbnb, cur)} icon={<Wallet className="h-5 w-5" />} accent="airbnb" hint={`${t.bookingsByType.Airbnb} bookings`} />
        <KpiCard label="Booking.com Revenue" value={formatCurrency(t.revenueByType.Booking, cur)} icon={<Wallet className="h-5 w-5" />} accent="booking" hint={`${t.bookingsByType.Booking} bookings`} />
        <KpiCard label="Offline Revenue" value={formatCurrency(t.revenueByType.Offline, cur)} icon={<Wallet className="h-5 w-5" />} accent="offline" hint={`${t.bookingsByType.Offline} bookings`} />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-5 shadow-soft lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Revenue by Room</h2>
          </div>
          <div className="space-y-3">
            {settings.rooms.map((r) => {
              const rev = t.revenueByRoom[r] ?? 0;
              const pct = t.totalRevenue ? (rev / t.totalRevenue) * 100 : 0;
              const isBest = t.bestRoom?.room === r;
              return (
                <div key={r}>
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <BedDouble className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{r}</span>
                      {isBest && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-success">Best</span>}
                    </div>
                    <span className="tabular-nums text-muted-foreground">{formatCurrency(rev, cur)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-primary/50 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{pct.toFixed(1)}% of revenue</span>
                    <span>{t.emptyDaysByRoom[r]} empty days</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <KpiCard label="Best Performing Room" value={t.bestRoom?.room ?? "—"} icon={<Trophy className="h-5 w-5" />} accent="success" hint={t.bestRoom ? formatCurrency(t.bestRoom.revenue, cur) : ""} />
          <KpiCard label="Expenses" value={formatCurrency(currentMonth.expenses, cur)} icon={<PiggyBank className="h-5 w-5" />} accent="warning" />
          <KpiCard label="Net / Owner Share" value={formatCurrency(t.owner, cur)} icon={<DollarSign className="h-5 w-5" />} accent="primary" hint={`Mgmt: ${formatCurrency(t.management, cur)}`} />
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-soft">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Empty Days per Room</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {settings.rooms.map((r) => (
            <div key={r} className="rounded-xl border bg-background p-3 text-center">
              <div className="text-xs text-muted-foreground">{r}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{t.emptyDaysByRoom[r]}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">empty days</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
