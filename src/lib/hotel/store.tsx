import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Cell, ExpenseItem, MonthData, Settings } from "./types";
import { DEFAULT_SETTINGS, seedMonths } from "./seed";
import { emptyMonth, sumExpenses } from "./utils";

interface State {
  settings: Settings;
  months: Record<string, MonthData>;
  currentMonthKey: string;
}

interface Ctx extends State {
  currentMonth: MonthData;
  setCurrentMonthKey: (k: string) => void;
  updateCell: (room: string, day: number, cell: Cell | null) => void;
  updateMonthMeta: (patch: Partial<Pick<MonthData, "expenses" | "usdRate" | "managementPct">>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  addMonth: (year: number, monthIndex: number) => void;
  addExpense: (item: Omit<ExpenseItem, "id">) => void;
  updateExpense: (id: string, patch: Partial<Omit<ExpenseItem, "id">>) => void;
  removeExpense: (id: string) => void;
  resetAll: () => void;
}

const KEY = "hotel-mgmt-v2";

function migrate(m: MonthData): MonthData {
  if (!Array.isArray(m.expenseItems)) {
    const items: ExpenseItem[] = m.expenses > 0
      ? [{ id: "legacy", label: "Legacy total", amount: m.expenses }]
      : [];
    return { ...m, expenseItems: items, expenses: sumExpenses(items) };
  }
  return { ...m, expenses: sumExpenses(m.expenseItems) };
}

function loadInitial(): State {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem("hotel-mgmt-v1");
      if (raw) {
        const parsed = JSON.parse(raw) as State;
        const months: Record<string, MonthData> = {};
        for (const [k, v] of Object.entries(parsed.months)) months[k] = migrate(v);
        return { ...parsed, months };
      }
    } catch { /* ignore */ }
  }
  const months = seedMonths(DEFAULT_SETTINGS);
  const firstKey = Object.keys(months)[0];
  return { settings: DEFAULT_SETTINGS, months, currentMonthKey: firstKey };
}

const HotelContext = createContext<Ctx | null>(null);

export function HotelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => ({
    settings: DEFAULT_SETTINGS,
    months: seedMonths(DEFAULT_SETTINGS),
    currentMonthKey: "June 2026",
  }));
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(loadInitial());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [state, hydrated]);

  const setCurrentMonthKey = useCallback((k: string) => {
    setState((s) => ({ ...s, currentMonthKey: k }));
  }, []);

  const updateCell = useCallback((room: string, day: number, cell: Cell | null) => {
    setState((s) => {
      const m = s.months[s.currentMonthKey];
      if (!m) return s;
      const cells = { ...m.cells, [room]: { ...(m.cells[room] ?? {}), [day]: cell } };
      return { ...s, months: { ...s.months, [s.currentMonthKey]: { ...m, cells } } };
    });
  }, []);

  const updateMonthMeta = useCallback(
    (patch: Partial<Pick<MonthData, "expenses" | "usdRate" | "managementPct">>) => {
      setState((s) => {
        const m = s.months[s.currentMonthKey];
        if (!m) return s;
        return { ...s, months: { ...s.months, [s.currentMonthKey]: { ...m, ...patch } } };
      });
    },
    [],
  );

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setState((s) => {
      const nextSettings = { ...s.settings, ...patch };
      const nextMonths = { ...s.months };
      for (const key of Object.keys(nextMonths)) {
        const m = nextMonths[key];
        const cells = { ...m.cells };
        for (const r of nextSettings.rooms) {
          if (!cells[r]) {
            cells[r] = {};
            for (let d = 1; d <= m.daysInMonth; d++) cells[r][d] = null;
          }
        }
        nextMonths[key] = { ...m, cells };
      }
      return { ...s, settings: nextSettings, months: nextMonths };
    });
  }, []);

  const addMonth = useCallback((year: number, monthIndex: number) => {
    setState((s) => {
      const m = emptyMonth(year, monthIndex, s.settings);
      if (s.months[m.key]) return { ...s, currentMonthKey: m.key };
      return { ...s, months: { ...s.months, [m.key]: m }, currentMonthKey: m.key };
    });
  }, []);

  const mutateExpenses = useCallback((fn: (items: ExpenseItem[]) => ExpenseItem[]) => {
    setState((s) => {
      const m = s.months[s.currentMonthKey];
      if (!m) return s;
      const items = fn(m.expenseItems ?? []);
      return {
        ...s,
        months: { ...s.months, [s.currentMonthKey]: { ...m, expenseItems: items, expenses: sumExpenses(items) } },
      };
    });
  }, []);

  const addExpense = useCallback((item: Omit<ExpenseItem, "id">) => {
    const id = (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `e-${Date.now()}-${Math.random()}`);
    mutateExpenses((items) => [...items, { id, ...item }]);
  }, [mutateExpenses]);

  const updateExpense = useCallback((id: string, patch: Partial<Omit<ExpenseItem, "id">>) => {
    mutateExpenses((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, [mutateExpenses]);

  const removeExpense = useCallback((id: string) => {
    mutateExpenses((items) => items.filter((it) => it.id !== id));
  }, [mutateExpenses]);

  const resetAll = useCallback(() => {
    const months = seedMonths(DEFAULT_SETTINGS);
    setState({ settings: DEFAULT_SETTINGS, months, currentMonthKey: "June 2026" });
  }, []);

  const currentMonth = useMemo(
    () => state.months[state.currentMonthKey] ?? Object.values(state.months)[0],
    [state.months, state.currentMonthKey],
  );

  const value: Ctx = {
    ...state,
    currentMonth,
    setCurrentMonthKey,
    updateCell,
    updateMonthMeta,
    updateSettings,
    addMonth,
    addExpense,
    updateExpense,
    removeExpense,
    resetAll,
  };

  return <HotelContext.Provider value={value}>{children}</HotelContext.Provider>;
}

export function useHotel() {
  const ctx = useContext(HotelContext);
  if (!ctx) throw new Error("useHotel must be used within HotelProvider");
  return ctx;
}
