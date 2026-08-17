// Builds an iCalendar (.ics) feed of confirmed in-app (offline/manual) reservations
// for a single room. Imported iCal reservations are intentionally excluded to
// avoid feedback loops with the source platform.

interface CellLike {
  price?: number;
  channelId?: string;
  note?: string;
  bookingId?: string;
  /** Absent means confirmed. Canceled/refunded nights release the room. */
  status?: "confirmed" | "noshow" | "canceled" | "refunded";
  canceledWithRefund?: boolean;
}

/** A night only blocks the room when the booking still stands. */
function blocksRoom(cell: CellLike): boolean {
  if (cell.status === "canceled" || cell.status === "refunded") return false;
  if (!cell.status && cell.canceledWithRefund) return false;
  return true;
}

type SlotLike = CellLike | CellLike[] | null;

interface MonthLike {
  year: number;
  monthIndex: number;
  cells?: Record<string, Record<string | number, SlotLike>>;
}

function slotCells(slot: SlotLike): CellLike[] {
  if (!slot) return [];
  return Array.isArray(slot) ? slot.filter(Boolean) : [slot];
}

export interface FeedBooking {
  uid: string;
  start: string; // yyyy-mm-dd (check-in)
  end: string; // yyyy-mm-dd (check-out, exclusive)
  summary: string;
  note?: string;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDay(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Collect blocking manual reservations for one room out of the hotel state blob. */
export function collectRoomBookings(data: unknown, roomName: string): FeedBooking[] {
  const months = (data as { months?: Record<string, MonthLike> } | null)?.months ?? {};
  // bookingId -> nights held by that booking (a day can hold several bookings)
  const byBooking = new Map<string, { nights: Set<string>; cell: CellLike }>();
  for (const month of Object.values(months)) {
    const days = month?.cells?.[roomName];
    if (!days) continue;
    for (const [dayKey, slot] of Object.entries(days)) {
      const day = Number(dayKey);
      if (!Number.isFinite(day)) continue;
      const date = iso(month.year, month.monthIndex, day);
      for (const cell of slotCells(slot)) {
        if (!blocksRoom(cell)) continue;
        const id = cell.bookingId ?? `${roomName}-${date}`;
        const entry = byBooking.get(id);
        if (entry) entry.nights.add(date);
        else byBooking.set(id, { nights: new Set([date]), cell });
      }
    }
  }

  const out: FeedBooking[] = [];
  for (const [id, { nights, cell }] of byBooking) {
    // A booking's nights are contiguous, but split on any gap defensively so a
    // released middle night never stays blocked in the feed.
    const sorted = Array.from(nights).sort();
    let run: string[] = [];
    let part = 0;
    const flush = () => {
      if (run.length === 0) return;
      part += 1;
      out.push({
        uid: `${id}${part > 1 ? `-${part}` : ""}@hotel-management`,
        start: run[0]!,
        end: addDay(run[run.length - 1]!),
        summary: "Reserved",
        ...(cell.note ? { note: cell.note } : {}),
      });
      run = [];
    };
    for (const date of sorted) {
      if (run.length > 0 && addDay(run[run.length - 1]!) !== date) flush();
      run.push(date);
    }
    flush();
  }
  out.sort((a, b) => (a.start === b.start ? a.uid.localeCompare(b.uid) : a.start.localeCompare(b.start)));
  return out;
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  let rest = line;
  chunks.push(rest.slice(0, 73));
  rest = rest.slice(73);
  while (rest.length > 72) {
    chunks.push(` ${rest.slice(0, 72)}`);
    rest = rest.slice(72);
  }
  if (rest.length) chunks.push(` ${rest}`);
  return chunks.join("\r\n");
}

export function buildIcs(roomName: string, bookings: FeedBooking[]): string {
  const stamp = `${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hotel Management//Room Feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(roomName)}`,
  ];
  for (const b of bookings) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeText(b.uid)}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${b.start.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${b.end.replace(/-/g, "")}`,
      `SUMMARY:${escapeText(b.summary)}`,
    );
    if (b.note) lines.push(`DESCRIPTION:${escapeText(b.note)}`);
    lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
