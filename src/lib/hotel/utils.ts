import type { BookingType, Cell, MonthData, Settings } from "./types";

export const BOOKING_TYPES: BookingType[] = ["Airbnb", "Booking", "Offline"];

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

/** Airbnb & Booking prices are USD; Offline is local currency. */
export function cellRevenueLocal(cell: Cell, usdRate: number): number {
  if (cell.status === "Cancelled") return 0;
  if (cell.type === "Offline") return cell.price;
  return cell.price * usdRate;
}

export interface MonthTotals {
  totalRevenue: number;
  revenueByType: Record<BookingType, number>;
  bookingsCount: number;
  bookingsByType: Record<BookingType, number>;
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
  egpTotal: number;
}

export function computeMonthTotals(m: MonthData, rooms: string[]): MonthTotals {
  const revenueByType: Record<BookingType, number> = { Airbnb: 0, Booking: 0, Offline: 0 };
  const bookingsByType: Record<BookingType, number> = { Airbnb: 0, Booking: 0, Offline: 0 };
  const revenueByRoom: Record<string, number> = {};
  const emptyDaysByRoom: Record<string, number> = {};
  let totalRevenue = 0;
  let bookingsCount = 0;
  let occupiedNights = 0;
  let usdTotal = 0;
  let egpTotal = 0;

  for (const room of rooms) {
    revenueByRoom[room] = 0;
    let occ = 0;
    for (let d = 1; d <= m.daysInMonth; d++) {
      const c = m.cells[room]?.[d] ?? null;
      if (c && c.status !== "Cancelled") {
        const rev = cellRevenueLocal(c, m.usdRate);
        totalRevenue += rev;
        revenueByType[c.type] += rev;
        bookingsByType[c.type] += 1;
        revenueByRoom[room] += rev;
        bookingsCount += 1;
        occupiedNights += 1;
        occ += 1;
        if (c.type === "Offline") egpTotal += c.price;
        else usdTotal += c.price;
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
    revenueByType,
    bookingsCount,
    bookingsByType,
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
    egpTotal,
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
    usdRate: settings.defaultUsdRate,
    managementPct: settings.defaultManagementPct,
  };
}
