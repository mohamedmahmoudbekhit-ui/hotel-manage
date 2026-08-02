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
import { Plus, Trash2, CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, X } from "lucide-react";
import { DailyView } from "@/components/daily-view";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { applyFilters, buildBookingRows, downloadBlob, exportFileBase, exportPdf, toCsv, type ExportFilters } from "@/lib/hotel/export";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { listImportedForMonth, saveImportedOverride, removeImportedReservation, type ImportedReservationRow } from "@/lib/hotel/calendar.functions";


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
  const { currentMonth, settings, updateCell, addBookingRange, hotelName } = useHotel();
  const { t, formatMonthKey } = useI18n();
  const totals = computeMonthTotals(currentMonth, settings.rooms, settings);
  const fetchImported = useServerFn(listImportedForMonth);
  const [imported, setImported] = useState<ImportedReservationRow[]>([]);

  const reloadImported = () => {
    const y = currentMonth.year;
    const m = String(currentMonth.monthIndex + 1).padStart(2, "0");
    const from = `${y}-${m}-01`;
    const to = `${y}-${m}-${String(currentMonth.daysInMonth).padStart(2, "0")}`;
    fetchImported({ data: { from, to } })
      .then(setImported)
      .catch((e) => console.error("Failed to load imported reservations", e));
  };
  useEffect(() => {
    reloadImported();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth.year, currentMonth.monthIndex, currentMonth.daysInMonth]);

  /** Map roomName -> Map<day, { res, position }> for O(1) lookup. */
  const importedByRoomDay = useMemo(() => {
    const map = new Map<string, Map<number, { res: ImportedReservationRow; position: "start" | "middle" | "end" | "single" }>>();
    const toIso = (v: string) => (v ?? "").slice(0, 10);
    for (const r of imported) {
      if (!map.has(r.room_name)) map.set(r.room_name, new Map());
      const roomMap = map.get(r.room_name)!;
      const startIso = toIso(r.start_date);
      const endIso = toIso(r.end_date);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) continue;
      const start = new Date(`${startIso}T00:00:00Z`);
      const end = new Date(`${endIso}T00:00:00Z`);
      // iCal DTEND is checkout day (exclusive). Compute inclusive last night.
      const lastNight = new Date(end);
      lastNight.setUTCDate(lastNight.getUTCDate() - 1);
      if (lastNight < start) continue;
      const d = new Date(start);
      while (d <= lastNight) {
        if (d.getUTCFullYear() === currentMonth.year && d.getUTCMonth() === currentMonth.monthIndex) {
          const day = d.getUTCDate();
          const isFirst = d.getTime() === start.getTime();
          const isLast = d.getTime() === lastNight.getTime();
          const position: "start" | "middle" | "end" | "single" =
            isFirst && isLast ? "single" : isFirst ? "start" : isLast ? "end" : "middle";
          if (!roomMap.has(day)) roomMap.set(day, { res: r, position });
        }
        d.setUTCDate(d.getUTCDate() + 1);
      }
    }
    return map;
  }, [imported, currentMonth.year, currentMonth.monthIndex]);

  const [view, setView] = useState<"month" | "day">("month");
  const [dayIso, setDayIso] = useState<string>(() => {
    const now = new Date();
    const inMonth = now.getFullYear() === currentMonth.year && now.getMonth() === currentMonth.monthIndex;
    const d = inMonth ? now.getDate() : 1;
    return `${currentMonth.year}-${String(currentMonth.monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  });
  const selectedDate = useMemo(() => {
    const [y, m, d] = dayIso.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }, [dayIso]);
  const shiftDay = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setDayIso(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };

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
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setView("month")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === "month" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setView("day")}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === "day" ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Daily
            </button>
          </div>
          <AddBookingDialog
            rooms={settings.rooms}
            channels={settings.channels}
            currency={settings.currency}
            onAdd={(p) => {
              const res = addBookingRange(p);
              if (res.written === 0) {
                toast.error("Could not add booking. Dates may conflict with existing bookings.");
              } else if (res.skipped > 0) {
                toast.success(`Booking added for ${res.written} night(s). ${res.skipped} conflicting night(s) skipped.`);
              } else {
                toast.success(`Booking added across ${res.written} night(s).`);
              }
            }}
          />
          {view === "month" ? (
            <MonthSelector />
          ) : (
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => shiftDay(-1)} title="Previous day">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input type="date" value={dayIso} onChange={(e) => e.target.value && setDayIso(e.target.value)} className="w-[160px]" />
              <Button variant="outline" size="icon" onClick={() => shiftDay(1)} title="Next day">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </header>

      {view === "day" ? (
        <>
          <p className="text-sm text-muted-foreground">
            {selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <DailyView date={selectedDate} imported={imported} />
        </>
      ) : (
      <>
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
                        <ImportedBlock res={importedHere.res} position={importedHere.position} onChanged={reloadImported} currency={settings.currency} />
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
      </>
      )}
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

function ImportedBlock({ res, position, onChanged, currency }: { res: ImportedReservationRow; position: "start" | "middle" | "end" | "single"; onChanged: () => void; currency: string }) {
  const { t } = useI18n();
  const label = PLATFORM_LABEL[res.platform_type] ?? res.source_name;
  const showLabel = position === "start" || position === "single";
  const positionBadge =
    position === "start" ? t("cal.checkIn") ?? "Check-in" :
    position === "end" ? t("cal.checkOut") ?? "Check-out" :
    position === "middle" ? "•" : null;
  const roundedClass =
    position === "single" ? "rounded-lg" :
    position === "start" ? "rounded-s-lg rounded-e-none border-e-0" :
    position === "end" ? "rounded-e-lg rounded-s-none border-s-0" :
    "rounded-none border-s-0 border-e-0";

  const color = res.source_color || "#64748b";
  const textColor = pickTextColor(color);

  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState<string>(res.override_price != null ? String(res.override_price) : "");
  const [notes, setNotes] = useState<string>(res.override_notes ?? "");
  const [saving, setSaving] = useState(false);
  const saveFn = useServerFn(saveImportedOverride);
  const removeFn = useServerFn(removeImportedReservation);

  useEffect(() => {
    if (open) {
      setPrice(res.override_price != null ? String(res.override_price) : "");
      setNotes(res.override_notes ?? "");
    }
  }, [open, res.override_price, res.override_notes]);

  const doSave = async () => {
    setSaving(true);
    try {
      const p = price.trim() === "" ? null : Number(price);
      if (p != null && (!isFinite(p) || p < 0)) { toast.error("Invalid price"); return; }
      await saveFn({ data: { reservation_id: res.id, price: p, notes: notes.trim() ? notes : null } });
      toast.success(t("common.saved") ?? "Saved");
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally { setSaving(false); }
  };

  const doRemove = async () => {
    setSaving(true);
    try {
      await removeFn({ data: { reservation_id: res.id } });
      toast.success("Removed");
      setOpen(false);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setSaving(false); }
  };

  const hasNote = !!res.override_notes;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className={`relative flex h-11 w-full items-center gap-1 border px-2 text-start text-[10px] font-semibold uppercase tracking-wide ${roundedClass}`}
          style={{ backgroundColor: color, color: textColor, borderColor: color }}
        >
          {showLabel ? (
            <>
              <CalendarClock className="h-3 w-3 shrink-0 opacity-80" />
              <span className="truncate">{label}</span>
            </>
          ) : (
            <span className="mx-auto text-[9px] opacity-80">{positionBadge}</span>
          )}
          {hasNote && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-current opacity-90" />
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{res.source_name} · {label}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {res.summary && <div className="text-muted-foreground">{res.summary}</div>}
          <div className="text-xs text-muted-foreground">{res.start_date} → {res.end_date}</div>
          <div className="space-y-1">
            <Label className="text-xs">Price ({currency})</Label>
            <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Internal notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <p className="text-[11px] text-muted-foreground">Color is controlled by the channel in Settings and applies to all its reservations.</p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="destructive" onClick={doRemove} disabled={saving}>
            <Trash2 className="me-1 h-4 w-4" /> Remove
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Discard</Button>
            <Button onClick={doSave} disabled={saving}>Save</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

interface AddBookingParams {
  room: string;
  from: string;
  to: string;
  channelId: string;
  price: number;
  note?: string;
}

function AddBookingDialog({
  rooms,
  channels,
  currency,
  onAdd,
}: {
  rooms: string[];
  channels: Channel[];
  currency: string;
  onAdd: (p: AddBookingParams) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [room, setRoom] = useState<string>(rooms[0] ?? "");
  const [channelId, setChannelId] = useState<string>(channels[0]?.id ?? "");
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);
  const [price, setPrice] = useState<string>("");
  const [note, setNote] = useState<string>("");

  const nights = useMemo(() => {
    const s = new Date(`${from}T00:00:00Z`);
    const e = new Date(`${to}T00:00:00Z`);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
    return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  }, [from, to]);

  const priceNum = parseFloat(price) || 0;
  const perNight = nights > 0 ? priceNum / nights : 0;
  const selectedChannel = channels.find((c) => c.id === channelId) ?? channels[0];
  const channelCurrency = selectedChannel?.currency === "LOCAL" ? currency : "USD";

  const reset = () => {
    setRoom(rooms[0] ?? "");
    setChannelId(channels[0]?.id ?? "");
    setFrom(today);
    setTo(today);
    setPrice("");
    setNote("");
  };

  const submit = () => {
    if (!room || !channelId) return;
    if (nights <= 0) return;
    if (!(priceNum > 0)) return;
    onAdd({
      room,
      from,
      to,
      channelId,
      price: priceNum,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <CalendarPlus className="h-4 w-4" /> Add booking
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add booking</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Room</Label>
            <Select value={room} onValueChange={setRoom}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {rooms.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Channel</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {channels.map((ch) => (
                  <SelectItem key={ch.id} value={ch.id}>
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: ch.color }} />
                      {ch.name} · {ch.currency === "LOCAL" ? currency : "USD"}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Total price ({channelCurrency})</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
            />
            {nights > 0 && priceNum > 0 && (
              <p className="text-[10px] text-muted-foreground">
                {nights} night{nights === 1 ? "" : "s"} · {perNight.toFixed(2)} {channelCurrency} / night
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!room || !channelId || nights <= 0 || !(priceNum > 0)}>Save booking</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
