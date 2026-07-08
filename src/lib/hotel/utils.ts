import type { Cell, Channel, MonthData, Settings } from "./types";

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

/** Local-currency revenue for a cell. USD channels are converted using monthly usdRate. */
export function cellRevenueLocal(cell: Cell, usdRate: number, settings: Settings): number {
  const ch = findChannel(settings, cell.channelId);
  return ch.currency === "USD" ? cell.price * usdRate : cell.price;
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

  for (const room of rooms) {
    revenueByRoom[room] = 0;
    let occ = 0;
    for (let d = 1; d <= m.daysInMonth; d++) {
      const c = m.cells[room]?.[d] ?? null;
      if (c) {
        const ch = findChannel(settings, c.channelId);
        const rev = cellRevenueLocal(c, m.usdRate, settings);
        totalRevenue += rev;
        revenueByChannel[c.channelId] = (revenueByChannel[c.channelId] ?? 0) + rev;
        bookingsByChannel[c.channelId] = (bookingsByChannel[c.channelId] ?? 0) + 1;
        revenueByRoom[room] += rev;
        bookingsCount += 1;
        occupiedNights += 1;
        occ += 1;
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

export function newChannelId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return `ch-${crypto.randomUUID().slice(0, 8)}`;
  return `ch-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
