import type { BookingType, MonthData, Settings } from "./types";
import { emptyMonth } from "./utils";

export const DEFAULT_SETTINGS: Settings = {
  rooms: ["Room 1", "Room 2", "Room 3", "Room 4", "Room 5"],
  currency: "EGP",
  defaultUsdRate: 49.28,
  defaultManagementPct: 0.25,
};

// Data extracted from user's Monthly Reports > June 2026 sheet.
// Row order in source: day = index (col L); Room 1 = right-most, Room 5 = left-most.
// Prices for Airbnb/Booking are USD; Offline is EGP.
type Raw = Array<[number, string, BookingType, number]>; // [day, room, type, price]

const JUNE_2026_RAW: Raw = [
  [1, "Room 5", "Airbnb", 11.1], [1, "Room 4", "Booking", 104.42], [1, "Room 2", "Airbnb", 22.21], [1, "Room 1", "Airbnb", 11.1],
  [2, "Room 3", "Offline", 500],
  [4, "Room 5", "Booking", 13.64], [4, "Room 3", "Airbnb", 11.1], [4, "Room 2", "Booking", 13.64],
  [5, "Room 5", "Offline", 800], [5, "Room 3", "Booking", 13.64], [5, "Room 2", "Offline", 1200],
  [6, "Room 5", "Airbnb", 22.21], [6, "Room 3", "Offline", 1600], [6, "Room 2", "Offline", 550],
  [8, "Room 5", "Offline", 600], [8, "Room 4", "Offline", 3000], [8, "Room 3", "Offline", 600], [8, "Room 2", "Airbnb", 22.21],
  [9, "Room 5", "Offline", 700], [9, "Room 1", "Offline", 4200],
  [10, "Room 3", "Offline", 1200], [10, "Room 2", "Booking", 46.05], [10, "Room 1", "Offline", 3600],
  [11, "Room 4", "Offline", 600], [11, "Room 2", "Airbnb", 22.21],
  [12, "Room 5", "Offline", 600], [12, "Room 4", "Offline", 800],
  [13, "Room 2", "Airbnb", 42.5], [13, "Room 1", "Airbnb", 33.33],
  [14, "Room 3", "Offline", 1600],
  [15, "Room 3", "Airbnb", 36.7],
  [16, "Room 3", "Offline", 600],
  [17, "Room 5", "Booking", 104.42], [17, "Room 4", "Airbnb", 36.7], [17, "Room 2", "Booking", 13.64],
  [18, "Room 3", "Booking", 16.67], [18, "Room 1", "Booking", 15.35],
  [19, "Room 4", "Offline", 800], [19, "Room 3", "Offline", 600], [19, "Room 2", "Airbnb", 20.28], [19, "Room 1", "Offline", 1800],
  [20, "Room 4", "Offline", 600], [20, "Room 2", "Airbnb", 15.45],
  [21, "Room 3", "Offline", 700], [21, "Room 2", "Airbnb", 13.52],
  [22, "Room 5", "Offline", 600], [22, "Room 4", "Offline", 850], [22, "Room 3", "Offline", 600], [22, "Room 2", "Offline", 600],
  [23, "Room 4", "Booking", 11.94], [23, "Room 2", "Airbnb", 11.1], [23, "Room 1", "Offline", 3000],
  [24, "Room 4", "Airbnb", 18.35], [24, "Room 3", "Offline", 600], [24, "Room 2", "Airbnb", 42.5],
  [25, "Room 5", "Offline", 2400], [25, "Room 4", "Booking", 11.94], [25, "Room 3", "Booking", 11.94],
  [26, "Room 3", "Offline", 1600],
  [27, "Room 4", "Booking", 23.87], [27, "Room 2", "Booking", 16.67],
  [28, "Room 4", "Offline", 600], [28, "Room 2", "Booking", 11.94],
  [29, "Room 2", "Offline", 600],
  [30, "Room 4", "Offline", 800], [30, "Room 3", "Offline", 600], [30, "Room 2", "Offline", 600], [30, "Room 1", "Offline", 3000],
];

function buildJune(settings: Settings): MonthData {
  const m = emptyMonth(2026, 5, settings); // June = index 5
  for (const [day, room, type, price] of JUNE_2026_RAW) {
    m.cells[room][day] = { price, type, status: "Confirmed" };
  }
  m.expenses = 31383;
  m.usdRate = 49.28;
  m.managementPct = 0.25;
  return m;
}

export function seedMonths(settings: Settings): Record<string, MonthData> {
  const june = buildJune(settings);
  const months: Record<string, MonthData> = { [june.key]: june };
  // Seed empty months July 2026 - Jan 2027
  for (let i = 6; i <= 11; i++) {
    const m = emptyMonth(2026, i, settings);
    months[m.key] = m;
  }
  const jan = emptyMonth(2027, 0, settings);
  months[jan.key] = jan;
  return months;
}
