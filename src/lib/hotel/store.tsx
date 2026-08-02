import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { Cell, Channel, ExpenseItem, MonthData, Settings } from "./types";
import { DEFAULT_CHANNELS, emptyMonth, MONTH_NAMES, mergeImportedIntoMonth, newChannelId, nightsBetween, sumExpenses } from "./utils";
import { loadHotelState, saveHotelState } from "./state.functions";
import { listImportedForMonth, type ImportedReservationRow } from "./calendar.functions";
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
  organizationId: string | null;
  accountStatus: string | null;
  memberRole: string | null;
  isBookingAgent: boolean;
  subscriptionStatus: string | null;
  currentMonth: MonthData;
  /** iCal reservations covering every month held in state. */
  imported: ImportedReservationRow[];
  reloadImported: () => void;
  /** Current month with imported reservations merged in as nightly cells. */
  analyticsMonth: MonthData;
  /** Settings incl. synthetic channels for unmapped iCal sources. */
  analyticsSettings: Settings;
  /** Merge imported reservations into any month held in state. */
  analyticsFor: (m: MonthData) => { month: MonthData; settings: Settings };
  setCurrentMonthKey: (k: string) => void;

  updateCell: (room: string, day: number, cell: Cell | null) => void;
  addBookingRange: (params: { room: string; from: string; to: string; channelId: string; price: number; note?: string }) => { written: number; skipped: number; nights: number };
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

// Initial default month shown on first load.
const DEFAULT_YEAR = 2026;
const DEFAULT_MONTH_INDEX = 6; // July

function bootstrapFromDefaults(settings: Settings): StateShape {
  const m = emptyMonth(DEFAULT_YEAR, DEFAULT_MONTH_INDEX, settings);
  return { settings, months: { [m.key]: m }, currentMonthKey: m.key };
}

/** Ensure the default month exists and is selected when the app first loads. */
function withDefaultMonth(s: StateShape): StateShape {
  const months = { ...s.months };
  const key = `${MONTH_NAMES[DEFAULT_MONTH_INDEX]} ${DEFAULT_YEAR}`;
  if (!months[key]) months[key] = emptyMonth(DEFAULT_YEAR, DEFAULT_MONTH_INDEX, s.settings);
  return { ...s, months, currentMonthKey: key };
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
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await load();
        if (cancelled) return;
        setOrganizationId(res.organizationId ?? null);
        setAccountStatus(res.accountStatus ?? null);
        setMemberRole(res.memberRole ?? null);
        setSubscriptionStatus(res.subscriptionStatus ?? null);
        if (res.exists) {
          setHotelName(res.hotelName);
          setOnboarded(res.onboarded);
          const normalized = normalizeState(res.data);
          if (normalized) setState(withDefaultMonth(normalized));
        } else {
          setOnboarded(false);
          setHotelName(res.hotelName || "");
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

  const addBookingRange = useCallback((params: { room: string; from: string; to: string; channelId: string; price: number; note?: string }) => {
    const start = new Date(`${params.from}T00:00:00Z`);
    const end = new Date(`${params.to}T00:00:00Z`);
    // Nights = checkout - checkin. The checkout day is NOT a stayed night.
    const nights = nightsBetween(params.from, params.to);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || nights <= 0) {
      return { written: 0, skipped: 0, nights: 0 };
    }
    const dates: Date[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < nights; i++) {
      dates.push(new Date(cursor));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    const perNight = Math.round((params.price / nights) * 100) / 100;
    let written = 0;
    let skipped = 0;
    setState((s) => {
      const nextMonths = { ...s.months };
      for (const dt of dates) {
        const y = dt.getUTCFullYear();
        const mi = dt.getUTCMonth();
        const day = dt.getUTCDate();
        const key = `${MONTH_NAMES[mi]} ${y}`;
        let month = nextMonths[key];
        if (!month) {
          month = emptyMonth(y, mi, s.settings);
        }
        // ensure room exists
        const rooms = { ...month.cells };
        if (!rooms[params.room]) {
          rooms[params.room] = {};
          for (let dd = 1; dd <= month.daysInMonth; dd++) rooms[params.room][dd] = null;
        }
        const existing = rooms[params.room][day];
        if (existing) { skipped += 1; nextMonths[key] = { ...month, cells: rooms }; continue; }
        const roomCells = { ...rooms[params.room], [day]: { price: perNight, channelId: params.channelId, ...(params.note ? { note: params.note } : {}) } as Cell };
        rooms[params.room] = roomCells;
        nextMonths[key] = { ...month, cells: rooms };
        written += 1;
      }
      return { ...s, months: nextMonths };
    });
    return { written, skipped, nights };
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

  const setHotelNameCb = useCallback((name: string) => {
    setHotelName(name);
  }, []);

  const setLogoUrl = useCallback((url: string | undefined) => {
    setState((s) => ({ ...s, logoUrl: url }));
  }, []);


  const currentMonth = useMemo(
    () => state.months[state.currentMonthKey] ?? Object.values(state.months)[0],
    [state.months, state.currentMonthKey],
  );

  // ---- Imported (iCal) reservations across every month held in state ----
  const [imported, setImported] = useState<ImportedReservationRow[]>([]);
  const fetchImported = useServerFn(listImportedForMonth);
  const monthKeysSig = Object.keys(state.months).sort().join("|");

  const reloadImported = useCallback(() => {
    const list = Object.values(state.months);
    if (list.length === 0) return;
    const sorted = [...list].sort((a, b) => (a.year !== b.year ? a.year - b.year : a.monthIndex - b.monthIndex));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const from = `${first.year}-${String(first.monthIndex + 1).padStart(2, "0")}-01`;
    const to = `${last.year}-${String(last.monthIndex + 1).padStart(2, "0")}-${String(last.daysInMonth).padStart(2, "0")}`;
    fetchImported({ data: { from, to } })
      .then(setImported)
      .catch((e) => console.error("Failed to load imported reservations", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchImported, monthKeysSig]);

  useEffect(() => {
    if (loading || !onboarded) return;
    reloadImported();
  }, [loading, onboarded, reloadImported]);

  const analyticsFor = useCallback(
    (m: MonthData) => mergeImportedIntoMonth(m, state.settings, imported),
    [state.settings, imported],
  );

  const analytics = useMemo(
    () => mergeImportedIntoMonth(currentMonth, state.settings, imported),
    [currentMonth, state.settings, imported],
  );

  const value: Ctx = {
    ...state,
    hotelName,
    onboarded,
    loading,
    organizationId,
    accountStatus,
    memberRole,
    isBookingAgent: memberRole === "hotel_staff",
    subscriptionStatus,
    currentMonth,
    imported,
    reloadImported,
    analyticsMonth: analytics.month,
    analyticsSettings: analytics.settings,
    analyticsFor,

    setCurrentMonthKey,
    updateCell,
    addBookingRange,
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
    setHotelName: setHotelNameCb,
    setLogoUrl,
    signOut,
  };

  return <HotelContext.Provider value={value}>{children}</HotelContext.Provider>;
}

export function useHotel() {
  const ctx = useContext(HotelContext);
  if (!ctx) throw new Error("useHotel must be used within HotelProvider");
  return ctx;
}
