import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { Cell, Channel, ExpenseItem, MonthData, Settings } from "./types";
import { DEFAULT_CHANNELS, emptyMonth, newChannelId, sumExpenses } from "./utils";
import { loadHotelState, saveHotelState } from "./state.functions";
import { supabase } from "@/integrations/supabase/client";

interface StateShape {
  settings: Settings;
  months: Record<string, MonthData>;
  currentMonthKey: string;
  logoUrl?: string;
}

interface Ctx extends StateShape {
  hotelName: string;
  onboarded: boolean;
  loading: boolean;
  currentMonth: MonthData;
  setCurrentMonthKey: (k: string) => void;
  updateCell: (room: string, day: number, cell: Cell | null) => void;
  updateMonthMeta: (patch: Partial<Pick<MonthData, "expenses" | "usdRate" | "managementPct">>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  addChannel: (channel: Omit<Channel, "id">) => void;
  updateChannel: (id: string, patch: Partial<Omit<Channel, "id">>) => void;
  removeChannel: (id: string) => void;
  addMonth: (year: number, monthIndex: number) => void;
  addExpense: (item: Omit<ExpenseItem, "id">) => void;
  updateExpense: (id: string, patch: Partial<Omit<ExpenseItem, "id">>) => void;
  removeExpense: (id: string) => void;
  completeOnboarding: (payload: { hotelName: string; rooms: string[]; usdRate: number; managementPct: number; currency: string }) => Promise<void>;
  setHotelName: (name: string) => void;
  setLogoUrl: (url: string | undefined) => void;
  signOut: () => Promise<void>;
}

const HotelContext = createContext<Ctx | null>(null);

const DEFAULT_CURRENCY = "EGP";

function bootstrapFromDefaults(settings: Settings, now = new Date()): StateShape {
  const m = emptyMonth(now.getFullYear(), now.getMonth(), settings);
  return { settings, months: { [m.key]: m }, currentMonthKey: m.key };
}

function migrateCell(raw: unknown): Cell | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const price = Number(r.price);
  if (!isFinite(price)) return null;
  // Legacy: { price, type: "Airbnb"|"Booking"|"Offline", status }
  let channelId = typeof r.channelId === "string" ? r.channelId : undefined;
  if (!channelId && typeof r.type === "string") {
    channelId = String(r.type).toLowerCase();
  }
  if (!channelId) return null;
  // Drop cancelled legacy cells
  if (r.status === "Cancelled") return null;
  const note = typeof r.note === "string" ? r.note : undefined;
  return { price, channelId, note };
}

function migrateSettings(s: Partial<Settings> | undefined): Settings {
  const base: Settings = {
    rooms: s?.rooms ?? ["Room 1"],
    currency: s?.currency ?? DEFAULT_CURRENCY,
    defaultUsdRate: s?.defaultUsdRate ?? 49,
    defaultManagementPct: s?.defaultManagementPct ?? 0.2,
    channels: Array.isArray(s?.channels) && s!.channels!.length > 0 ? s!.channels! : DEFAULT_CHANNELS,
  };
  return base;
}

function migrateMonth(m: MonthData): MonthData {
  const cells: MonthData["cells"] = {};
  for (const [room, days] of Object.entries(m.cells ?? {})) {
    cells[room] = {};
    for (const [d, c] of Object.entries(days ?? {})) {
      cells[room][Number(d)] = migrateCell(c);
    }
  }
  const items: ExpenseItem[] = Array.isArray(m.expenseItems)
    ? m.expenseItems
    : m.expenses > 0
      ? [{ id: "legacy", label: "Legacy total", amount: m.expenses }]
      : [];
  return { ...m, cells, expenseItems: items, expenses: sumExpenses(items) };
}

function normalizeState(raw: unknown): StateShape | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<StateShape>;
  if (!s.settings || !s.months || !s.currentMonthKey) return null;
  const settings = migrateSettings(s.settings);
  const months: Record<string, MonthData> = {};
  for (const [k, v] of Object.entries(s.months)) months[k] = migrateMonth(v as MonthData);
  return { settings, months, currentMonthKey: s.currentMonthKey };
}

const PLACEHOLDER_SETTINGS: Settings = {
  rooms: ["Room 1"],
  currency: DEFAULT_CURRENCY,
  defaultUsdRate: 49,
  defaultManagementPct: 0.2,
  channels: DEFAULT_CHANNELS,
};

export function HotelProvider({ children }: { children: ReactNode }) {
  const load = useServerFn(loadHotelState);
  const save = useServerFn(saveHotelState);

  const [state, setState] = useState<StateShape>(() => bootstrapFromDefaults(PLACEHOLDER_SETTINGS));
  const [hotelName, setHotelName] = useState("");
  const [onboarded, setOnboarded] = useState(false);
  const [loading, setLoading] = useState(true);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await load();
        if (cancelled) return;
        if (res.exists) {
          setHotelName(res.hotelName);
          setOnboarded(res.onboarded);
          const normalized = normalizeState(res.data);
          if (normalized) setState(normalized);
        } else {
          setOnboarded(false);
          setHotelName("");
        }
      } catch (err) {
        console.error("Failed to load hotel state", err);
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [load]);

  useEffect(() => {
    if (!hydratedRef.current || !onboarded || !hotelName) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      save({ data: { hotelName, data: state as unknown as Record<string, unknown>, onboarded: true } }).catch((err) =>
        console.error("Failed to save hotel state", err),
      );
    }, 600);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state, hotelName, onboarded, save]);

  const setCurrentMonthKey = useCallback((k: string) => setState((s) => ({ ...s, currentMonthKey: k })), []);

  const updateCell = useCallback((room: string, day: number, cell: Cell | null) => {
    setState((s) => {
      const m = s.months[s.currentMonthKey];
      if (!m) return s;
      const cells = { ...m.cells, [room]: { ...(m.cells[room] ?? {}), [day]: cell } };
      return { ...s, months: { ...s.months, [s.currentMonthKey]: { ...m, cells } } };
    });
  }, []);

  const updateMonthMeta = useCallback((patch: Partial<Pick<MonthData, "expenses" | "usdRate" | "managementPct">>) => {
    setState((s) => {
      const m = s.months[s.currentMonthKey];
      if (!m) return s;
      return { ...s, months: { ...s.months, [s.currentMonthKey]: { ...m, ...patch } } };
    });
  }, []);

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

  const addChannel = useCallback((channel: Omit<Channel, "id">) => {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, channels: [...s.settings.channels, { id: newChannelId(), ...channel }] },
    }));
  }, []);

  const updateChannel = useCallback((id: string, patch: Partial<Omit<Channel, "id">>) => {
    setState((s) => ({
      ...s,
      settings: {
        ...s.settings,
        channels: s.settings.channels.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    }));
  }, []);

  const removeChannel = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, channels: s.settings.channels.filter((c) => c.id !== id) },
    }));
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
      return { ...s, months: { ...s.months, [s.currentMonthKey]: { ...m, expenseItems: items, expenses: sumExpenses(items) } } };
    });
  }, []);

  const addExpense = useCallback((item: Omit<ExpenseItem, "id">) => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `e-${Date.now()}-${Math.random()}`;
    mutateExpenses((items) => [...items, { id, ...item }]);
  }, [mutateExpenses]);

  const updateExpense = useCallback((id: string, patch: Partial<Omit<ExpenseItem, "id">>) => {
    mutateExpenses((items) => items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, [mutateExpenses]);

  const removeExpense = useCallback((id: string) => {
    mutateExpenses((items) => items.filter((it) => it.id !== id));
  }, [mutateExpenses]);

  const completeOnboarding = useCallback(async (payload: { hotelName: string; rooms: string[]; usdRate: number; managementPct: number; currency: string }) => {
    const settings: Settings = {
      rooms: payload.rooms,
      currency: payload.currency || DEFAULT_CURRENCY,
      defaultUsdRate: payload.usdRate,
      defaultManagementPct: payload.managementPct,
      channels: DEFAULT_CHANNELS,
    };
    const next = bootstrapFromDefaults(settings);
    for (const key of Object.keys(next.months)) {
      next.months[key].usdRate = payload.usdRate;
      next.months[key].managementPct = payload.managementPct;
    }
    await save({ data: { hotelName: payload.hotelName, data: next as unknown as Record<string, unknown>, onboarded: true } });
    setState(next);
    setHotelName(payload.hotelName);
    setOnboarded(true);
  }, [save]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const currentMonth = useMemo(
    () => state.months[state.currentMonthKey] ?? Object.values(state.months)[0],
    [state.months, state.currentMonthKey],
  );

  const value: Ctx = {
    ...state,
    hotelName,
    onboarded,
    loading,
    currentMonth,
    setCurrentMonthKey,
    updateCell,
    updateMonthMeta,
    updateSettings,
    addChannel,
    updateChannel,
    removeChannel,
    addMonth,
    addExpense,
    updateExpense,
    removeExpense,
    completeOnboarding,
    signOut,
  };

  return <HotelContext.Provider value={value}>{children}</HotelContext.Provider>;
}

export function useHotel() {
  const ctx = useContext(HotelContext);
  if (!ctx) throw new Error("useHotel must be used within HotelProvider");
  return ctx;
}
