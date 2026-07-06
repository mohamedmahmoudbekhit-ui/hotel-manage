import { createFileRoute } from "@tanstack/react-router";
import { useHotel } from "@/lib/hotel/store";
import { MonthSelector } from "@/components/month-selector";
import { computeMonthTotals, formatCurrency } from "@/lib/hotel/utils";
import { PieChart, Pie, Cell as RCell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, Legend } from "recharts";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/charts")({
  head: () => ({
    meta: [
      { title: "Charts — 7 Heaven" },
      { name: "description", content: "Interactive charts: booking distribution, revenue by source, occupancy trend, and revenue per room." },
    ],
  }),
  component: ChartsPage,
});

const COLORS = {
  Airbnb: "var(--airbnb)",
  Booking: "var(--booking)",
  Offline: "var(--offline)",
};

function ChartsPage() {
  const { currentMonth, settings, months } = useHotel();
  const { t, formatMonthKey } = useI18n();
  const totals = computeMonthTotals(currentMonth, settings.rooms);

  const pieData = (["Airbnb", "Booking", "Offline"] as const).map((k) => ({
    name: t(`type.${k}`), key: k, value: totals.bookingsByType[k],
  })).filter((d) => d.value > 0);

  const barData = (["Airbnb", "Booking", "Offline"] as const).map((k) => ({
    name: t(`type.${k}`), key: k, revenue: Math.round(totals.revenueByType[k]),
  }));

  const roomData = settings.rooms.map((r) => ({
    name: r, revenue: Math.round(totals.revenueByRoom[r] ?? 0),
  }));

  const sortedMonths = Object.values(months).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex,
  );
  const trendData = sortedMonths.map((m) => {
    const tt = computeMonthTotals(m, settings.rooms);
    return { name: formatMonthKey(m.key), occupancy: +tt.occupancyRate.toFixed(1), revenue: Math.round(tt.totalRevenue) };
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{t("charts.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("charts.visualFor")} {formatMonthKey(currentMonth.key)}</p>
        </div>
        <MonthSelector />
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title={t("charts.byType")} subtitle={t("charts.byTypeSub")}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {pieData.map((entry) => (
                  <RCell key={entry.key} fill={COLORS[entry.key as keyof typeof COLORS]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)" }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("charts.bySource")} subtitle={settings.currency}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip
                formatter={(v: number) => formatCurrency(v, settings.currency)}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)" }}
              />
              <Bar dataKey="revenue" radius={[8, 8, 0, 0]}>
                {barData.map((d) => (
                  <RCell key={d.key} fill={COLORS[d.key as keyof typeof COLORS]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("charts.byRoom")} subtitle={t("charts.byRoomSub")}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={roomData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} />
              <Tooltip
                formatter={(v: number) => formatCurrency(v, settings.currency)}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)" }}
              />
              <Bar dataKey="revenue" fill="var(--primary)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title={t("charts.trend")} subtitle={t("charts.trendSub")}>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={12} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                formatter={(v: number) => `${v}%`}
                contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--popover)" }}
              />
              <Line type="monotone" dataKey="occupancy" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4, fill: "var(--primary)" }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-soft">
      <div className="mb-4">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
