import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useHotel } from "@/lib/hotel/store";
import { MonthSelector } from "@/components/month-selector";
import { cellRevenueLocal, cellStatus, computeMonthTotals, findChannel, formatCurrency, nightsBetween, pickTextColor, resolveImportedChannel, slotCells } from "@/lib/hotel/utils";
import type { BookingStatus, Cell, Channel, RefundDirection } from "@/lib/hotel/types";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, CalendarClock, CalendarPlus, ChevronLeft, ChevronRight, Download, FileSpreadsheet, FileText, X } from "lucide-react";
import { DailyView } from "@/components/daily-view";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { applyFilters, buildBookingRows, downloadBlob, exportFileBase, exportPdf, toCsv, type ExportFilters } from "@/lib/hotel/export";

import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import { saveImportedOverride, removeImportedReservation, type ImportedReservationRow } from "@/lib/hotel/calendar.functions";


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
  const {
    currentMonth, settings, updateCell, updateBooking, addBookingRange, hotelName,
    refundOf, setBookingStatus, statusOf,
    imported: allImported, reloadImported, analyticsMonth, analyticsSettings,
  } = useHotel();
  const { t, formatMonthKey } = useI18n();
  // Totals include imported iCal reservations, exactly like manual bookings.
  const totals = computeMonthTotals(analyticsMonth, settings.rooms, analyticsSettings);

  /** Imported reservations overlapping the displayed month. */
  const imported = useMemo(() => {
    const from = `${currentMonth.year}-${String(currentMonth.monthIndex + 1).padStart(2, "0")}-01`;
    const to = `${currentMonth.year}-${String(currentMonth.monthIndex + 1).padStart(2, "0")}-${String(currentMonth.daysInMonth).padStart(2, "0")}`;
    return allImported.filter((r) => (r.start_date ?? "").slice(0, 10) <= to && (r.end_date ?? "").slice(0, 10) > from);
  }, [allImported, currentMonth.year, currentMonth.monthIndex, currentMonth.daysInMonth]);

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

  /**
   * Stable vertical lane per booking, per room, for the whole month, so a
   * booking keeps the same row inside its cell on every one of its nights and
   * never visually crosses another booking.
   */
  const lanesByRoom = useMemo(() => {
    const byRoom = new Map<string, Map<string, number>>();
    for (const room of settings.rooms) {
      const spans = new Map<string, { start: number; end: number }>();
      for (let d = 1; d <= currentMonth.daysInMonth; d++) {
        slotCells(currentMonth.cells[room]?.[d]).forEach((c, i) => {
          const key = c.bookingId ?? `d${d}-${i}`;
          const cur = spans.get(key);
          if (cur) cur.end = d;
          else spans.set(key, { start: d, end: d });
        });
      }
      const intervals = Array.from(spans, ([key, v]) => ({ key, ...v })).sort(
        (a, b) => a.start - b.start || a.end - b.end || a.key.localeCompare(b.key),
      );
      const laneEnd: number[] = [];
      const lanes = new Map<string, number>();
      for (const it of intervals) {
        let lane = laneEnd.findIndex((e) => e < it.start);
        if (lane === -1) lane = laneEnd.length;
        laneEnd[lane] = it.end;
        lanes.set(it.key, lane);
      }
      byRoom.set(room, lanes);
    }
    return byRoom;
  }, [currentMonth.cells, currentMonth.daysInMonth, settings.rooms]);



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

  // ---- Filters (apply to the grid and to exports) ----
  const monthStart = `${currentMonth.year}-${String(currentMonth.monthIndex + 1).padStart(2, "0")}-01`;
  const monthEnd = `${currentMonth.year}-${String(currentMonth.monthIndex + 1).padStart(2, "0")}-${String(currentMonth.daysInMonth).padStart(2, "0")}`;
  const [filters, setFilters] = useState<ExportFilters>({ from: monthStart, to: monthEnd, sourceKey: "all", room: "all" });
  useEffect(() => {
    setFilters((f) => ({ ...f, from: monthStart, to: monthEnd }));
  }, [monthStart, monthEnd]);

  const importedSources = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of imported) map.set(r.source_id, r.source_name);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [imported]);

  const filtersActive =
    filters.from !== monthStart || filters.to !== monthEnd || filters.sourceKey !== "all" || filters.room !== "all";

  const visibleRooms = filters.room === "all" ? settings.rooms : settings.rooms.filter((r) => r === filters.room);
  const visibleDays = useMemo(() => {
    const all = Array.from({ length: currentMonth.daysInMonth }, (_, i) => i + 1);
    return all.filter((d) => {
      const iso = `${currentMonth.year}-${String(currentMonth.monthIndex + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (filters.from && iso < filters.from) return false;
      if (filters.to && iso > filters.to) return false;
      return true;
    });
  }, [currentMonth.daysInMonth, currentMonth.year, currentMonth.monthIndex, filters.from, filters.to]);

  const exportRows = useMemo(
    () => applyFilters(buildBookingRows(currentMonth, settings, imported), filters),
    [currentMonth, settings, imported, filters],
  );

  const periodLabel = `${formatMonthKey(currentMonth.key)}${filtersActive && (filters.from !== monthStart || filters.to !== monthEnd) ? ` (${filters.from} → ${filters.to})` : ""}`;
  const filterSummary = [
    filters.room !== "all" ? `Room: ${filters.room}` : null,
    filters.sourceKey !== "all"
      ? `Source: ${settings.channels.find((c) => c.id === filters.sourceKey)?.name ?? importedSources.find((s) => s.id === filters.sourceKey)?.name ?? filters.sourceKey}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const doExportCsv = () => {
    if (exportRows.length === 0) { toast.error("No bookings match the current filters."); return; }
    downloadBlob(toCsv(exportRows, settings.currency), `${exportFileBase(currentMonth)}.csv`, "text/csv;charset=utf-8;");
    toast.success(`Exported ${exportRows.length} booking(s) to CSV.`);
  };

  const doExportPdf = async () => {
    if (exportRows.length === 0) { toast.error("No bookings match the current filters."); return; }
    try {
      await exportPdf({
        rows: exportRows,
        hotelName,
        currency: settings.currency,
        periodLabel,
        filterSummary,
        filename: `${exportFileBase(currentMonth)}.pdf`,
      });
      toast.success(`Exported ${exportRows.length} booking(s) to PDF.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to generate PDF");
    }
  };


  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">{t("bookings.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMonthKey(currentMonth.key)} · <span className="text-foreground">{totals.bookingsCount}</span> {t("common.bookings")} ·{" "}
            <span className="text-foreground">{formatCurrency(totals.totalRevenue, settings.currency)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex shrink-0 rounded-lg border bg-muted/40 p-0.5">
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
            monthYear={currentMonth.year}
            monthIndex={currentMonth.monthIndex}

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Download className="h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => doExportCsv()}>
                <FileSpreadsheet className="me-2 h-4 w-4" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => { void doExportPdf(); }}>
                <FileText className="me-2 h-4 w-4" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {view === "month" ? (
            <MonthSelector />
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none">
              <Button variant="outline" size="icon" className="shrink-0" onClick={() => shiftDay(-1)} title="Previous day">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input type="date" value={dayIso} onChange={(e) => e.target.value && setDayIso(e.target.value)} className="min-w-0 flex-1 sm:w-[160px] sm:flex-none" />
              <Button variant="outline" size="icon" className="shrink-0" onClick={() => shiftDay(1)} title="Next day">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </header>

      <div className="grid grid-cols-2 items-end gap-3 rounded-xl border bg-card p-3 sm:flex sm:flex-wrap">
        <div className="min-w-0 space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</Label>
          <Input type="date" value={filters.from} className="h-9 w-full sm:w-[150px]" onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</Label>
          <Input type="date" value={filters.to} min={filters.from} className="h-9 w-full sm:w-[150px]" onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Source</Label>
          <Select value={filters.sourceKey} onValueChange={(v) => setFilters((f) => ({ ...f, sourceKey: v }))}>
            <SelectTrigger className="h-9 w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {settings.channels.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>{ch.name}</SelectItem>
              ))}
              {importedSources.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-0 space-y-1">
          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Room</Label>
          <Select value={filters.room} onValueChange={(v) => setFilters((f) => ({ ...f, room: v }))}>
            <SelectTrigger className="h-9 w-full sm:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All rooms</SelectItem>
              {settings.rooms.map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 flex items-center gap-2 text-xs text-muted-foreground sm:ms-auto">
          <span><span className="font-semibold text-foreground">{exportRows.length}</span> booking(s) match</span>
          {filtersActive && (
            <Button variant="ghost" size="sm" onClick={() => setFilters({ from: monthStart, to: monthEnd, sourceKey: "all", room: "all" })}>
              <X className="me-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>



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

      <div className="max-h-[70vh] overflow-auto overscroll-contain rounded-2xl border bg-card shadow-soft">
        <table className="w-full min-w-max border-separate border-spacing-0 text-sm">

          <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/75">
            <tr>
              <th className="sticky start-0 z-30 w-12 bg-muted px-2 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:px-3">{t("bookings.day")}</th>
              {visibleRooms.map((r) => (
                <th key={r} className="min-w-[140px] bg-muted/95 px-3 py-3 text-start text-xs font-semibold uppercase tracking-wider text-muted-foreground">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleDays.map((day) => (
              <tr key={day} className="group">
                <td className="sticky start-0 z-10 border-t bg-card px-2 py-2 text-xs font-semibold text-muted-foreground group-hover:bg-muted/40 sm:px-3">{day}</td>
                {visibleRooms.map((room) => {
                  // A night can hold more than one booking (e.g. a replacement
                  // after a no-show); each is rendered as its own block.
                  const list = slotCells(currentMonth.cells[room]?.[day]);
                  const importedHere = list.length === 0 ? importedByRoomDay.get(room)?.get(day) ?? null : null;
                  const matchesSource =
                    filters.sourceKey === "all" ||
                    (importedHere
                      ? importedHere.res.source_id === filters.sourceKey
                      : list.length > 0
                        ? list.some((c) => c.channelId === filters.sourceKey)
                        : true);
                  const prev = slotCells(currentMonth.cells[room]?.[day - 1]);
                  const next = slotCells(currentMonth.cells[room]?.[day + 1]);
                  return (
                    <td key={room} className={`border-t px-1.5 py-0 align-top ${matchesSource ? "" : "opacity-25"}`}>
                      {importedHere ? (
                        <ImportedBlock res={importedHere.res} channel={resolveImportedChannel(analyticsSettings, importedHere.res)} position={importedHere.position} onChanged={reloadImported} currency={settings.currency} />
                      ) : list.length === 0 ? (
                        <CellEditor
                          cell={null}
                          position="single"
                          onSave={(c) => updateCell(room, day, c)}
                          onDelete={() => updateCell(room, day, null)}
                          usdRate={currentMonth.usdRate}
                          channels={settings.channels}
                          currency={settings.currency}
                        />
                      ) : (
                        <div className="flex flex-col gap-1">
                          {(() => {
                            // Place each booking on its stable month-long lane so
                            // consecutive bookings never intersect visually.
                            const lanes = lanesByRoom.get(room);
                            const slots: ({ c: Cell; i: number } | null)[] = [];
                            list.forEach((c, i) => {
                              const key = c.bookingId ?? `d${day}-${i}`;
                              let lane = lanes?.get(key) ?? i;
                              while (slots[lane]) lane += 1;
                              slots[lane] = { c, i };
                            });
                            return slots.map((slot, lane) => {
                              if (!slot) return <div key={`gap-${lane}`} className="h-11" aria-hidden />;
                              const { c, i } = slot;
                              // Only nights of the SAME reservation connect vertically.
                              const contPrev = !!c.bookingId && prev.some((p) => p.bookingId === c.bookingId);
                              const contNext = !!c.bookingId && next.some((n) => n.bookingId === c.bookingId);
                              const position: "start" | "middle" | "end" | "single" =
                                !contPrev && !contNext ? "single" : !contPrev ? "start" : !contNext ? "end" : "middle";
                              return (
                                <CellEditor
                                  key={c.bookingId ?? i}
                                  cell={c}
                                  position={position}
                                  onSave={(nc) => updateCell(room, day, nc, c.bookingId)}
                                  onUpdateBooking={(patch) => c.bookingId && updateBooking(c.bookingId, patch)}
                                  refund={c.bookingId ? refundOf(c.bookingId) : null}
                                  status={c.bookingId ? statusOf(c.bookingId) : cellStatus(c)}
                                  onSetStatus={(st, r) => c.bookingId && setBookingStatus(c.bookingId, st, r)}
                                  onDelete={() => updateCell(room, day, null, c.bookingId)}
                                  usdRate={currentMonth.usdRate}
                                  channels={settings.channels}
                                  currency={settings.currency}
                                />
                              );
                            });
                          })()}
                        </div>
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

function ImportedBlock({ res, channel, position, onChanged, currency, trigger }: { res: ImportedReservationRow; channel: Channel; position: "start" | "middle" | "end" | "single"; onChanged: () => void; currency: string; trigger?: React.ReactNode }) {
  const { settings } = useHotel();
  const { t } = useI18n();
  const label = channel.name || PLATFORM_LABEL[res.platform_type] || res.source_name;
  const channelCurrency = channel.currency === "LOCAL" ? currency : "USD";
  const showLabel = position === "start" || position === "single";
  const positionBadge =
    position === "start" ? t("cal.checkIn") ?? "Check-in" :
    position === "end" ? t("cal.checkOut") ?? "Check-out" :
    position === "middle" ? "•" : null;
  const roundedClass = blockRounding(position);
  const resNights = nightsBetween(res.start_date, res.end_date);
  const nightly =
    res.override_price != null && resNights > 0 ? res.override_price / resNights : null;


  const color = channel.color || res.source_color || "#64748b";
  const textColor = pickTextColor(color);

  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState<string>(res.override_price != null ? String(res.override_price) : "");
  const [notes, setNotes] = useState<string>(res.override_notes ?? "");
  const [channelId, setChannelId] = useState(res.override_channel_id ?? res.channel_id ?? "");
  const [status, setStatus] = useState<BookingStatus>(res.status ?? "confirmed");
  const [refundDirection, setRefundDirection] = useState<RefundDirection | "">(res.refund_direction ?? "");
  const [refundAmount, setRefundAmount] = useState<string>(res.refund_amount != null ? String(res.refund_amount) : "");
  const [saving, setSaving] = useState(false);
  const saveFn = useServerFn(saveImportedOverride);
  const removeFn = useServerFn(removeImportedReservation);

  useEffect(() => {
    if (open) {
      setPrice(res.override_price != null ? String(res.override_price) : "");
      setNotes(res.override_notes ?? "");
      setChannelId(res.override_channel_id ?? res.channel_id ?? "");
      setStatus(res.status ?? "confirmed");
      setRefundDirection(res.refund_direction ?? "");
      setRefundAmount(res.refund_amount != null ? String(res.refund_amount) : "");
    }
  }, [open, res.override_price, res.override_notes, res.override_channel_id, res.channel_id, res.status, res.refund_direction, res.refund_amount]);

  const doSave = async () => {
    setSaving(true);
    try {
      const p = price.trim() === "" ? null : Number(price);
      if (p != null && (!isFinite(p) || p < 0)) { toast.error("Invalid price"); return; }
      const refundNum = parseFloat(refundAmount);
      if (status === "refunded" && (refundDirection === "" || !isFinite(refundNum) || refundNum <= 0)) {
        toast.error("Enter a refund direction and a positive refund amount.");
        return;
      }
      await saveFn({
        data: {
          reservation_id: res.id,
          price: p,
          notes: notes.trim() ? notes : null,
          channel_id: channelId || null,
          status,
          refund_direction: status === "refunded" && refundDirection !== "" ? refundDirection : null,
          refund_amount: status === "refunded" ? refundNum : null,
        },
      });
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
    <BookingSheet
      open={open}
      onOpenChange={setOpen}
      title={`${res.source_name} · ${label}`}
      trigger={
        trigger ?? (
        <button
          className={`relative flex h-11 w-full flex-col justify-center border-2 px-2 text-start ${roundedClass}`}
          style={{ backgroundColor: color, color: textColor, borderColor: blockOutline(textColor) }}
        >
          <span className="flex items-center gap-1 truncate text-[10px] font-semibold uppercase tracking-wide opacity-90">
            {showLabel ? (
              <>
                <CalendarClock className="h-3 w-3 shrink-0 opacity-80" />
                <span className="truncate">{label}</span>
              </>
            ) : (
              <span className="truncate">{positionBadge}</span>
            )}
          </span>
          {res.status === "refunded" ? (
            <span className="truncate text-xs font-bold">Refunded</span>
          ) : nightly != null ? (
            <span className="truncate text-xs font-bold tabular-nums">
              {nightly.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              <span className="ms-1 text-[9px] font-semibold opacity-80">{channelCurrency}</span>
            </span>
          ) : null}
          {hasNote && (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-current opacity-90" />
          )}
        </button>
        )
      }
      footer={
        <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button variant="destructive" onClick={doRemove} disabled={saving}>
            <Trash2 className="me-1 h-4 w-4" /> Remove
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Discard</Button>
            <Button onClick={doSave} disabled={saving}>Save</Button>
          </div>
        </div>
      }
    >
        <div className="space-y-3 text-sm">
          {res.summary && <div className="text-muted-foreground">{res.summary}</div>}
          <div className="text-xs text-muted-foreground">
            {res.start_date} → {res.end_date} · {nightsBetween(res.start_date, res.end_date)} night(s)
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Booking source</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
              <SelectContent>{settings.channels.map((ch) => <SelectItem key={ch.id} value={ch.id}>{channelLabel(ch, currency)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Total price ({channelCurrency})</Label>
            <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Internal notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
          <StatusFields
            status={status}
            setStatus={setStatus}
            direction={refundDirection}
            setDirection={setRefundDirection}
            amount={refundAmount}
            setAmount={setRefundAmount}
            currencyLabel={channelCurrency}
          />

          <p className="text-[11px] text-muted-foreground">
            Color and currency are inherited from the “{channel.name}” channel in Settings. The total price is split evenly across the stayed nights (check-out day excluded).
          </p>
        </div>
    </BookingSheet>
  );
}


function blockRounding(position: "start" | "middle" | "end" | "single") {
  return position === "single"
    ? "rounded-lg"
    : position === "start"
      ? "rounded-t-lg rounded-b-none border-b-0"
      : position === "end"
        ? "rounded-b-lg rounded-t-none border-t-0"
        : "rounded-none border-y-0";
}

/** Contrasting outline so each booking block reads as one bordered unit. */
function blockOutline(fg: string) {
  return fg.toLowerCase() === "#fff" || fg.toLowerCase() === "#ffffff"
    ? "rgba(255,255,255,0.65)"
    : "rgba(0,0,0,0.45)";
}

/**
 * Booking details container: right-side drawer on desktop/tablet, bottom
 * sheet on mobile. Presentation only — the form inside is unchanged.
 */
function BookingSheet({
  open,
  onOpenChange,
  title,
  trigger,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const isMobile = useIsMobile();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "flex max-w-full flex-col overflow-x-hidden p-0",
          isMobile
            ? "inset-x-0 h-auto max-h-[92dvh] w-full rounded-t-2xl"
            : "h-full w-full sm:max-w-md",
        )}
      >
        <SheetHeader className="shrink-0 border-b px-4 py-4 text-left sm:px-6">
          <SheetTitle className="pr-8 break-words">{title}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 py-4 sm:px-6 [&_*]:max-w-full">
          {children}
        </div>
        {footer ? (
          <SheetFooter className="shrink-0 gap-2 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 [&>*]:w-full sm:[&>*]:w-auto">
            {footer}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export const STATUS_OPTIONS: { value: BookingStatus; label: string }[] = [
  { value: "confirmed", label: "Confirmed" },
  { value: "canceled", label: "Canceled" },
  { value: "noshow", label: "No Show / Early Departure" },
  { value: "refunded", label: "Canceled with Refund" },
];

/** Single Status dropdown (+ refund details) shared by every booking editor. */
function StatusFields({
  status,
  setStatus,
  direction,
  setDirection,
  amount,
  setAmount,
  currencyLabel,
}: {
  status: BookingStatus;
  setStatus: (v: BookingStatus) => void;
  direction: RefundDirection | "";
  setDirection: (v: RefundDirection) => void;
  amount: string;
  setAmount: (v: string) => void;
  currencyLabel: string;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-2">
      <div className="space-y-1">
        <Label className="text-xs">Status</Label>
        <Select value={status} onValueChange={(v) => setStatus(v as BookingStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {status === "refunded" && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Refund direction</Label>
            <div className="flex gap-2">
              {(["to_guest", "to_host"] as const).map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={direction === d ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setDirection(d)}
                >
                  {d === "to_guest" ? "To Guest" : "To Host"}
                </Button>
              ))}
            </div>
          </div>
          {direction !== "" && (
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Refund amount ({currencyLabel})</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function CellEditor({
  cell,
  position = "single",
  onSave,
  onUpdateBooking,
  onSetStatus,
  status: bookingStatus = "confirmed",
  refund,
  onDelete,
  usdRate,
  channels,
  currency,
  trigger,
}: {
  cell: Cell | null;
  position?: "start" | "middle" | "end" | "single";
  onSave: (c: Cell) => void;
  onUpdateBooking?: (patch: Partial<Pick<Cell, "channelId" | "note" | "guestName">>) => void;
  onSetStatus?: (status: BookingStatus, refund?: { direction: RefundDirection; amount: number } | null) => void;
  status?: BookingStatus;
  refund?: { direction: RefundDirection; amount: number } | null;
  onDelete: () => void;
  usdRate: number;
  channels: Channel[];
  currency: string;
  /** Optional custom trigger (mobile calendar day cells). */
  trigger?: React.ReactNode;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const defaultChannel = channels[0]?.id ?? "offline";
  const [price, setPrice] = useState(cell?.price.toString() ?? "");
  const [channelId, setChannelId] = useState<string>(cell?.channelId ?? defaultChannel);
  const [note, setNote] = useState<string>(cell?.note ?? "");
  const [guestName, setGuestName] = useState<string>(cell?.guestName ?? "");
  const [status, setStatus] = useState<BookingStatus>(bookingStatus);
  const [refundDirection, setRefundDirection] = useState<RefundDirection | "">(refund?.direction ?? cell?.refundDirection ?? "");
  const [refundAmount, setRefundAmount] = useState<string>(
    refund?.amount != null ? String(refund.amount) : cell?.refundAmount != null ? String(cell.refundAmount) : "",
  );

  const reset = () => {
    setPrice(cell?.price.toString() ?? "");
    setChannelId(cell?.channelId ?? defaultChannel);
    setNote(cell?.note ?? "");
    setGuestName(cell?.guestName ?? "");
    setStatus(bookingStatus);
    setRefundDirection(refund?.direction ?? cell?.refundDirection ?? "");
    setRefundAmount(refund?.amount != null ? String(refund.amount) : cell?.refundAmount != null ? String(cell.refundAmount) : "");
  };

  const refundNum = parseFloat(refundAmount);
  const refundValid = status !== "refunded" || (refundDirection !== "" && isFinite(refundNum) && refundNum > 0);

  const save = () => {
    const p = parseFloat(price);
    if (!isFinite(p) || p <= 0) return;
    if (!refundValid) { toast.error("Enter a refund direction and a positive refund amount."); return; }
    const trimmedNote = note.trim();
    const patch = { channelId, note: trimmedNote || undefined, guestName: guestName.trim() || undefined };
    const refundPayload = status === "refunded" && refundDirection !== "" ? { direction: refundDirection, amount: refundNum } : null;
    if (cell?.bookingId && onSetStatus) {
      // Price/channel/notes first, then the status for the whole booking so
      // the refund share is recomputed once, never duplicated.
      onSave({ price: p, ...patch, ...(cell.status ? { status: cell.status } : {}) });
      if (onUpdateBooking) onUpdateBooking(patch);
      onSetStatus(status, refundPayload);
    } else {
      onSave({
        price: p,
        ...patch,
        ...(status !== "confirmed" ? { status } : {}),
        ...(refundPayload
          ? { refundDirection: refundPayload.direction, refundAmount: refundPayload.amount }
          : {}),
      });
    }
    setOpen(false);
  };

  const cellChannel = cell ? findChannel({ channels } as never, cell.channelId) : null;
  const editorChannel = findChannel({ channels } as never, channelId);
  const fg = cellChannel ? pickTextColor(cellChannel.color) : "#fff";
  const showLabel = position === "start" || position === "single";
  const nightly = cell && isFinite(cell.price) && cell.price > 0 ? cell.price : null;
  const editorCurrency = editorChannel.currency === "LOCAL" ? currency : "USD";


  return (
    <BookingSheet
      open={open}
      onOpenChange={(o) => { setOpen(o); if (o) reset(); }}
      title={cell ? "Booking details" : "Add booking"}
      trigger={
        trigger ?? (
        cell && cellChannel ? (
          <button
            className={`relative flex h-11 w-full flex-col justify-center border-2 px-2 text-start shadow-sm transition hover:opacity-90 ${blockRounding(position)}`}
            style={{ background: cellChannel.color, color: fg, borderColor: blockOutline(fg) }}
          >

            {cell.note && (
              <span
                aria-label="has note"
                className="absolute end-1 top-1 h-2 w-2 rounded-full"
                style={{ background: fg, boxShadow: `0 0 0 2px ${cellChannel.color}` }}
              />
            )}
            <span className="truncate text-[10px] font-semibold uppercase tracking-wide opacity-90">
              {showLabel
                ? cellChannel.name
                : position === "end"
                  ? t("cal.checkOut") ?? "Last night"
                  : "•"}
            </span>
            {cellStatus(cell) === "refunded" ? (
              <span className="truncate text-xs font-bold">Refunded</span>
            ) : nightly != null ? (
              <span className="truncate text-xs font-bold tabular-nums">
                {nightly.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                <span className="ms-1 text-[9px] font-semibold opacity-80">
                  {cellChannel.currency === "LOCAL" ? currency : "USD"}
                </span>
              </span>
            ) : null}
          </button>
        ) : (
          <button className="my-1 flex h-9 w-full items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground/60 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
            <Plus className="h-3.5 w-3.5" />
          </button>
        ))
      }
    >
        <div className="space-y-3">

          <div className="space-y-1.5">
            <Label className="text-xs">Guest name</Label>
            <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Optional" />
          </div>
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
          <StatusFields
            status={status}
            setStatus={setStatus}
            direction={refundDirection}
            setDirection={setRefundDirection}
            amount={refundAmount}
            setAmount={setRefundAmount}
            currencyLabel={editorCurrency}
          />
          {parseFloat(price) > 0 && status !== "refunded" && status !== "canceled" && (
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
    </BookingSheet>

  );
}

interface AddBookingParams {
  room: string;
  from: string;
  to: string;
  channelId: string;
  price: number;
  note?: string;
  guestName?: string;
  allowOverlap?: boolean;
  status?: BookingStatus;
  refund?: { direction: RefundDirection; amount: number } | null;
}

/** ISO date one day after the given ISO date. */
function nextDayIso(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function AddBookingDialog({
  rooms,
  channels,
  currency,
  monthYear,
  monthIndex,
  onAdd,
  trigger,
  defaultRoom,
  defaultFrom,
}: {
  rooms: string[];
  channels: Channel[];
  currency: string;
  /** Currently selected calendar month — drives the default dates. */
  monthYear: number;
  monthIndex: number;
  onAdd: (p: AddBookingParams) => void;
  /** Optional custom trigger (mobile calendar day cells). */
  trigger?: React.ReactNode;
  /** Preselected room / check-in date (mobile calendar). */
  defaultRoom?: string;
  defaultFrom?: string;
}) {
  const [open, setOpen] = useState(false);
  // Default dates follow the month shown in the calendar (today when the
  // selected month is the current one), never the system month otherwise.
  const { today, tomorrow } = useMemo(() => {
    const now = new Date();
    const inMonth = now.getFullYear() === monthYear && now.getMonth() === monthIndex;
    const start = inMonth ? new Date(monthYear, monthIndex, now.getDate()) : new Date(monthYear, monthIndex, 1);
    const next = new Date(start);
    next.setDate(next.getDate() + 1);
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { today: iso(start), tomorrow: iso(next) };
  }, [monthYear, monthIndex]);
  const [room, setRoom] = useState<string>(defaultRoom ?? rooms[0] ?? "");
  const [channelId, setChannelId] = useState<string>(channels[0]?.id ?? "");
  const [from, setFrom] = useState<string>(defaultFrom ?? today);
  const [to, setTo] = useState<string>(defaultFrom ? nextDayIso(defaultFrom) : tomorrow);

  const [price, setPrice] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [guestName, setGuestName] = useState<string>("");
  const [allowOverlap, setAllowOverlap] = useState(false);
  const [status, setStatus] = useState<BookingStatus>("confirmed");
  const [refundDirection, setRefundDirection] = useState<RefundDirection | "">("");
  const [refundAmount, setRefundAmount] = useState("");

  // Re-seed the dates from the selected month (or the tapped day) on open.
  useEffect(() => {
    if (open) {
      setFrom(defaultFrom ?? today);
      setTo(defaultFrom ? nextDayIso(defaultFrom) : tomorrow);
      if (defaultRoom) setRoom(defaultRoom);
    }
  }, [open, today, tomorrow, defaultFrom, defaultRoom]);



  // Nights = check-out - check-in. The check-out day is not a stayed night.
  const nights = useMemo(() => nightsBetween(from, to), [from, to]);
  const minCheckout = useMemo(() => {
    const d = new Date(`${from}T00:00:00Z`);
    if (isNaN(d.getTime())) return from;
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }, [from]);

  const priceNum = parseFloat(price) || 0;
  const perNight = nights > 0 ? priceNum / nights : 0;
  const selectedChannel = channels.find((c) => c.id === channelId) ?? channels[0];
  const channelCurrency = selectedChannel?.currency === "LOCAL" ? currency : "USD";

  const reset = () => {
    setRoom(defaultRoom ?? rooms[0] ?? "");
    setChannelId(channels[0]?.id ?? "");
    setFrom(defaultFrom ?? today);
    setTo(defaultFrom ? nextDayIso(defaultFrom) : tomorrow);
    setPrice("");
    setNote("");
    setGuestName("");
    setAllowOverlap(false);
    setStatus("confirmed");
    setRefundDirection("");
    setRefundAmount("");
  };

  const refundNum = parseFloat(refundAmount);
  const refundValid = status !== "refunded" || (refundDirection !== "" && isFinite(refundNum) && refundNum > 0);

  const submit = () => {
    if (!room || !channelId) return;
    if (nights <= 0) return;
    if (!(priceNum > 0)) return;
    if (!refundValid) { toast.error("Enter a refund direction and a positive refund amount."); return; }
    onAdd({
      room,
      from,
      to,
      channelId,
      price: priceNum,
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(guestName.trim() ? { guestName: guestName.trim() } : {}),
      allowOverlap,
      status,
      refund: status === "refunded" && refundDirection !== "" ? { direction: refundDirection, amount: refundNum } : null,
    });
    setOpen(false);
    reset();
  };


  return (
    <BookingSheet
      open={open}
      onOpenChange={(o) => { setOpen(o); if (o) reset(); }}
      title="Add booking"
      trigger={
        trigger ?? (
          <Button size="sm" className="gap-1.5">
            <CalendarPlus className="h-4 w-4" /> Add booking
          </Button>
        )
      }
      footer={
        <>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={!room || !channelId || nights <= 0 || !(priceNum > 0)}>Save booking</Button>
        </>
      }
    >

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Guest name</Label>
            <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Optional" />
          </div>
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
              <Label className="text-xs">Check-in</Label>
              <Input type="date" value={from} onChange={(e) => {
                const v = e.target.value;
                setFrom(v);
                if (v && to <= v) {
                  const d = new Date(`${v}T00:00:00Z`);
                  d.setUTCDate(d.getUTCDate() + 1);
                  setTo(d.toISOString().slice(0, 10));
                }
              }} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Check-out</Label>
              <Input type="date" value={to} min={minCheckout} onChange={(e) => setTo(e.target.value)} />
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
            <p className="text-[10px] text-muted-foreground">
              {nights > 0
                ? `${nights} night${nights === 1 ? "" : "s"}${priceNum > 0 ? ` · ${perNight.toFixed(2)} ${channelCurrency} / night` : ""} · check-out day is not charged`
                : "Check-out must be at least one day after check-in."}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
          </div>
          <label className="flex items-center gap-2 rounded-md border p-2 text-xs">
            <input type="checkbox" checked={allowOverlap} onChange={(e) => setAllowOverlap(e.target.checked)} />
            Create as a replacement over an existing/no-show booking
          </label>
          <StatusFields
            status={status}
            setStatus={setStatus}
            direction={refundDirection}
            setDirection={setRefundDirection}
            amount={refundAmount}
            setAmount={setRefundAmount}
            currencyLabel={channelCurrency}
          />

        </div>
    </BookingSheet>

  );
}
