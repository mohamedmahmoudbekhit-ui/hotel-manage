import { createFileRoute } from "@tanstack/react-router";
import { useHotel } from "@/lib/hotel/store";
import { computeMonthTotals, formatCurrency } from "@/lib/hotel/utils";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/summary")({
  head: () => ({
    meta: [
      { title: "Monthly Summary — Guesthouse OS" },
      { name: "description", content: "Month-over-month comparison of revenue, bookings, and occupancy with trend indicators." },
    ],
  }),
  component: SummaryPage,
});

function SummaryPage() {
  const { months, settings } = useHotel();
  const sorted = Object.values(months).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex,
  );
  const rows = sorted.map((m) => ({ m, t: computeMonthTotals(m, settings.rooms) }));

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Monthly Summary</h1>
        <p className="mt-1 text-sm text-muted-foreground">Compare performance across every month</p>
      </header>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Month</th>
              <th className="px-4 py-3">Revenue</th>
              <th className="px-4 py-3">Bookings</th>
              <th className="px-4 py-3">Occupancy</th>
              <th className="px-4 py-3">Net</th>
              <th className="px-4 py-3">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ m, t }, i) => {
              const prev = i > 0 ? rows[i - 1].t : null;
              const delta = prev && prev.totalRevenue > 0 ? ((t.totalRevenue - prev.totalRevenue) / prev.totalRevenue) * 100 : null;
              const maxRev = Math.max(...rows.map((r) => r.t.totalRevenue), 1);
              return (
                <tr key={m.key} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{m.key}</td>
                  <td className="px-4 py-3 tabular-nums">
                    <div>{formatCurrency(t.totalRevenue, settings.currency)}</div>
                    <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${(t.totalRevenue / maxRev) * 100}%` }} />
                    </div>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{t.bookingsCount}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
                      t.occupancyRate >= 60 ? "bg-success/15 text-success" :
                      t.occupancyRate >= 30 ? "bg-warning/20 text-warning" :
                      "bg-muted text-muted-foreground",
                    )}>
                      {t.occupancyRate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatCurrency(t.net, settings.currency)}</td>
                  <td className="px-4 py-3">
                    {delta === null ? (
                      <span className="text-muted-foreground"><Minus className="inline h-3.5 w-3.5" /></span>
                    ) : delta > 0 ? (
                      <span className="inline-flex items-center gap-1 text-success">
                        <ArrowUpRight className="h-3.5 w-3.5" /> {delta.toFixed(1)}%
                      </span>
                    ) : delta < 0 ? (
                      <span className="inline-flex items-center gap-1 text-destructive">
                        <ArrowDownRight className="h-3.5 w-3.5" /> {Math.abs(delta).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">0%</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
