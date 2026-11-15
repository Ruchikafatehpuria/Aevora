/**
 * Timezone-aware calendar helpers shared by server and client. Calendar dates are "YYYY-MM-DD"
 * strings; times are "HH:MM" strings in the user's own timezone.
 */

export type Ymd = string;

const pad = (n: number) => String(n).padStart(2, "0");

export function isValidTimezone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of an instant in a timezone. */
function parts(date: Date, tz: string) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return { y: o.year!, m: o.month!, d: o.day!, h: o.hour! % 24, min: o.minute!, s: o.second! };
}

/** Today's date in a timezone. */
export function todayIn(tz: string): Ymd {
  const p = parts(new Date(), tz);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

export function toZoned(date: Date, tz: string): { ymd: Ymd; hm: string } {
  const p = parts(date, tz);
  return { ymd: `${p.y}-${pad(p.m)}-${pad(p.d)}`, hm: `${pad(p.h)}:${pad(p.min)}` };
}

/** The instant at which the wall clock in `tz` shows `ymd hm`. */
export function zonedToUtc(ymd: Ymd, hm: string, tz: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const [h, min] = hm.split(":").map(Number);
  const wall = Date.UTC(y!, m! - 1, d!, h!, min!);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const p = parts(new Date(guess), tz);
    const shown = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s);
    guess += wall - shown;
  }
  return new Date(guess);
}

/** A date-only value as stored by Postgres DATE columns (UTC midnight). */
export const ymdToDate = (ymd: Ymd) => new Date(`${ymd}T00:00:00.000Z`);
export const dateToYmd = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(ymd: Ymd, n: number): Ymd {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return dateToYmd(d);
}

export function addMonths(ymd: Ymd, n: number): Ymd {
  const [y, m, d] = ymd.split("-").map(Number);
  const target = new Date(Date.UTC(y!, m! - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d!, last));
  return dateToYmd(target);
}

/** 0 = Sunday … 6 = Saturday. */
export const weekday = (ymd: Ymd) => ymdToDate(ymd).getUTCDay();

export const diffDays = (a: Ymd, b: Ymd) => Math.round((ymdToDate(a).getTime() - ymdToDate(b).getTime()) / 86_400_000);

export function isValidYmd(s: unknown): s is Ymd {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && dateToYmd(ymdToDate(s)) === s;
}

export const isValidHm = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/** "5:30 pm" style label for an "HH:MM" time. */
export function formatHm(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  const suffix = h! < 12 ? "am" : "pm";
  const h12 = h! % 12 || 12;
  return m ? `${h12}:${pad(m)} ${suffix}` : `${h12} ${suffix}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function formatYmd(ymd: Ymd, opts: { weekday?: boolean; year?: boolean } = {}) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${opts.weekday ? `${DAYS[weekday(ymd)]}, ` : ""}${d} ${MONTHS[m! - 1]}${opts.year ? ` ${y}` : ""}`;
}

/** "Today", "Tomorrow", "Yesterday", weekday name within the next week, otherwise "15 Nov". */
export function relativeDay(ymd: Ymd, today: Ymd) {
  const diff = diffDays(ymd, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday(ymd)]!;
  return formatYmd(ymd, { year: ymd.slice(0, 4) !== today.slice(0, 4) });
}

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const DAY_SHORT = DAYS;
