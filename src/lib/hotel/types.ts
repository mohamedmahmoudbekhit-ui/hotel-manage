export type BookingType = "Airbnb" | "Booking" | "Offline";
export type BookingStatus = "Confirmed" | "Pending" | "Cancelled";

export interface Cell {
  price: number;
  type: BookingType;
  status: BookingStatus;
}

export interface MonthData {
  key: string; // e.g. "June 2026"
  year: number;
  monthIndex: number; // 0-11
  daysInMonth: number;
  // cells[roomId][day] -> Cell | null
  cells: Record<string, Record<number, Cell | null>>;
  expenses: number;
  usdRate: number;
  managementPct: number; // e.g. 0.25
}

export interface Settings {
  rooms: string[]; // ["Room 1", ...]
  currency: string; // "EGP"
  defaultUsdRate: number;
  defaultManagementPct: number;
}
