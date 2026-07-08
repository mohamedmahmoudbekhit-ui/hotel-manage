export interface Channel {
  id: string;
  name: string;
  /** LOCAL = local currency (settings.currency), USD = converted via monthly usdRate */
  currency: "LOCAL" | "USD";
  color: string; // hex e.g. "#e11d48"
}

export interface Cell {
  price: number;
  channelId: string;
  note?: string;
}

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
  channels: Channel[];
}
