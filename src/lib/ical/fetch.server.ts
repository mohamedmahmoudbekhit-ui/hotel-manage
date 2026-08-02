// Server-only: SSRF-hardened iCal fetching.
// Pure JS (no node:dns / node:net) so it runs in the serverless Worker runtime.

const MAX_REDIRECTS = 5;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const FETCH_TIMEOUT_MS = 20_000;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isIpv4(host: string): number[] | null {
  const m = host.match(IPV4);
  if (!m) return null;
  const parts = m.slice(1, 5).map(Number);
  if (parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) return null;
  return parts;
}

function isBlockedIpv4(parts: number[]): boolean {
  const [a, b] = parts as [number, number];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local + cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function assertPublicHost(hostname: string): void {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new Error("Invalid host in URL");

  const v4 = isIpv4(host);
  if (v4) {
    if (isBlockedIpv4(v4)) throw new Error("This URL points to a private network address and is not allowed");
    return;
  }
  // IPv6 literal
  if (host.includes(":")) {
    if (host === "::1" || host === "::") throw new Error("This URL points to a private network address and is not allowed");
    if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
      throw new Error("This URL points to a private network address and is not allowed");
    }
    if (host.startsWith("::ffff:")) {
      const mapped = host.replace("::ffff:", "");
      const m = isIpv4(mapped);
      if (m && isBlockedIpv4(m)) throw new Error("This URL points to a private network address and is not allowed");
    }
    return;
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".home.arpa") ||
    !host.includes(".")
  ) {
    throw new Error("This URL points to an internal host and is not allowed");
  }
}

export interface FetchIcalResult {
  body: string;
  finalUrl: string;
  contentType: string | null;
  bytes: number;
}

/** Normalise webcal:// and trim whitespace. */
export function normalizeIcalUrl(raw: string): string {
  return raw.trim().replace(/^webcal:/i, "https:");
}

export async function fetchIcal(rawUrl: string): Promise<FetchIcalResult> {
  let currentUrl = normalizeIcalUrl(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let u: URL;
    try {
      u = new URL(currentUrl);
    } catch {
      throw new Error("The URL is not valid");
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      throw new Error("Only http(s) and webcal URLs are supported");
    }
    assertPublicHost(u.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(u.toString(), {
        headers: {
          Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8",
          "User-Agent": "Mozilla/5.0 (compatible; HotelManagement/1.0; +ical-sync)",
        },
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error("The calendar server did not respond in time (20s timeout)");
      }
      throw new Error(`Could not reach the calendar server: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`The calendar server returned a redirect without a target (HTTP ${res.status})`);
      currentUrl = new URL(loc, u).toString();
      continue;
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Access denied by the calendar provider (HTTP ${res.status}). The link may have been revoked — copy a fresh export link.`);
      }
      if (res.status === 404) {
        throw new Error("Calendar not found (HTTP 404). Double-check the export link.");
      }
      if (res.status === 429) {
        throw new Error("The calendar provider is rate-limiting requests (HTTP 429). Try again in a few minutes.");
      }
      throw new Error(`The calendar server returned HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type");
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) throw new Error("The calendar file is too large (over 5 MB)");
    const body = new TextDecoder("utf-8").decode(buf);

    if (!/BEGIN:VCALENDAR/i.test(body)) {
      const looksHtml = /^\s*<(!doctype|html)/i.test(body);
      throw new Error(
        looksHtml
          ? "That link returned a web page, not a calendar file. Use the .ics export link from your channel."
          : "The response is not a valid iCalendar file (no BEGIN:VCALENDAR found)",
      );
    }

    return { body, finalUrl: u.toString(), contentType, bytes: buf.byteLength };
  }
  throw new Error("Too many redirects while fetching the calendar");
}
