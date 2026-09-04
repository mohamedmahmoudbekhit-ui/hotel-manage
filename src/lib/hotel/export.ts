import type { MonthData, Settings } from "./types";
import { cellRevenueLocal, cellStatus, findChannel, importedStatus, MONTH_NAMES, nightsBetween, resolveImportedChannel, slotCells } from "./utils";
import type { ImportedReservationRow } from "./calendar.functions";

export interface BookingExportRow {
  guestName: string;
  room: string;
  checkIn: string; // yyyy-mm-dd
  checkOut: string; // yyyy-mm-dd (exclusive, i.e. departure day)
  source: string;
  sourceKey: string;
  status: string;
  guests: string;
  amount: number; // local currency
  nights: number;
  currency: string; // channel currency code shown to the user
}

export interface ExportFilters {
  from: string; // yyyy-mm-dd
  to: string; // yyyy-mm-dd
  sourceKey: string; // "all" | channel id | ical source id
  room: string; // "all" | room name
}

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  canceled: "Canceled",
  noshow: "No Show / Early Departure",
  refunded: "Canceled with Refund",
};

function iso(y: number, mIndex: number, day: number) {
  return `${y}-${String(mIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function addDays(isoDate: string, delta: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function firstLine(s: string | null | undefined): string {
  if (!s) return "";
  return s.split("\n")[0].trim();
}

/** Aggregate consecutive manual cells (same room/channel/note) into stays, plus imported reservations. */
export function buildBookingRows(
  month: MonthData,
  settings: Settings,
  imported: ImportedReservationRow[],
): BookingExportRow[] {
  const rows: BookingExportRow[] = [];

  for (const room of settings.rooms) {
    // Group nights by bookingId so overlapping / replacement bookings on the
    // same night each export as their own row.
    interface Run { startDay: number; endDay: number; channelId: string; note?: string; amount: number; nights: number; status: string }
    const runs = new Map<string, Run>();
    const order: string[] = [];

    for (let d = 1; d <= month.daysInMonth; d++) {
      const list = slotCells(month.cells[room]?.[d]);
      for (const cell of list) {
        const key = cell.bookingId ?? `${room}-${d}-${cell.channelId}`;
        const revenue = cellRevenueLocal(cell, month.usdRate, settings);
        const existing = runs.get(key);
        if (existing) {
          existing.endDay = d;
          existing.amount += revenue;
          existing.nights += 1;
        } else {
          runs.set(key, {
            startDay: d, endDay: d, channelId: cell.channelId, note: cell.note,
            amount: revenue, nights: 1, status: cellStatus(cell),
          });
          order.push(key);
        }
      }
    }

    for (const key of order) {
      const run = runs.get(key)!;
      const ch = findChannel(settings, run.channelId);
      rows.push({
        guestName: firstLine(run.note) || "—",
        room,
        checkIn: iso(month.year, month.monthIndex, run.startDay),
        checkOut: addDays(iso(month.year, month.monthIndex, run.endDay), 1),
        source: ch.name,
        sourceKey: ch.id,
        status: STATUS_LABEL[run.status] ?? "Confirmed",
        guests: "—",
        amount: run.amount,
        nights: run.nights,
        currency: ch.currency === "LOCAL" ? settings.currency : "USD",
      });
    }
  }

  for (const r of imported) {
    const start = (r.start_date ?? "").slice(0, 10);
    const end = (r.end_date ?? "").slice(0, 10);
    if (!start || !end) continue;
    const nights = nightsBetween(start, end);
    if (nights <= 0) continue;
    const ch = resolveImportedChannel(settings, r);
    const status = importedStatus(r);
    const refund = Number(r.refund_amount) || 0;
    // Canceled bookings drop their original amount; only the signed refund counts.
    const total =
      status === "refunded"
        ? (r.refund_direction === "to_host" ? refund : -refund)
        : status === "canceled"
          ? 0
          : (r.override_price ?? 0);
    // Imported prices are entered in the mapped channel's currency.
    const amountLocal = ch.currency === "USD" ? total * month.usdRate : total;
    rows.push({
      guestName: firstLine(r.summary) || firstLine(r.override_notes) || "—",
      room: r.room_name,
      checkIn: start,
      checkOut: end,
      source: ch.name,
      sourceKey: r.source_id,
      status: STATUS_LABEL[status] ?? "Confirmed",
      guests: "—",
      amount: amountLocal,
      nights,
      currency: ch.currency === "LOCAL" ? settings.currency : "USD",
    });
  }

  rows.sort((a, b) => a.checkIn.localeCompare(b.checkIn) || a.room.localeCompare(b.room));
  return rows;
}

export function applyFilters(rows: BookingExportRow[], f: ExportFilters): BookingExportRow[] {
  return rows.filter((r) => {
    if (f.room !== "all" && r.room !== f.room) return false;
    if (f.sourceKey !== "all" && r.sourceKey !== f.sourceKey) return false;
    // overlap with [from, to] inclusive of nights
    if (f.from && r.checkOut <= f.from) return false;
    if (f.to && r.checkIn > f.to) return false;
    return true;
  });
}

function csvCell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: BookingExportRow[], currency: string): string {
  const header = [
    "Guest Name",
    "Room Number",
    "Check-in Date",
    "Check-out Date",
    "Booking Source",
    "Booking Status",
    "Nights",
    "Number of Guests",
    "Channel Currency",
    `Total Amount (${currency})`,
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [r.guestName, r.room, r.checkIn, r.checkOut, r.source, r.status, r.nights, r.guests, r.currency, (Number(r.amount) || 0).toFixed(2)]
        .map(csvCell)
        .join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}

export function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportFileBase(month: MonthData, suffix = ""): string {
  return `bookings-${MONTH_NAMES[month.monthIndex].toLowerCase()}-${month.year}${suffix}`;
}

export async function exportPdf(opts: {
  rows: BookingExportRow[];
  hotelName: string;
  currency: string;
  periodLabel: string;
  filterSummary: string;
  filename: string;
}) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, opts: unknown) => void }).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generated = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(opts.hotelName || "Hotel Management", 40, 40);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text("Booking report", 40, 58);
  doc.text(`Period: ${opts.periodLabel}`, 40, 74);
  doc.text(`Total bookings: ${opts.rows.length}`, 40, 90);
  if (opts.filterSummary) doc.text(`Filters: ${opts.filterSummary}`, 40, 106);
  doc.text(`Generated: ${generated}`, pageWidth - 40, 58, { align: "right" });
  doc.setDrawColor(210);
  doc.line(40, opts.filterSummary ? 116 : 100, pageWidth - 40, opts.filterSummary ? 116 : 100);

  // Sum exact stored amounts first; format to 2 decimals only for display.
  const total = opts.rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const money = (n: number) =>
    (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  autoTable(doc, {
    startY: opts.filterSummary ? 128 : 112,
    margin: { left: 40, right: 40, bottom: 40 },
    head: [["Guest Name", "Room", "Check-in", "Check-out", "Nights", "Source", "Status", `Amount (${opts.currency})`]],
    body: opts.rows.map((r) => [
      r.guestName,
      r.room,
      r.checkIn,
      r.checkOut,
      String(r.nights),
      r.source,
      r.status,
      money(r.amount),
    ]),
    foot: [["", "", "", "", String(opts.rows.reduce((n, r) => n + r.nights, 0)), "", "Total", money(total)]],
    showFoot: "lastPage",
    styles: { fontSize: 9, cellPadding: 5, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [241, 245, 249], textColor: 20, fontStyle: "bold", halign: "left" },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 4: { halign: "right" }, 7: { halign: "right" } },
    didParseCell: (data: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
      if (data.section === "foot" && (data.column.index === 7 || data.column.index === 4)) data.cell.styles.halign = "right";
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 40, doc.internal.pageSize.getHeight() - 20, { align: "right" });
    doc.text(opts.hotelName || "Hotel Management", 40, doc.internal.pageSize.getHeight() - 20);
  }

  doc.save(opts.filename);
}

