import { useMemo } from "react";
import { useHotel } from "@/lib/hotel/store";
import { findChannel, monthKey, pickTextColor, resolveImportedChannel, slotCells } from "@/lib/hotel/utils";
import type { ImportedReservationRow } from "@/lib/hotel/calendar.functions";
import { LogIn, LogOut, BedDouble, DoorOpen, RefreshCw } from "lucide-react";

export type DayStatus = "turnover" | "checkin" | "checkout" | "occupied" | "vacant";


interface RoomDay {
  room: string;
  status: DayStatus;
  label?: string;
  color?: string;
  note?: string | null;
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function DailyView({
  date,
  imported,
}: {
  date: Date;
  imported: ImportedReservationRow[];
}) {
  const { months, settings } = useHotel();

  const rows = useMemo<RoomDay[]>(() => {
    const prev = new Date(date);
    prev.setDate(prev.getDate() - 1);

    const cellAt = (room: string, d: Date) => {
      const m = months[monthKey(d.getFullYear(), d.getMonth())];
      // A night may hold several bookings (e.g. a replacement); the first
      // active one drives the operational status shown for the room.
      const list = slotCells(m?.cells?.[room]?.[d.getDate()]);
      return list.find((c) => c.status !== "noshow") ?? list[0] ?? null;
    };

    const todayIso = iso(date);
    const impByRoom = new Map<string, ImportedReservationRow[]>();
    for (const r of imported) {
      const list = impByRoom.get(r.room_name) ?? [];
      list.push(r);
      impByRoom.set(r.room_name, list);
    }

    return settings.rooms.map((room): RoomDay => {
      let arrival: { label: string; color: string; note: string | null } | null = null;
      let departure: { label: string; color: string; note: string | null } | null = null;
      let staying: { label: string; color: string; note: string | null } | null = null;

      for (const r of impByRoom.get(room) ?? []) {
        const start = (r.start_date ?? "").slice(0, 10);
        const end = (r.end_date ?? "").slice(0, 10); // checkout day (exclusive night)
        const ch = resolveImportedChannel(settings, r);
        const info = { label: ch.name, color: ch.color || "#64748b", note: r.override_notes ?? null };
        if (todayIso === start) arrival = arrival ?? info;
        else if (todayIso === end) departure = departure ?? info;
        else if (todayIso > start && todayIso < end) staying = staying ?? info;
      }

      const today = cellAt(room, date);
      const yesterday = cellAt(room, prev);
      if (today) {
        const ch = findChannel(settings, today.channelId);
        const info = { label: ch.name, color: ch.color, note: today.note ?? null };
        if (yesterday) staying = staying ?? info;
        else arrival = arrival ?? info;
      } else if (yesterday) {
        const ch = findChannel(settings, yesterday.channelId);
        departure = departure ?? { label: ch.name, color: ch.color, note: yesterday.note ?? null };
      }

      if (arrival && departure) return { room, status: "turnover", ...arrival };
      if (arrival) return { room, status: "checkin", ...arrival };
      if (departure) return { room, status: "checkout", ...departure };
      if (staying) return { room, status: "occupied", ...staying };
      return { room, status: "vacant" };
    });
  }, [date, imported, months, settings]);

  const counts = rows.reduce<Record<DayStatus, number>>(
    (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1 }),
    { turnover: 0, checkin: 0, checkout: 0, occupied: 0, vacant: 0 },
  );


  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <SummaryTile icon={<RefreshCw className="h-4 w-4 shrink-0" />} label="Turnover" value={counts.turnover} tone="text-fuchsia-600 dark:text-fuchsia-400" />
        <SummaryTile icon={<LogIn className="h-4 w-4 shrink-0" />} label="Check-in today" value={counts.checkin} tone="text-emerald-600 dark:text-emerald-400" />
        <SummaryTile icon={<LogOut className="h-4 w-4 shrink-0" />} label="Check-out today" value={counts.checkout} tone="text-amber-600 dark:text-amber-400" />
        <SummaryTile icon={<BedDouble className="h-4 w-4 shrink-0" />} label="Occupied" value={counts.occupied} tone="text-primary" />
        <SummaryTile icon={<DoorOpen className="h-4 w-4 shrink-0" />} label="Vacant" value={counts.vacant} tone="text-muted-foreground" />
      </div>


      <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room</th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channel</th>
              <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.room} className="border-t">
                <td className="px-4 py-3 font-semibold">{r.room}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                <td className="px-4 py-3">
                  {r.label ? (
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ background: r.color, color: pickTextColor(r.color ?? "#64748b") }}
                    >
                      {r.label}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="max-w-[280px] truncate px-4 py-3 text-xs text-muted-foreground">{r.note || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-muted-foreground">No rooms configured.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryTile({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-soft">
      <div className={`flex items-center gap-1.5 text-xs font-medium ${tone}`}>{icon}{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: DayStatus }) {
  const map: Record<DayStatus, { text: string; cls: string; icon: React.ReactNode }> = {
    turnover: { text: "Turnover", cls: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-400", icon: <RefreshCw className="h-3 w-3 shrink-0" /> },
    checkin: { text: "Check-in today", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", icon: <LogIn className="h-3 w-3 shrink-0" /> },
    checkout: { text: "Check-out today", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: <LogOut className="h-3 w-3 shrink-0" /> },
    occupied: { text: "Occupied", cls: "bg-primary/15 text-primary", icon: <BedDouble className="h-3 w-3 shrink-0" /> },
    vacant: { text: "Vacant", cls: "bg-muted text-muted-foreground", icon: <DoorOpen className="h-3 w-3 shrink-0" /> },
  };

  const s = map[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.cls}`}>
      {s.icon}{s.text}
    </span>
  );
}
