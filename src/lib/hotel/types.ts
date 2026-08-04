export interface Channel {
  id: string;
  name: string;
  /** LOCAL = local currency (settings.currency), USD = converted via monthly usdRate */
  currency: "LOCAL" | "USD";
  color: string; // hex e.g. "#e11d48"
}

/** Lifecycle of a reservation night. No-show keeps its revenue in all reports. */
export type BookingStatus = "active" | "noshow";

export interface Cell {
  price: number;
  channelId: string;
  note?: string;
  /**
   * Groups nights that belong to the SAME reservation. Only cells sharing a
   * bookingId may be rendered as one connected block on the calendar.
   */
  bookingId?: string;
  /** "noshow" = no-show / early departure. Kept for history and revenue. */
  status?: BookingStatus;
}

/** A room-night may hold one booking, several (replacements), or none. */
export type CellSlot = Cell | Cell[] | null;

export interface ExpenseItem {
  id: string;
  label: string;
  amount: number;
  date?: string; // ISO yyyy-mm-dd
}

export interface MonthData {
  key: string;
  year: number;
  monthIndex: number;
  daysInMonth: number;
  cells: Record<string, Record<number, CellSlot>>;
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
  channels: Channel[];
}
