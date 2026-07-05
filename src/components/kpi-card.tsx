import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface Props {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: "primary" | "airbnb" | "booking" | "offline" | "success" | "warning";
  className?: string;
}

const accentMap = {
  primary: "from-primary/15 to-primary/0 text-primary",
  airbnb: "from-airbnb/20 to-airbnb/0 text-airbnb",
  booking: "from-booking/20 to-booking/0 text-booking",
  offline: "from-offline/25 to-offline/0 text-offline-foreground",
  success: "from-success/20 to-success/0 text-success",
  warning: "from-warning/25 to-warning/0 text-warning",
} as const;

export function KpiCard({ label, value, hint, icon, accent = "primary", className }: Props) {
  return (
    <div className={cn("group relative overflow-hidden rounded-2xl border bg-card p-5 shadow-soft transition hover:shadow-card", className)}>
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70", accentMap[accent])} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        {icon && (
          <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-background/70 backdrop-blur", accentMap[accent])}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
