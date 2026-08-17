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

interface MonthLike {
  year: number;
  monthIndex: number;
  cells?: Record<string, Record<string | number, CellLike | null>>;
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

/** Collect confirmed manual reservations for one room out of the hotel state blob. */
export function collectRoomBookings(data: unknown, roomName: string): FeedBooking[] {
  const months = (data as { months?: Record<string, MonthLike> } | null)?.months ?? {};
  // date -> cell for this room
  const byDate = new Map<string, CellLike>();
  for (const month of Object.values(months)) {
    const days = month?.cells?.[roomName];
    if (!days) continue;
    for (const [dayKey, cell] of Object.entries(days)) {
      if (!cell) continue;
      const day = Number(dayKey);
      if (!Number.isFinite(day)) continue;
      byDate.set(iso(month.year, month.monthIndex, day), cell);
    }
  }

  const dates = Array.from(byDate.keys()).sort();
  const out: FeedBooking[] = [];
  let run: { id: string; nights: string[]; cell: CellLike } | null = null;

  const flush = () => {
    if (!run) return;
    const start = run.nights[0]!;
    const end = addDay(run.nights[run.nights.length - 1]!);
    out.push({
      uid: `${run.id}@hotel-management`,
      start,
      end,
      summary: "Reserved",
      ...(run.cell.note ? { note: run.cell.note } : {}),
    });
    run = null;
  };

  for (const date of dates) {
    const cell = byDate.get(date)!;
    const id = cell.bookingId ?? `${roomName}-${date}`;
    if (run && run.id === id && addDay(run.nights[run.nights.length - 1]!) === date) {
      run.nights.push(date);
      continue;
    }
    flush();
    run = { id, nights: [date], cell };
  }
  flush();
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
