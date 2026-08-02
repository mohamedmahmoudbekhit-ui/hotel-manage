import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { dashboardStats, type DashboardStats } from "@/lib/admin/orgs.functions";
import { Card } from "@/components/ui/card";
import { Building2, CheckCircle2, Clock, AlertTriangle, DollarSign } from "lucide-react";

export const Route = createFileRoute("/admin/_shell/")({
  component: AdminHome,
});

function AdminHome() {
  const fetchStats = useServerFn(dashboardStats);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  useEffect(() => {
    fetchStats().then(setStats).catch(() => {});
  }, [fetchStats]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of all subscribed hotels.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={<Building2 className="h-4 w-4" />} label="Total hotels" value={stats?.total ?? "…"} />
        <Kpi icon={<CheckCircle2 className="h-4 w-4 text-green-600" />} label="Active" value={stats?.active ?? "…"} />
        <Kpi icon={<Clock className="h-4 w-4 text-amber-600" />} label="Trial" value={stats?.trial ?? "…"} />
        <Kpi icon={<AlertTriangle className="h-4 w-4 text-red-600" />} label="Expired" value={stats?.expired ?? "…"} />
        <Kpi icon={<DollarSign className="h-4 w-4" />} label="MRR" value={stats ? `$${(stats.mrrCents / 100).toFixed(0)}` : "…"} />
      </div>
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">{icon} {label}</div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
    </Card>
  );
}
