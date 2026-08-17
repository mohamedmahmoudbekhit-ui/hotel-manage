import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import type { BookingStatus, Cell, CellSlot, Channel, ExpenseItem, MonthData, RefundDirection, Settings } from "./types";
import { DEFAULT_CHANNELS, cellStatus, emptyMonth, MONTH_NAMES, mergeImportedIntoMonth, newBookingId, newChannelId, nightsBetween, slotCells, sumExpenses, toSlot } from "./utils";
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

  updateCell: (room: string, day: number, cell: Cell | null, targetBookingId?: string) => void;
  updateBooking: (bookingId: string, patch: Partial<Pick<Cell, "channelId" | "note" | "guestName" | "status">>) => void;
  /** Set the status of every night of a booking (refund data only for "refunded"). */
  setBookingStatus: (bookingId: string, status: BookingStatus, refund?: { direction: RefundDirection; amount: number } | null) => void;
  /** Persisted status of a booking. */
  statusOf: (bookingId: string) => BookingStatus;
  /** Current refund of a booking, with the amount as the booking total. */
  refundOf: (bookingId: string) => { direction: RefundDirection; amount: number } | null;
  /** Whole-booking info for the edit form (dates, room, total, channel...). */
  bookingInfo: (bookingId: string) => BookingInfo | null;
  /** Rewrite a whole booking as one unit (dates/room/channel/total price). */
  updateBookingRange: (bookingId: string, params: { room: string; from: string; to: string; channelId: string; price: number; note?: string; guestName?: string; status?: BookingStatus; refund?: { direction: RefundDirection; amount: number } | null }) => { written: number; skipped: number; nights: number };
  /** Delete a whole reservation (every night sharing the bookingId). */
  deleteBooking: (bookingId: string) => void;
  addBookingRange: (params: { room: string; from: string; to: string; channelId: string; price: number; note?: string; guestName?: string; allowOverlap?: boolean; status?: BookingStatus; refund?: { direction: RefundDirection; amount: number } | null }) => { written: number; skipped: number; nights: number };

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

export interface BookingInfo {
  bookingId: string;
  room: string;
  /** Check-in ISO date (first night). */
  from: string;
  /** Check-out ISO date (last night + 1). */
  to: string;
  nights: number;
  /** Sum of the nightly prices, in the channel currency. */
  total: number;
  channelId: string;
  note?: string;
  guestName?: string;
  status: BookingStatus;
  refund: { direction: RefundDirection; amount: number } | null;
}

/**
 * Split a total across N nights so the nightly values always sum back to the
 * exact total (remainder cents go to the first nights).
 */
function distributeTotal(total: number, nights: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / nights);
  let rest = cents - base * nights;
  return Array.from({ length: nights }, () => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return (base + extra) / 100;
  });
}

/** ISO date list of the nights of a stay (check-out excluded). */
function nightDates(from: string, nights: number): Date[] {
  const start = new Date(`${from}T00:00:00Z`);
  const out: Date[] = [];
  const cursor = new Date(start);
  for (let i = 0; i < nights; i++) {
    out.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
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

const MONTH_STORAGE_KEY = "hotel.currentMonthKey";

function readStoredMonthKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(MONTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function persistMonthKey(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MONTH_STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
}

/** Ensure the default month exists; restore the last selected month when available. */
function withDefaultMonth(s: StateShape): StateShape {
  const months = { ...s.months };
  const key = `${MONTH_NAMES[DEFAULT_MONTH_INDEX]} ${DEFAULT_YEAR}`;
  if (!months[key]) months[key] = emptyMonth(DEFAULT_YEAR, DEFAULT_MONTH_INDEX, s.settings);
  const stored = readStoredMonthKey();
  const selected = stored && months[stored] ? stored : months[s.currentMonthKey] ? s.currentMonthKey : key;
  return { ...s, months, currentMonthKey: selected };
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
  const note = typeof r.note === "string" ? r.note : undefined;
  const guestName = typeof r.guestName === "string" ? r.guestName : undefined;
  const bookingId = typeof r.bookingId === "string" ? r.bookingId : undefined;
  // Status is the single source of truth; legacy shapes are mapped onto it so
  // refunds/cancellations survive a reload.
  const rawStatus = typeof r.status === "string" ? r.status : undefined;
  let status: BookingStatus | undefined;
  if (rawStatus === "noshow" || rawStatus === "canceled" || rawStatus === "refunded") status = rawStatus;
  else if (rawStatus === "Cancelled") status = "canceled";
  if (!status && r.canceledWithRefund === true) status = "refunded";
  const refundDirection = r.refundDirection === "to_host" || r.refundDirection === "to_guest" ? r.refundDirection : undefined;
  const refundAmountRaw = Number(r.refundAmount);
  const refundAmount = isFinite(refundAmountRaw) ? refundAmountRaw : undefined;
  return {
    price,
    channelId,
    ...(note ? { note } : {}),
    ...(guestName ? { guestName } : {}),
    ...(bookingId ? { bookingId } : {}),
    ...(status ? { status } : {}),
    ...(status === "refunded"
      ? { refundDirection: refundDirection ?? "to_guest", refundAmount: refundAmount ?? 0 }
      : {}),
  };
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

function migrateSlot(raw: unknown): CellSlot {
  if (Array.isArray(raw)) {
    const list = raw.map((c) => migrateCell(c)).filter((c): c is Cell => c != null);
    return toSlot(list);
  }
  return migrateCell(raw);
}

function migrateMonth(m: MonthData): MonthData {
  const cells: MonthData["cells"] = {};
  for (const [room, days] of Object.entries(m.cells ?? {})) {
    cells[room] = {};
    for (const [d, c] of Object.entries(days ?? {})) {
      cells[room][Number(d)] = migrateSlot(c);
    }
    // Legacy backfill: nights saved before bookingId existed get grouped when
    // they are contiguous and share channel + price + note.
    const days2 = Object.keys(cells[room]).map(Number).sort((a, b) => a - b);
    let runId: string | null = null;
    let prevDay = -99;
    let prevCell: Cell | null = null;
    for (const d of days2) {
      const list = slotCells(cells[room][d]);
      if (list.length !== 1) { runId = null; prevCell = null; prevDay = d; continue; }
      const cell = list[0]!;
      if (cell.bookingId) { runId = null; prevCell = cell; prevDay = d; continue; }
      const contiguous =
        prevCell != null &&
        d === prevDay + 1 &&
        runId != null &&
        prevCell.channelId === cell.channelId &&
        prevCell.price === cell.price &&
        (prevCell.note ?? "") === (cell.note ?? "");
      if (!contiguous) runId = newBookingId();
      const next: Cell = { ...cell, bookingId: runId! };
      cells[room][d] = next;
      prevCell = next;
      prevDay = d;
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

  const setCurrentMonthKey = useCallback((k: string) => {
    persistMonthKey(k);
    setState((s) => ({ ...s, currentMonthKey: k }));
  }, []);


  const updateCell = useCallback((room: string, day: number, cell: Cell | null, targetBookingId?: string) => {
    setState((s) => {
      const m = s.months[s.currentMonthKey];
      if (!m) return s;
      const existing = slotCells(m.cells[room]?.[day]);
      const targetId = targetBookingId ?? cell?.bookingId;
      const idx = targetId ? existing.findIndex((c) => c.bookingId === targetId) : existing.length === 1 ? 0 : -1;

      let next: Cell[];
      if (!cell) {
        next = idx >= 0 ? existing.filter((_, i) => i !== idx) : [];
      } else {
        const withId: Cell = {
          ...cell,
          bookingId: cell.bookingId ?? (idx >= 0 ? existing[idx]!.bookingId : undefined) ?? newBookingId(),
        };
        next = idx >= 0 ? existing.map((c, i) => (i === idx ? withId : c)) : [...existing, withId];
      }
      const cells = { ...m.cells, [room]: { ...(m.cells[room] ?? {}), [day]: toSlot(next) } };
      return { ...s, months: { ...s.months, [s.currentMonthKey]: { ...m, cells } } };
    });
  }, []);

  const updateBooking = useCallback((bookingId: string, patch: Partial<Pick<Cell, "channelId" | "note" | "guestName" | "status">>) => {
    setState((s) => {
      let anyChanged = false;
      const months: Record<string, MonthData> = {};
      for (const [key, month] of Object.entries(s.months)) {
        let monthChanged = false;
        const cells: MonthData["cells"] = {};
        for (const [room, days] of Object.entries(month.cells)) {
          cells[room] = {};
          for (const [day, slot] of Object.entries(days)) {
            const next = slotCells(slot).map((cell) => {
              if (cell.bookingId !== bookingId) return cell;
              monthChanged = true;
              anyChanged = true;
              const merged: Cell = { ...cell, ...patch };
              if (patch.note === undefined) delete merged.note;
              if (patch.guestName === undefined) delete merged.guestName;
              if (patch.status === undefined) delete merged.status;
              return merged;
            });
            cells[room][Number(day)] = toSlot(next);
          }
        }
        months[key] = monthChanged ? { ...month, cells } : month;
      }
      return anyChanged ? { ...s, months } : s;
    });
  }, []);

  /** Persisted status of a booking (all its nights share one status). */
  const statusOf = useCallback(
    (bookingId: string): BookingStatus => {
      for (const month of Object.values(state.months)) {
        for (const days of Object.values(month.cells)) {
          for (const slot of Object.values(days)) {
            for (const cell of slotCells(slot)) {
              if (cell.bookingId === bookingId) return cellStatus(cell);
            }
          }
        }
      }
      return "confirmed";
    },
    [state.months],
  );

  /** Total refund of a booking (sum of the per-night shares) plus its direction. */
  const refundOf = useCallback(
    (bookingId: string): { direction: RefundDirection; amount: number } | null => {
      let direction: RefundDirection | null = null;
      let amount = 0;
      for (const month of Object.values(state.months)) {
        for (const days of Object.values(month.cells)) {
          for (const slot of Object.values(days)) {
            for (const cell of slotCells(slot)) {
              if (cell.bookingId !== bookingId || cellStatus(cell) !== "refunded") continue;
              direction = cell.refundDirection ?? "to_guest";
              amount += Number(cell.refundAmount) || 0;
            }
          }
        }
      }
      return direction ? { direction, amount: Math.round(amount * 100) / 100 } : null;
    },
    [state.months],
  );

  /**
   * Set the status of every night of a booking. Refund data is only kept for
   * the "refunded" status and is split evenly across the nights, so switching
   * status never leaves a stale adjustment behind.
   */
  const setBookingStatus = useCallback(
    (bookingId: string, status: BookingStatus, refund?: { direction: RefundDirection; amount: number } | null) => {
      setState((s) => {
        let nights = 0;
        for (const month of Object.values(s.months)) {
          for (const days of Object.values(month.cells)) {
            for (const slot of Object.values(days)) {
              for (const cell of slotCells(slot)) if (cell.bookingId === bookingId) nights += 1;
            }
          }
        }
        if (nights === 0) return s;
        const perNight = status === "refunded" && refund ? refund.amount / nights : 0;
        const months: Record<string, MonthData> = {};
        for (const [key, month] of Object.entries(s.months)) {
          let monthChanged = false;
          const cells: MonthData["cells"] = {};
          for (const [room, days] of Object.entries(month.cells)) {
            cells[room] = {};
            for (const [day, slot] of Object.entries(days)) {
              const next = slotCells(slot).map((cell) => {
                if (cell.bookingId !== bookingId) return cell;
                monthChanged = true;
                const merged: Cell = { ...cell };
                delete merged.canceledWithRefund; // legacy flag is never written again
                delete merged.refundDirection;
                delete merged.refundAmount;
                if (status === "confirmed") delete merged.status;
                else merged.status = status;
                if (status === "refunded" && refund) {
                  merged.refundDirection = refund.direction;
                  merged.refundAmount = perNight;
                }
                return merged;
              });
              cells[room][Number(day)] = toSlot(next);
            }
          }
          months[key] = monthChanged ? { ...month, cells } : month;
        }
        return { ...s, months };
      });
    },
    [],
  );


  /** Collect a whole booking (all its nights across months) as one reservation. */
  const bookingInfo = useCallback(
    (bookingId: string): BookingInfo | null => {
      let room: string | null = null;
      let first: Date | null = null;
      let last: Date | null = null;
      let total = 0;
      let nights = 0;
      let sample: Cell | null = null;
      for (const month of Object.values(state.months)) {
        for (const [r, days] of Object.entries(month.cells)) {
          for (const [day, slot] of Object.entries(days)) {
            for (const cell of slotCells(slot)) {
              if (cell.bookingId !== bookingId) continue;
              room = r;
              sample = sample ?? cell;
              nights += 1;
              total += Number(cell.price) || 0;
              const d = new Date(Date.UTC(month.year, month.monthIndex, Number(day)));
              if (!first || d < first) first = d;
              if (!last || d > last) last = d;
            }
          }
        }
      }
      if (!room || !sample || !first || !last) return null;
      const checkout = new Date(last);
      checkout.setUTCDate(checkout.getUTCDate() + 1);
      return {
        bookingId,
        room,
        from: first.toISOString().slice(0, 10),
        to: checkout.toISOString().slice(0, 10),
        nights,
        total: Math.round(total * 100) / 100,
        channelId: sample.channelId,
        ...(sample.note ? { note: sample.note } : {}),
        ...(sample.guestName ? { guestName: sample.guestName } : {}),
        status: cellStatus(sample),
        refund: refundOf(bookingId),
      };
    },
    [state.months, refundOf],
  );

  /**
   * Rewrite a booking as ONE reservation: its nights are cleared and re-written
   * over the new range, with the total price redistributed across the nights.
   */
  const updateBookingRange = useCallback(
    (
      bookingId: string,
      params: { room: string; from: string; to: string; channelId: string; price: number; note?: string; guestName?: string; status?: BookingStatus; refund?: { direction: RefundDirection; amount: number } | null },
    ) => {
      const nights = nightsBetween(params.from, params.to);
      if (nights <= 0) return { written: 0, skipped: 0, nights: 0 };
      const nightly = distributeTotal(params.price, nights);
      const status: BookingStatus = params.status ?? "confirmed";
      const refundNightly =
        status === "refunded" && params.refund ? distributeTotal(params.refund.amount, nights) : null;
      let written = 0;
      let skipped = 0;
      setState((s) => {
        // 1. clear every existing night of this booking
        const nextMonths: Record<string, MonthData> = {};
        for (const [key, month] of Object.entries(s.months)) {
          const cells: MonthData["cells"] = {};
          for (const [room, days] of Object.entries(month.cells)) {
            cells[room] = {};
            for (const [day, slot] of Object.entries(days)) {
              cells[room][Number(day)] = toSlot(slotCells(slot).filter((c) => c.bookingId !== bookingId));
            }
          }
          nextMonths[key] = { ...month, cells };
        }
        // 2. write the new range
        nightDates(params.from, nights).forEach((dt, i) => {
          const y = dt.getUTCFullYear();
          const mi = dt.getUTCMonth();
          const day = dt.getUTCDate();
          const key = `${MONTH_NAMES[mi]} ${y}`;
          const month = nextMonths[key] ?? emptyMonth(y, mi, s.settings);
          const rooms = { ...month.cells };
          if (!rooms[params.room]) {
            rooms[params.room] = {};
            for (let dd = 1; dd <= month.daysInMonth; dd++) rooms[params.room][dd] = null;
          }
          const existing = slotCells(rooms[params.room][day]);
          if (existing.length > 0) { skipped += 1; nextMonths[key] = { ...month, cells: rooms }; return; }
          const added: Cell = {
            price: nightly[i]!,
            channelId: params.channelId,
            bookingId,
            ...(params.note ? { note: params.note } : {}),
            ...(params.guestName ? { guestName: params.guestName } : {}),
            ...(status !== "confirmed" ? { status } : {}),
            ...(refundNightly && params.refund
              ? { refundDirection: params.refund.direction, refundAmount: refundNightly[i]! }
              : {}),
          };
          rooms[params.room] = { ...rooms[params.room], [day]: toSlot([added]) };
          nextMonths[key] = { ...month, cells: rooms };
          written += 1;
        });
        return { ...s, months: nextMonths };
      });
      return { written, skipped, nights };
    },
    [],
  );

  /** Remove every night of a reservation, wherever it spans months. */
  const deleteBooking = useCallback((bookingId: string) => {
    if (!bookingId) return;
    setState((s) => {
      const nextMonths: Record<string, MonthData> = {};
      for (const [key, month] of Object.entries(s.months)) {
        const cells: MonthData["cells"] = {};
        for (const [room, days] of Object.entries(month.cells)) {
          cells[room] = {};
          for (const [day, slot] of Object.entries(days)) {
            cells[room][Number(day)] = toSlot(slotCells(slot).filter((c) => c.bookingId !== bookingId));
          }
        }
        nextMonths[key] = { ...month, cells };
      }
      return { ...s, months: nextMonths };
    });
  }, []);


  const addBookingRange = useCallback((params: { room: string; from: string; to: string; channelId: string; price: number; note?: string; guestName?: string; allowOverlap?: boolean; status?: BookingStatus; refund?: { direction: RefundDirection; amount: number } | null }) => {
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
    const status: BookingStatus = params.status ?? "confirmed";
    const refundPerNight = status === "refunded" && params.refund ? params.refund.amount / nights : 0;
    const bookingId = newBookingId();
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
        const existing = slotCells(rooms[params.room][day]);
        if (existing.length > 0 && !params.allowOverlap) { skipped += 1; nextMonths[key] = { ...month, cells: rooms }; continue; }
        const added: Cell = {
          price: perNight,
          channelId: params.channelId,
          bookingId,
          ...(params.note ? { note: params.note } : {}),
          ...(params.guestName ? { guestName: params.guestName } : {}),
          ...(status !== "confirmed" ? { status } : {}),
          ...(status === "refunded" && params.refund
            ? { refundDirection: params.refund.direction, refundAmount: refundPerNight }
            : {}),
        };
        const slot: CellSlot = toSlot([...existing, added]);
        const roomCells = { ...rooms[params.room], [day]: slot };
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
      persistMonthKey(m.key);
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
    const timer = window.setInterval(reloadImported, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") reloadImported(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
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
    updateBooking,
    setBookingStatus,
    statusOf,
    refundOf,

    addBookingRange,
    bookingInfo,
    updateBookingRange,
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
