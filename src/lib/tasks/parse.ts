/**
 * Quick-add parser: turns "Submit ML assignment tomorrow 5pm !high #college every week" into a task.
 * Pure and shared by the client (live preview) and the server (authoritative parse).
 */
import { addDays, addMonths, isValidYmd, weekday, type Ymd } from "@/lib/time";

export type Priority = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT";
export type RepeatRule = "NONE" | "DAILY" | "WEEKDAYS" | "WEEKLY" | "MONTHLY";

export type ParsedTask = {
  title: string;
  dueDate: Ymd | null;
  dueTime: string | null;
  priority: Priority;
  project: string | null;
  repeat: RepeatRule;
  /** Labels for recognised priority, project and repeat (the date is shown from dueDate/dueTime). */
  matched: string[];
};

const DAY_NAMES: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};
const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const DAY_RE = Object.keys(DAY_NAMES).sort((a, b) => b.length - a.length).join("|");
// Bare short names like "sun" or "sat" are ordinary words; they only count after on/by/next/this.
const FULL_DAY_RE = "sunday|monday|tuesday|wednesday|thursday|friday|saturday";
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");

const pad = (n: number) => String(n).padStart(2, "0");

/** The next date (after today) falling on the given weekday. */
function nextWeekday(today: Ymd, target: number) {
  return addDays(today, (target - weekday(today) + 7) % 7 || 7);
}

/** A day/month without a year means the next time that date comes round. */
function upcoming(today: Ymd, month: number, day: number): Ymd | null {
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const ymd = `${y}-${pad(month)}-${pad(day)}`;
    if (isValidYmd(ymd) && ymd >= today) return ymd;
  }
  return null;
}

function to24(h: number, min: number, ampm?: string) {
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith("p");
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (pm ? 12 : 0);
  }
  if (h > 23 || min > 59) return null;
  return `${pad(h)}:${pad(min)}`;
}

export function parseQuickAdd(input: string, today: Ymd): ParsedTask {
  let text = ` ${input.replace(/\s+/g, " ").trim()} `;
  const out: ParsedTask = { title: "", dueDate: null, dueTime: null, priority: "NONE", project: null, repeat: "NONE", matched: [] };

  /** Removes the first match of `re` (if any) and hands its groups to `fn`; returning false keeps the text. */
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = text.match(re);
    if (!m || m.index === undefined) return false;
    if (fn(m) === false) return false;
    text = `${text.slice(0, m.index)} ${text.slice(m.index + m[0].length)}`;
    return true;
  };

  // Priority: !urgent !high !medium !low, !1..!4, p1..p4
  take(/\s(?:!(urgent|high|medium|med|low|[1-4])|p([1-4]))(?=\s)/i, (m) => {
    const v = (m[1] ?? m[2]!).toLowerCase();
    const map: Record<string, Priority> = { urgent: "URGENT", "1": "URGENT", high: "HIGH", "2": "HIGH", medium: "MEDIUM", med: "MEDIUM", "3": "MEDIUM", low: "LOW", "4": "LOW" };
    out.priority = map[v]!;
    out.matched.push(`${out.priority[0]}${out.priority.slice(1).toLowerCase()} priority`);
  });

  // Project: #name (letters, digits, - and _)
  take(/\s#([\p{L}\p{N}][\p{L}\p{N}_-]{0,39})(?=\s)/u, (m) => {
    out.project = m[1]!;
    out.matched.push(`#${m[1]}`);
  });

  // Repeat: every day / daily / weekdays / every week / weekly / every monday / every month / monthly
  take(new RegExp(`\\s(?:every\\s+(day|weekday|week|month|${DAY_RE})|(daily|weekly|monthly)|(?:every\\s+)?weekdays)(?=\\s)`, "i"), (m) => {
    const v = (m[1] ?? m[2] ?? "weekdays").toLowerCase();
    if (v === "day" || v === "daily") out.repeat = "DAILY";
    else if (v === "weekday" || v === "weekdays") out.repeat = "WEEKDAYS";
    else if (v === "week" || v === "weekly") out.repeat = "WEEKLY";
    else if (v === "month" || v === "monthly") out.repeat = "MONTHLY";
    else {
      out.repeat = "WEEKLY";
      out.dueDate ??= weekday(today) === DAY_NAMES[v] ? today : nextWeekday(today, DAY_NAMES[v]!);
    }
    out.matched.push({ DAILY: "Every day", WEEKDAYS: "Every weekday", WEEKLY: "Every week", MONTHLY: "Every month", NONE: "" }[out.repeat]);
  });

  // Time: at 5pm, 5:30 pm, 17:00, at 9, noon, tonight
  const timeFound =
    take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)(?=\s)/i, (m) => {
      const t = to24(Number(m[1]), Number(m[2] ?? 0), m[3]);
      if (!t) return false;
      out.dueTime = t;
    }) ||
    take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => {
      out.dueTime = to24(Number(m[1]), Number(m[2]))!;
    }) ||
    take(/\sat\s+(\d{1,2})(?=\s)/i, (m) => {
      const h = Number(m[1]);
      if (h < 1 || h > 23) return false;
      // "at 5" during the day means 5 pm; "at 9" means 9 am.
      out.dueTime = to24(h <= 7 ? h + 12 : h, 0)!;
    }) ||
    take(/\s(?:at\s+)?(noon|midday|midnight)(?=\s)/i, (m) => {
      out.dueTime = m[1]!.toLowerCase() === "midnight" ? "23:59" : "12:00";
    });

  // Dates
  const setDate = (ymd: Ymd | null) => {
    if (!ymd) return false;
    out.dueDate = ymd;
  };
  const dateFound =
    take(/\s(today|tod)(?=\s)/i, () => setDate(today)) ||
    take(/\s(tonight)(?=\s)/i, () => {
      setDate(today);
      out.dueTime ??= "20:00";
    }) ||
    take(/\s(tomorrow|tmrw|tmr|tomorow)(?=\s)/i, () => setDate(addDays(today, 1))) ||
    take(/\s(day after tomorrow)(?=\s)/i, () => setDate(addDays(today, 2))) ||
    take(/\snext\s+week(?=\s)/i, () => setDate(nextWeekday(today, 1))) ||
    take(/\snext\s+month(?=\s)/i, () => setDate(addMonths(today.slice(0, 8) + "01", 1))) ||
    take(/\s(?:this\s+)?weekend(?=\s)/i, () => setDate(weekday(today) === 6 ? today : nextWeekday(today, 6))) ||
    take(/\sin\s+(\d{1,3})\s+(day|days|week|weeks|month|months)(?=\s)/i, (m) => {
      const n = Number(m[1]);
      const unit = m[2]!.toLowerCase();
      setDate(unit.startsWith("day") ? addDays(today, n) : unit.startsWith("week") ? addDays(today, n * 7) : addMonths(today, n));
    }) ||
    take(new RegExp(`\\s(?:(next|this|on|by)\\s+(${DAY_RE})|(${FULL_DAY_RE}))(?=\\s)`, "i"), (m) => {
      const target = DAY_NAMES[(m[2] ?? m[3])!.toLowerCase()]!;
      // "next friday" is the Friday of next week; plain "friday" is the coming one.
      setDate(m[1]?.toLowerCase() === "next" ? nextWeekday(addDays(today, 6 - weekday(today)), target) : nextWeekday(today, target));
    }) ||
    take(/\s(?:on\s+)?(\d{4})-(\d{2})-(\d{2})(?=\s)/, (m) => {
      const ymd = `${m[1]}-${m[2]}-${m[3]}`;
      return isValidYmd(ymd) ? setDate(ymd) : false;
    }) ||
    take(new RegExp(`\\s(?:on\\s+|by\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?(?:\\s+(\\d{4}))?(?=\\s)`, "i"), (m) => {
      const mo = MONTHS[m[2]!.toLowerCase()]!;
      const ymd = m[3] ? `${m[3]}-${pad(mo)}-${pad(Number(m[1]))}` : upcoming(today, mo, Number(m[1]));
      return ymd && isValidYmd(ymd) ? setDate(ymd) : false;
    }) ||
    take(new RegExp(`\\s(?:on\\s+|by\\s+)?(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s)`, "i"), (m) => {
      const mo = MONTHS[m[1]!.toLowerCase()]!;
      const ymd = m[3] ? `${m[3]}-${pad(mo)}-${pad(Number(m[2]))}` : upcoming(today, mo, Number(m[2]));
      return ymd && isValidYmd(ymd) ? setDate(ymd) : false;
    }) ||
    // Day-first numeric dates (common in India and the UK): 15/11, 15/11/2026, 15-11-26
    take(/\s(?:on\s+|by\s+)?(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?(?=\s)/, (m) => {
      const d = Number(m[1]), mo = Number(m[2]);
      if (mo < 1 || mo > 12) return false;
      const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : null;
      const ymd = y ? `${y}-${pad(mo)}-${pad(d)}` : upcoming(today, mo, d);
      return ymd && isValidYmd(ymd) ? setDate(ymd) : false;
    });

  // A time alone, or a repeat rule alone, starts today.
  if ((timeFound || out.repeat !== "NONE") && !dateFound && !out.dueDate) out.dueDate = today;

  // Tidy the remaining title: drop dangling connector words left behind by removed tokens.
  out.title = text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(by|on|at|due|before|for)$/i, "")
    .replace(/^(by|on|at|due)\s+/i, "")
    .trim();
  return out;
}
