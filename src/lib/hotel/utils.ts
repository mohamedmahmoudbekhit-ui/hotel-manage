import type { BookingStatus, Cell, CellSlot, Channel, MonthData, Settings } from "./types";

/** Normalise a room-night slot to a list of bookings (0, 1 or many). */
export function slotCells(slot: CellSlot | undefined): Cell[] {
  if (!slot) return [];
  return Array.isArray(slot) ? slot.filter(Boolean) : [slot];
}

/** All bookings stored for a given room-night. */
export function cellsAt(month: MonthData, room: string, day: number): Cell[] {
  return slotCells(month.cells?.[room]?.[day]);
}

/** Collapse a list back into the compact storage shape. */
export function toSlot(cells: Cell[]): CellSlot {
  if (cells.length === 0) return null;
  return cells.length === 1 ? cells[0]! : cells;
}


export const DEFAULT_CHANNELS: Channel[] = [
  { id: "airbnb", name: "Airbnb", currency: "USD", color: "#e11d48" },
  { id: "booking", name: "Booking", currency: "USD", color: "#1d4ed8" },
  { id: "offline", name: "Offline", currency: "LOCAL", color: "#d97706" },
];

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthKey(year: number, monthIndex: number) {
  return `${MONTH_NAMES[monthIndex]} ${year}`;
}

export function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function findChannel(settings: Settings, id: string): Channel {
  return (
    settings.channels.find((c) => c.id === id) ??
    DEFAULT_CHANNELS.find((c) => c.id === id) ??
    { id, name: id, currency: "LOCAL", color: "#64748b" }
  );
}

/** Normalised status of a night. Legacy cells map onto the new statuses. */
export function cellStatus(cell: Cell): BookingStatus {
  if (cell.status === "canceled" || cell.status === "refunded" || cell.status === "noshow") return cell.status;
  // Legacy state written before the single Status field existed.
  if (cell.canceledWithRefund === true) return "refunded";
  return "confirmed";
}

/** Local-currency revenue for a cell. USD channels are converted using monthly usdRate. */
export function cellRevenueLocal(cell: Cell, usdRate: number, settings: Settings): number {
  const ch = findChannel(settings, cell.channelId);
  const rate = ch.currency === "USD" ? usdRate : 1;
  const status = cellStatus(cell);
  // A plain cancellation keeps its stored price for reference but earns nothing.
  if (status === "canceled") return 0;
  if (status === "refunded") {
    // The original booking amount never counts once refunded; only the
    // adjustment does (negative to the guest, positive to the host).
    const refund = Number(cell.refundAmount) || 0;
    return (cell.refundDirection === "to_host" ? refund : -refund) * rate;
  }
  return cell.price * rate;
}

/** Canceled and canceled-with-refund nights are bookings that never happened. */
export function isCanceledCell(cell: Cell): boolean {
  const s = cellStatus(cell);
  return s === "canceled" || s === "refunded";
}

export interface MonthTotals {
  totalRevenue: number;
  revenueByChannel: Record<string, number>;
  bookingsCount: number;
  bookingsByChannel: Record<string, number>;
  occupiedNights: number;
  totalNights: number;
  occupancyRate: number;
  avgRevenuePerBooking: number;
  bestRoom: { room: string; revenue: number } | null;
  emptyDaysByRoom: Record<string, number>;
  revenueByRoom: Record<string, number>;
  net: number;
  management: number;
  owner: number;
  usdTotal: number;
  localTotal: number;
  /** Revenue that belongs to no-show / early-departure bookings (already included in totalRevenue). */
  noshowRevenue: number;
  /** Net refund adjustment (host refunds minus guest refunds), already in totalRevenue. */
  refundAdjustment: number;

}


export function computeMonthTotals(m: MonthData, rooms: string[], settings: Settings): MonthTotals {
  const revenueByChannel: Record<string, number> = {};
  const bookingsByChannel: Record<string, number> = {};
  for (const ch of settings.channels) {
    revenueByChannel[ch.id] = 0;
    bookingsByChannel[ch.id] = 0;
  }
  const revenueByRoom: Record<string, number> = {};
  const emptyDaysByRoom: Record<string, number> = {};
  let totalRevenue = 0;
  let bookingsCount = 0;
  let occupiedNights = 0;
  let usdTotal = 0;
  let localTotal = 0;
  let noshowRevenue = 0;
  let refundAdjustment = 0;


  for (const room of rooms) {
    revenueByRoom[room] = 0;
    let occ = 0;
    for (let d = 1; d <= m.daysInMonth; d++) {
      const list = slotCells(m.cells[room]?.[d]);
      if (list.length === 0) continue;
      // A night counts once towards occupancy even when a replacement booking
      // shares the same date; revenue is kept for every booking, including
      // no-show / early-departure ones. Canceled and canceled-with-refund
      // nights never count as occupied or as bookings.
      if (list.some((c) => !isCanceledCell(c))) {
        occupiedNights += 1;
        occ += 1;
      }
      for (const c of list) {
        const ch = findChannel(settings, c.channelId);
        const rev = cellRevenueLocal(c, m.usdRate, settings);
        totalRevenue += rev;
        revenueByChannel[c.channelId] = (revenueByChannel[c.channelId] ?? 0) + rev;
        revenueByRoom[room] += rev;
        if (isCanceledCell(c)) {
          if (cellStatus(c) === "refunded") refundAdjustment += rev;
          continue;
        }
        bookingsByChannel[c.channelId] = (bookingsByChannel[c.channelId] ?? 0) + 1;
        bookingsCount += 1;
        if (cellStatus(c) === "noshow") noshowRevenue += rev;
        if (ch.currency === "USD") usdTotal += c.price;
        else localTotal += c.price;
      }
    }
    emptyDaysByRoom[room] = m.daysInMonth - occ;
  }



  const totalNights = rooms.length * m.daysInMonth;
  const occupancyRate = totalNights ? (occupiedNights / totalNights) * 100 : 0;
  const avgRevenuePerBooking = bookingsCount ? totalRevenue / bookingsCount : 0;

  let bestRoom: MonthTotals["bestRoom"] = null;
  for (const [room, rev] of Object.entries(revenueByRoom)) {
    if (!bestRoom || rev > bestRoom.revenue) bestRoom = { room, revenue: rev };
  }

  const net = totalRevenue - m.expenses;
  const management = net * m.managementPct;
  const owner = net - management;

  return {
    totalRevenue,
    revenueByChannel,
    bookingsCount,
    bookingsByChannel,
    occupiedNights,
    totalNights,
    occupancyRate,
    avgRevenuePerBooking,
    bestRoom,
    emptyDaysByRoom,
    revenueByRoom,
    net,
    management,
    owner,
    usdTotal,
    noshowRevenue,
    refundAdjustment,


    localTotal,
  };
}

export function formatCurrency(n: number, currency = "EGP") {
  const rounded = Math.round(n);
  return `${rounded.toLocaleString()} ${currency}`;
}

export function formatShort(n: number) {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n)}`;
}

export function emptyMonth(year: number, monthIndex: number, settings: Settings): MonthData {
  const dim = daysInMonth(year, monthIndex);
  const cells: MonthData["cells"] = {};
  for (const r of settings.rooms) {
    cells[r] = {};
    for (let d = 1; d <= dim; d++) cells[r][d] = null;
  }
  return {
    key: monthKey(year, monthIndex),
    year,
    monthIndex,
    daysInMonth: dim,
    cells,
    expenses: 0,
    expenseItems: [],
    usdRate: settings.defaultUsdRate,
    managementPct: settings.defaultManagementPct,
  };
}

export function sumExpenses(items: { amount: number }[] | undefined): number {
  if (!items) return 0;
  return items.reduce((s, i) => s + (Number.isFinite(i.amount) ? i.amount : 0), 0);
}

/** Pick black/white text for a given hex background for accessible contrast. */
export function pickTextColor(hex: string): "#ffffff" | "#0b1220" {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // relative luminance
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? "#0b1220" : "#ffffff";
}

export function newBookingId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `bk-${crypto.randomUUID()}`;
  return `bk-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function newChannelId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `ch-${crypto.randomUUID().slice(0, 8)}`;
  return `ch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------------------------------------------------------------------------
// Nights & imported-reservation analytics
// ---------------------------------------------------------------------------

/** Nights between two ISO dates: checkout - checkin. Same day = 0 nights. */
export function nightsBetween(fromIso: string, toIso: string): number {
  const s = new Date(`${(fromIso ?? "").slice(0, 10)}T00:00:00Z`).getTime();
  const e = new Date(`${(toIso ?? "").slice(0, 10)}T00:00:00Z`).getTime();
  if (!isFinite(s) || !isFinite(e)) return 0;
  const n = Math.round((e - s) / 86400000);
  return n > 0 ? n : 0;
}

/** Minimal shape of an imported (iCal) reservation used by analytics. */
export interface ImportedLike {
  id?: string;
  room_name: string;
  source_id: string;

  source_name: string;
  source_color: string;
  channel_id?: string | null;
  /** Manual per-reservation channel override (wins over the source mapping). */
  override_channel_id?: string | null;
  status?: string | null;
  canceled_with_refund?: boolean | null;
  refund_direction?: "to_guest" | "to_host" | null;
  /** Total refund for the whole reservation, in the resolved channel currency. */
  refund_amount?: number | null;

  start_date: string;
  end_date: string;
  override_price: number | null;
  override_notes: string | null;
}

/** Normalised status of an imported reservation (legacy flag included). */
export function importedStatus(res: ImportedLike): BookingStatus {
  if (res.status === "noshow" || res.status === "canceled" || res.status === "refunded") return res.status;
  if (res.canceled_with_refund === true) return "refunded";
  return "confirmed";
}

/**
 * Resolve the app channel an imported reservation belongs to. A manual override
 * wins, then the source's mapped channel; unmapped sources fall back to a
 * synthetic channel derived from the iCal source itself.
 */
export function resolveImportedChannel(settings: Settings, res: ImportedLike): Channel {
  const overridden = res.override_channel_id
    ? settings.channels.find((c) => c.id === res.override_channel_id)
    : undefined;
  if (overridden) return overridden;
  const mapped = res.channel_id ? settings.channels.find((c) => c.id === res.channel_id) : undefined;
  if (mapped) return mapped;
  return {
    id: `ical:${res.source_id}`,
    name: res.source_name,
    currency: "LOCAL",
    color: res.source_color || "#64748b",
  };
}


/**
 * Merge imported reservations into a month as nightly cells so that every
 * downstream calculation (revenue, occupancy, ADR, channel stats) treats them
 * exactly like manual bookings. Revenue is split evenly across actual nights
 * (check-out day excluded). Returns the augmented month plus a settings copy
 * containing any synthetic channels needed for unmapped sources.
 */
export function mergeImportedIntoMonth(
  month: MonthData,
  settings: Settings,
  imported: ImportedLike[],
): { month: MonthData; settings: Settings } {
  if (!imported || imported.length === 0) return { month, settings };
  const cells: MonthData["cells"] = {};
  for (const [room, days] of Object.entries(month.cells ?? {})) cells[room] = { ...days };
  const extra = new Map<string, Channel>();
  let touched = false;

  for (const res of imported) {
    if (!settings.rooms.includes(res.room_name)) continue;
    const start = (res.start_date ?? "").slice(0, 10);
    const end = (res.end_date ?? "").slice(0, 10);
    const nights = nightsBetween(start, end);
    if (nights <= 0) continue;
    const ch = resolveImportedChannel(settings, res);
    if (!settings.channels.some((c) => c.id === ch.id)) extra.set(ch.id, ch);
    const perNight = (res.override_price ?? 0) / nights;
    const status = importedStatus(res);
    const refundPerNight = status === "refunded" ? (Number(res.refund_amount) || 0) / nights : 0;
    const d = new Date(`${start}T00:00:00Z`);
    for (let i = 0; i < nights; i++) {
      if (d.getUTCFullYear() === month.year && d.getUTCMonth() === month.monthIndex) {
        const day = d.getUTCDate();
        if (!cells[res.room_name]) {
          cells[res.room_name] = {};
          for (let dd = 1; dd <= month.daysInMonth; dd++) cells[res.room_name][dd] = null;
        }
        const existing = slotCells(cells[res.room_name][day]);
        cells[res.room_name][day] = toSlot([
          ...existing,
          {
            price: perNight,
            channelId: ch.id,
            bookingId: `ical:${res.id ?? `${res.source_id}:${start}`}`,
            ...(status !== "confirmed" ? { status } : {}),
            ...(res.override_notes ? { note: res.override_notes } : {}),
            ...(status === "refunded"
              ? {
                  refundDirection: (res.refund_direction ?? "to_guest") as "to_guest" | "to_host",
                  refundAmount: refundPerNight,
                }
              : {}),
          },
        ]);
        touched = true;
      }

      d.setUTCDate(d.getUTCDate() + 1);
    }

  }

  if (!touched && extra.size === 0) return { month, settings };
  return {
    month: { ...month, cells },
    settings: extra.size > 0 ? { ...settings, channels: [...settings.channels, ...extra.values()] } : settings,
  };
}
