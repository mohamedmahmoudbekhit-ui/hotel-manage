import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useHotel } from "@/lib/hotel/store";
import { MonthSelector } from "@/components/month-selector";
import { BOOKING_TYPES, cellRevenueLocal, computeMonthTotals, formatCurrency } from "@/lib/hotel/utils";
import type { BookingStatus, BookingType, Cell } from "@/lib/hotel/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "Bookings — Guesthouse OS" },
      { name: "description", content: "Monthly bookings grid with dropdowns for booking type, room, and status." },
    ],
  }),
  component: BookingsPage,
});

const typeStyles: Record<BookingType, string> = {
  Airbnb: "bg-airbnb/15 text-airbnb-foreground border-airbnb/30 hover:bg-airbnb/25",
  Booking: "bg-booking/15 text-booking-foreground border-booking/30 hover:bg-booking/25",
  Offline: "bg-offline/25 text-offline-foreground border-offline/40 hover:bg-offline/35",
};
const typeDot: Record<BookingType, string> = {
  Airbnb: "bg-airbnb",
  Booking: "bg-booking",
  Offline: "bg-offline",
};
const statusStyles: Record<BookingStatus, string> = {
  Confirmed: "ring-1 ring-success/40",
  Pending: "ring-1 ring-warning/50 opacity-90",
  Cancelled: "ring-1 ring-destructive/40 opacity-50 line-through",
};

function BookingsPage() {
  const { currentMonth, settings, updateCell } = useHotel();
  const t = computeMonthTotals(currentMonth, settings.rooms);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 px-4 py-6 sm:px-6 lg:px-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold tracking-tight sm:text-3xl">Bookings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentMonth.key} · <span className="text-foreground">{t.bookingsCount}</span> bookings ·{" "}
            <span className="text-foreground">{formatCurrency(t.totalRevenue, settings.currency)}</span>
          </p>
        </div>
        <MonthSelector />
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 text-xs">
        {BOOKING_TYPES.map((tp) => (
          <div key={tp} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-2.5 rounded-full", typeDot[tp])} />
            <span className="text-muted-foreground">{tp}</span>
          </div>
        ))}
        <span className="ml-auto text-muted-foreground">Tap a cell to edit</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-20 bg-muted/80 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Day</th>
              {settings.rooms.map((r) => (
                <th key={r} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: currentMonth.daysInMonth }, (_, i) => i + 1).map((day) => (
              <tr key={day} className="group">
                <td className="sticky left-0 z-10 border-t bg-card px-3 py-2 text-xs font-semibold text-muted-foreground group-hover:bg-muted/40">{day}</td>
                {settings.rooms.map((room) => {
                  const cell = currentMonth.cells[room]?.[day] ?? null;
                  return (
                    <td key={room} className="border-t p-1.5 align-top">
                      <CellEditor
                        cell={cell}
                        onSave={(c) => updateCell(room, day, c)}
                        onDelete={() => updateCell(room, day, null)}
                        usdRate={currentMonth.usdRate}
                        currency={settings.currency}
                      />
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

function CellEditor({
  cell,
  onSave,
  onDelete,
  usdRate,
  currency,
}: {
  cell: Cell | null;
  onSave: (c: Cell) => void;
  onDelete: () => void;
  usdRate: number;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(cell?.price.toString() ?? "");
  const [type, setType] = useState<BookingType>(cell?.type ?? "Offline");
  const [status, setStatus] = useState<BookingStatus>(cell?.status ?? "Confirmed");

  const reset = () => {
    setPrice(cell?.price.toString() ?? "");
    setType(cell?.type ?? "Offline");
    setStatus(cell?.status ?? "Confirmed");
  };

  const save = () => {
    const p = parseFloat(price);
    if (!isFinite(p) || p <= 0) return;
    onSave({ price: p, type, status });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) reset(); }}>
      <PopoverTrigger asChild>
        {cell ? (
          <button
            className={cn(
              "w-full rounded-lg border px-2 py-1.5 text-left text-xs transition",
              typeStyles[cell.type],
              statusStyles[cell.status],
            )}
          >
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold tabular-nums">{cell.price}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", typeDot[cell.type])} />
            </div>
            <div className="mt-0.5 truncate text-[10px] opacity-80">
              {cell.type === "Offline" ? currency : "USD"} · {cell.status[0]}
            </div>
          </button>
        ) : (
          <button className="flex h-11 w-full items-center justify-center rounded-lg border border-dashed border-border/60 text-muted-foreground/60 transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72" align="start">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="price" className="text-xs">Price</Label>
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
              {type === "Offline" ? `In ${currency}` : `In USD (× ${usdRate} = ${(parseFloat(price) * usdRate || 0).toFixed(0)} ${currency})`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as BookingType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BOOKING_TYPES.map((tp) => (
                    <SelectItem key={tp} value={tp}>
                      <span className="flex items-center gap-2">
                        <span className={cn("h-2 w-2 rounded-full", typeDot[tp])} />
                        {tp}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as BookingStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Confirmed">Confirmed</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {cell && parseFloat(price) > 0 && (
            <div className="rounded-md bg-muted p-2 text-xs">
              Revenue: <span className="font-semibold">{formatCurrency(cellRevenueLocal({ price: parseFloat(price) || 0, type, status }, usdRate), currency)}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-2 pt-1">
            {cell ? (
              <Button variant="ghost" size="sm" onClick={() => { onDelete(); setOpen(false); }} className="text-destructive hover:text-destructive">
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={save}>Save</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
