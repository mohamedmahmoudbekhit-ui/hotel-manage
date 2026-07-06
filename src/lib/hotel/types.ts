export type BookingType = "Airbnb" | "Booking" | "Offline";
export type BookingStatus = "Confirmed" | "Pending" | "Cancelled";

export interface Cell {
  price: number;
  type: BookingType;
  status: BookingStatus;
}

export interface ExpenseItem {
  id: string;
  label: string;
  amount: number;
  date?: string; // ISO yyyy-mm-dd
}

export interface MonthData {
  key: string; // e.g. "June 2026"
  year: number;
  monthIndex: number; // 0-11
  daysInMonth: number;
  cells: Record<string, Record<number, Cell | null>>;
  expenses: number; // derived = sum(expenseItems)
  expenseItems: ExpenseItem[];
  usdRate: number;
  managementPct: number;
}

export interface Settings {
  rooms: string[];
  currency: string;
  defaultUsdRate: number;
  defaultManagementPct: number;
}
