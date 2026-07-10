import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useHotel } from "@/lib/hotel/store";
import { MonthSelector } from "@/components/month-selector";
import { cellRevenueLocal, computeMonthTotals, findChannel, formatCurrency, pickTextColor } from "@/lib/hotel/utils";
import type { Cell, Channel } from "@/lib/hotel/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, CalendarClock } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { listImportedForMonth, type ImportedReservationRow } from "@/lib/hotel/calendar.functions";

export const Route = createFileRoute("/_authenticated/bookings")({

  head: () => ({
    meta: [
      { title: "Bookings — Hotel Management" },
      { name: "description", content: "Monthly bookings grid with per-channel colors, prices and notes." },
    ],
  }),
  component: BookingsPage,
});

function channelLabel(ch: Channel, currency: string): string {
  return `${ch.name} · ${ch.currency === "LOCAL" ? currency : "USD"}`;
}

function BookingsPage() {
  const { currentMonth, settings, updateCell } = useHotel();
  const { t, formatMonthKey } = useI18n();
  const totals = computeMonthTotals(currentMonth, settings.rooms, settings);
  const fetchImported = useServerFn(listImportedForMonth);
  const [imported, setImported] = useState<ImportedReservationRow[]>([]);

  useEffect(() => {
    const y = currentMonth.year;
    const m = String(currentMonth.monthIndex + 1).padStart(2, "0");
    const from = `${y}-${m}-01`;
    const to = `${y}-${m}-${String(currentMonth.daysInMonth).padStart(2, "0")}`;
    fetchImported({ data: { from, to } })
      .then(setImported)
      .catch((e) => console.error("Failed to load imported reservations", e));
  }, [currentMonth.year, currentMonth.monthIndex, currentMonth.daysInMonth, fetchImported]);

  /** Map roomName -> Map<day, ImportedReservationRow> for O(1) lookup. */
  const importedByRoomDay = useMemo(() => {
    const map = new Map<string, Map<number, ImportedReservationRow>>();
    for (const r of imported) {
      if (!map.has(r.room_name)) map.set(r.room_name, new Map());
      const roomMap = map.get(r.room_name)!;
      const start = new Date(`${r.start_date}T00:00:00Z`);
      const end = new Date(`${r.end_date}T00:00:00Z`);
      const d = new Date(start);
      while (d < end) {
        if (d.getUTCFullYear() === currentMonth.year && d.getUTCMonth() === currentMonth.monthIndex) {
          const day = d.getUTCDate();
          if (!roomMap.has(day)) roomMap.set(day, r);
        }
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    return map;
  }, [imported, currentMonth.year, currentMonth.monthIndex]);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{t("bookings.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMonthKey(currentMonth.key)} · <span className="text-foreground">{totals.bookingsCount}</span> {t("common.bookings")} ·{" "}
            <span className="text-foreground">{formatCurrency(totals.totalRevenue, settings.currency)}</span>
          </p>
        </div>
        <MonthSelector />
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-xs">
        {settings.channels.map((ch) => (
          <div key={ch.id} className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ch.color }} />
            <span className="text-muted-foreground">{ch.name}</span>
          </div>
        ))}
        {imported.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="inline-flex h-2.5 w-2.5 items-center justify-center rounded-full border border-dashed border-foreground/40" />
            <span className="text-muted-foreground">{t("cal.importedBadge")}</span>
          </div>
        )}
        <span className="ms-auto text-muted-foreground">{t("common.tapCell")}</span>
      </div>

      <div className="rounded-2xl border bg-card shadow-soft">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-14 z-20 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/75">
            <tr>
              <th className="sticky start-0 z-20 bg-muted/80 px-3 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("bookings.day")}</th>
              {settings.rooms.map((r) => (
                <th key={r} className="px-3 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: currentMonth.daysInMonth }, (_, i) => i + 1).map((day) => (
              <tr key={day} className="group">
                <td className="sticky start-0 z-10 border-t bg-card px-3 py-2 text-xs font-semibold text-muted-foreground group-hover:bg-muted/40">{day}</td>
                {settings.rooms.map((room) => {
                  const cell = currentMonth.cells[room]?.[day] ?? null;
                  const importedHere = !cell ? importedByRoomDay.get(room)?.get(day) ?? null : null;
                  return (
                    <td key={room} className="border-t p-1.5 align-top">
                      {importedHere ? (
                        <ImportedBlock res={importedHere} />
                      ) : (
                        <CellEditor
                          cell={cell}
                          onSave={(c) => updateCell(room, day, c)}
                          onDelete={() => updateCell(room, day, null)}
                          usdRate={currentMonth.usdRate}
                          channels={settings.channels}
                          currency={settings.currency}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>

            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PLATFORM_LABEL: Record<string, string> = {
  airbnb: "Airbnb",
  booking: "Booking.com",
  vrbo: "Vrbo",
  direct: "Direct",
  other: "iCal",
};

function ImportedBlock({ res }: { res: ImportedReservationRow }) {
  const { t } = useI18n();
  const label = PLATFORM_LABEL[res.platform_type] ?? res.source_name;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex h-11 w-full items-center gap-1 rounded-lg border border-dashed border-foreground/30 bg-muted/50 px-2 text-start text-[10px] font-semibold uppercase tracking-wide text-foreground/80 hover:bg-muted"
          style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent 0 4px, hsl(var(--muted-foreground)/0.08) 4px 8px)" }}
        >
          <CalendarClock className="h-3 w-3 shrink-0 opacity-60" />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <div className="space-y-1 text-xs">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("cal.importedFrom")}</div>
          <div className="font-semibold">{res.source_name} · {label}</div>
          {res.summary && <div className="text-muted-foreground">{res.summary}</div>}
          <div className="pt-1 text-muted-foreground">{res.start_date} → {res.end_date}</div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CellEditor({
  cell,

  onSave,
  onDelete,
  usdRate,
  channels,
  currency,
}: {
  cell: Cell | null;
  onSave: (c: Cell) => void;
  onDelete: () => void;
  usdRate: number;
  channels: Channel[];
  currency: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const defaultChannel = channels[0]?.id ?? "offline";
  const [price, setPrice] = useState(cell?.price.toString() ?? "");
  const [channelId, setChannelId] = useState<string>(cell?.channelId ?? defaultChannel);
  const [note, setNote] = useState<string>(cell?.note ?? "");

  const reset = () => {
    setPrice(cell?.price.toString() ?? "");
    setChannelId(cell?.channelId ?? defaultChannel);
    setNote(cell?.note ?? "");
  };

  const save = () => {
    const p = parseFloat(price);
    if (!isFinite(p) || p <= 0) return;
    const trimmedNote = note.trim();
    onSave({ price: p, channelId, ...(trimmedNote ? { note: trimmedNote } : {}) });
    setOpen(false);
  };

  const cellChannel = cell ? findChannel({ channels } as never, cell.channelId) : null;
  const editorChannel = findChannel({ channels } as never, channelId);
  const fg = cellChannel ? pickTextColor(cellChannel.color) : "#fff";

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <PopoverTrigger asChild>
        {cell && cellChannel ? (
          <button
            className="relative w-full rounded-lg border px-2 py-1.5 text-start text-xs font-medium shadow-sm transition hover:opacity-90"
            style={{ background: cellChannel.color, color: fg, borderColor: cellChannel.color }}
          >
            {cell.note && (
              <span
                aria-label="has note"
                className="absolute end-1 top-1 h-2 w-2 rounded-full ring-2"
                style={{ background: fg, boxShadow: `0 0 0 2px ${cellChannel.color}` }}
              />
            )}
            <div className="flex items-center justify-between gap-1">
              <span className="font-bold tabular-nums">{cell.price}</span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                style={{ background: `${fg}25` }}
              >
                {cellChannel.currency === "LOCAL" ? currency : "USD"}
              </span>
            </div>
            <div className="mt-0.5 truncate text-[10px] opacity-90">
              {cellChannel.name}
            </div>
          </button>
        ) : (
          <button className="flex h-11 w-full items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground/60 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="price" className="text-xs">{t("bookings.price")}</Label>
            <Input
              id="price"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
            <p className="text-[10px] text-muted-foreground">
              {editorChannel.currency === "LOCAL"
                ? `${t("bookings.inCurrency")} ${currency}`
                : `${t("bookings.inUsd")} (× ${usdRate} = ${(parseFloat(price) * usdRate || 0).toFixed(0)} ${currency})`}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t("bookings.channel")}</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: ch.color }} />
                      {channelLabel(ch, currency)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note" className="text-xs">{t("bookings.note")}</Label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("bookings.notePlaceholder")}
              rows={3}
            />
          </div>
          {parseFloat(price) > 0 && (
            <div className="rounded-md bg-muted p-2 text-xs">
              {t("bookings.revenue")}: <span className="font-semibold">
                {formatCurrency(
                  cellRevenueLocal({ price: parseFloat(price) || 0, channelId }, usdRate, { channels } as never),
                  currency,
                )}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            {cell ? (
              <Button variant="ghost" size="sm" onClick={() => { onDelete(); setOpen(false); }} className="text-destructive hover:text-destructive">
                <Trash2 className="me-1 h-3.5 w-3.5" /> {t("common.remove")}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
              <Button size="sm" onClick={save}>{t("common.save")}</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
