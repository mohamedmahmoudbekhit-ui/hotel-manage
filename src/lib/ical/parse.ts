// Minimal iCal parser: extracts VEVENTs into { uid, start, end, summary }.
// Handles line unfolding and DATE / DATE-TIME (UTC or naive) forms.
// Runs in both Worker and Node/browser environments.

export interface IcalEvent {
  uid: string;
  summary: string;
  /** yyyy-mm-dd */
  start: string;
  /** yyyy-mm-dd (exclusive per iCal convention) */
  end: string;
}

function unfoldLines(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function toIsoDate(value: string): string | null {
  // Accepts YYYYMMDD or YYYYMMDDTHHmmss[Z]
  const m = value.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function parseIcal(raw: string): IcalEvent[] {
  const lines = unfoldLines(raw);
  const events: IcalEvent[] = [];
  let current: Partial<IcalEvent> | null = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current && current.uid && current.start) {
        events.push({
          uid: current.uid,
          summary: current.summary ?? "",
          start: current.start,
          end: current.end ?? addDays(current.start, 1),
        });
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name] = head.split(";");

    switch (name) {
      case "UID":
        current.uid = value.trim();
        break;
      case "SUMMARY":
        current.summary = value.replace(/\\,/g, ",").replace(/\\n/gi, " ").trim();
        break;
      case "DTSTART": {
        const d = toIsoDate(value);
        if (d) current.start = d;
        break;
      }
      case "DTEND": {
        const d = toIsoDate(value);
        if (d) current.end = d;
        break;
      }
    }
  }
  return events;
}

export function isLikelyIcalUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" || u.protocol === "webcal:";
  } catch {
    return false;
  }
}
