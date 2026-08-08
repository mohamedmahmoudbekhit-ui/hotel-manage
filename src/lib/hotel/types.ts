export interface Channel {
  id: string;
  name: string;
  /** LOCAL = local currency (settings.currency), USD = converted via monthly usdRate */
  currency: "LOCAL" | "USD";
  color: string; // hex e.g. "#e11d48"
}

/**
 * Single source of truth for a reservation night's lifecycle.
 * - confirmed: normal booking (revenue, count, occupancy).
 * - noshow: no-show / early departure — still a real booking.
 * - canceled: never happened (no revenue, no count, no occupancy).
 * - refunded: canceled with refund — only the signed refund adjusts revenue.
 */
export type BookingStatus = "confirmed" | "noshow" | "canceled" | "refunded";

/** Which side received the money back when a booking is canceled with a refund. */
export type RefundDirection = "to_guest" | "to_host";

export interface Cell {
  price: number;
  channelId: string;
  note?: string;
  guestName?: string;
  /**
   * Groups nights that belong to the SAME reservation. Only cells sharing a
   * bookingId may be rendered as one connected block on the calendar.
   */
  bookingId?: string;
  /** Booking status. Absent means "confirmed". */
  status?: BookingStatus;
  /**
   * Legacy flag kept only for reading old saved state; `status: "refunded"`
   * is the source of truth and the only value written going forward.
   */
  canceledWithRefund?: boolean;
  refundDirection?: RefundDirection;
  /** Per-night share of the refund total, in the channel's currency. */
  refundAmount?: number;
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
