import { accessCode } from "./access";
import type { Db } from "./db";

// Phase 4, public-launch guards for the voice twin. Kept free of other twin modules so any of them can call it.
//   Calling rules  which countries the twin may call, and the hours a contact may be called in their own time zone.
//   Usage          what the twin spent this month (call minutes, emails), and a monthly cost cap.
//   Review queue   signs of abuse or misuse the user should look at: someone the twin tried to reach who isn't a
//                  contact, a blocked number calling again, mail that tries to instruct the twin, a hit limit.

// ---------- Calling rules ----------

interface Country {
  iso: string;
  name: string;
  /** Time zones the country spans. A call must fall inside calling hours in every one of them. */
  zones: string[];
}

/** Countries by calling code. Numbers from anywhere else can't be called. NANP (+1) uses the four main US zones. */
const COUNTRIES: Record<string, Country> = {
  "1": { iso: "US", name: "the US or Canada", zones: ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles"] },
  "20": { iso: "EG", name: "Egypt", zones: ["Africa/Cairo"] },
  "27": { iso: "ZA", name: "South Africa", zones: ["Africa/Johannesburg"] },
  "31": { iso: "NL", name: "the Netherlands", zones: ["Europe/Amsterdam"] },
  "32": { iso: "BE", name: "Belgium", zones: ["Europe/Brussels"] },
  "33": { iso: "FR", name: "France", zones: ["Europe/Paris"] },
  "34": { iso: "ES", name: "Spain", zones: ["Europe/Madrid"] },
  "39": { iso: "IT", name: "Italy", zones: ["Europe/Rome"] },
  "41": { iso: "CH", name: "Switzerland", zones: ["Europe/Zurich"] },
  "43": { iso: "AT", name: "Austria", zones: ["Europe/Vienna"] },
  "44": { iso: "GB", name: "the UK", zones: ["Europe/London"] },
  "45": { iso: "DK", name: "Denmark", zones: ["Europe/Copenhagen"] },
  "46": { iso: "SE", name: "Sweden", zones: ["Europe/Stockholm"] },
  "47": { iso: "NO", name: "Norway", zones: ["Europe/Oslo"] },
  "48": { iso: "PL", name: "Poland", zones: ["Europe/Warsaw"] },
  "49": { iso: "DE", name: "Germany", zones: ["Europe/Berlin"] },
  "52": { iso: "MX", name: "Mexico", zones: ["America/Mexico_City", "America/Tijuana"] },
  "55": { iso: "BR", name: "Brazil", zones: ["America/Sao_Paulo", "America/Manaus"] },
  "61": { iso: "AU", name: "Australia", zones: ["Australia/Sydney", "Australia/Perth"] },
  "64": { iso: "NZ", name: "New Zealand", zones: ["Pacific/Auckland"] },
  "65": { iso: "SG", name: "Singapore", zones: ["Asia/Singapore"] },
  "81": { iso: "JP", name: "Japan", zones: ["Asia/Tokyo"] },
  "82": { iso: "KR", name: "South Korea", zones: ["Asia/Seoul"] },
  "90": { iso: "TR", name: "Turkey", zones: ["Europe/Istanbul"] },
  "91": { iso: "IN", name: "India", zones: ["Asia/Kolkata"] },
  "234": { iso: "NG", name: "Nigeria", zones: ["Africa/Lagos"] },
  "251": { iso: "ET", name: "Ethiopia", zones: ["Africa/Addis_Ababa"] },
  "252": { iso: "SO", name: "Somalia", zones: ["Africa/Mogadishu"] },
  "253": { iso: "DJ", name: "Djibouti", zones: ["Africa/Djibouti"] },
  "254": { iso: "KE", name: "Kenya", zones: ["Africa/Nairobi"] },
  "255": { iso: "TZ", name: "Tanzania", zones: ["Africa/Dar_es_Salaam"] },
  "256": { iso: "UG", name: "Uganda", zones: ["Africa/Kampala"] },
  "351": { iso: "PT", name: "Portugal", zones: ["Europe/Lisbon"] },
  "353": { iso: "IE", name: "Ireland", zones: ["Europe/Dublin"] },
  "966": { iso: "SA", name: "Saudi Arabia", zones: ["Asia/Riyadh"] },
  "971": { iso: "AE", name: "the UAE", zones: ["Asia/Dubai"] },
  "974": { iso: "QA", name: "Qatar", zones: ["Asia/Qatar"] },
};

/** Premium-rate and other numbers the twin never dials, wherever they are. */
const BLOCKED_PREFIXES = ["+1900", "+1976", "+449", "+4487", "+4470", "+3389", "+49900", "+61190"];

export function countryOf(number: string): Country | null {
  const digits = number.replace(/^\+/, "");
  for (const len of [3, 2, 1]) {
    const c = COUNTRIES[digits.slice(0, len)];
    if (c) return c;
  }
  return null;
}

/** ISO codes from TWIN_CALL_COUNTRIES, or every country above. */
function allowedCountries(): Set<string> {
  const list = process.env.TWIN_CALL_COUNTRIES?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  return new Set(list?.length ? list : Object.values(COUNTRIES).map((c) => c.iso));
}

/** Calling hours in the contact's own time, from TWIN_CALL_HOURS ("8-21"). 8 am to 9 pm follows the US TCPA. */
export function callingHours(): { from: number; to: number } {
  const m = process.env.TWIN_CALL_HOURS?.match(/^\s*(\d{1,2})\s*-\s*(\d{1,2})\s*$/);
  const from = m ? Number(m[1]) : 8;
  const to = m ? Number(m[2]) : 21;
  return from >= 0 && to <= 24 && from < to ? { from, to } : { from: 8, to: 21 };
}

const hourIn = (zone: string, now: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") + get("minute") / 60;
};

const clock = (h: number) => (h === 0 || h === 24 ? "midnight" : h === 12 ? "noon" : h < 12 ? `${h} am` : `${h - 12} pm`);

/** Whether the twin may ever call this number: a known, allowed country and not a premium-rate line. */
export function checkCallable(number: string): { ok: true; country: Country } | { ok: false; reason: string } {
  if (BLOCKED_PREFIXES.some((p) => number.startsWith(p))) return { ok: false, reason: "The twin never calls premium-rate numbers." };
  const country = countryOf(number);
  if (!country) return { ok: false, reason: "The twin can't call numbers in that country yet." };
  if (!allowedCountries().has(country.iso)) return { ok: false, reason: `Calls to ${country.name} are turned off on this server (TWIN_CALL_COUNTRIES).` };
  return { ok: true, country };
}

/** Whether a contact may be called right now: callable, and inside calling hours everywhere in their country. */
export function checkCallTime(number: string, now = new Date()): { ok: true } | { ok: false; reason: string } {
  const callable = checkCallable(number);
  if (!callable.ok) return callable;
  const { from, to } = callingHours();
  const outside = callable.country.zones.find((z) => {
    const h = hourIn(z, now);
    return h < from || h >= to;
  });
  if (!outside) return { ok: true };
  const local = new Intl.DateTimeFormat("en-US", { timeZone: outside, hour: "numeric", minute: "2-digit" }).format(now).toLowerCase();
  const where = callable.country.zones.length > 1 ? `in parts of ${callable.country.name}` : `in ${callable.country.name}`;
  return {
    ok: false,
    reason: `It's ${local} ${where}. Calls to contacts go out between ${clock(from)} and ${clock(to)} their time, so try again then.`,
  };
}

// ---------- Usage and the cost cap ----------

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Estimated prices (ElevenLabs agent minutes plus Twilio, and AgentMail) and the monthly cap, all in US dollars. */
export function costConfig() {
  return {
    perMinute: num(process.env.TWIN_COST_PER_MINUTE, 0.1),
    perEmail: num(process.env.TWIN_COST_PER_EMAIL, 0.001),
    monthlyBudget: num(process.env.TWIN_MONTHLY_BUDGET, 20),
  };
}

/** Days a third-party call's transcript and recording, and mail the twin received, are kept (TWIN_RETENTION_DAYS). */
export const retentionDays = () => Math.max(1, Math.round(num(process.env.TWIN_RETENTION_DAYS, 30)));

/** ElevenLabs ends every twin call at this length, so a call can never cost more than this. */
export const MAX_CALL_SECONDS = 600;

/** The call length actually used: TWIN_MAX_CALL_SECONDS (a demo server keeps calls short), between 60 and 600 seconds. */
export const maxCallSeconds = () => Math.min(MAX_CALL_SECONDS, Math.max(60, Math.round(num(process.env.TWIN_MAX_CALL_SECONDS, MAX_CALL_SECONDS))));

const monthStart = (now: Date) => `${now.toISOString().slice(0, 7)}-01 00:00:00`;
const nextMonthStart = (now: Date) => monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));

/** What the twin used this calendar month (UTC). Live calls count the minutes they have run so far, up to the cap. */
export function usage(db: Db, now = new Date()) {
  const since = monthStart(now);
  const until = nextMonthStart(now);
  const calls = db
    .prepare("SELECT duration_secs, started_at, ended_at, status FROM calls WHERE started_at >= ? AND started_at < ?")
    .all(since, until) as { duration_secs: number | null; started_at: string; ended_at: string | null; status: string }[];
  let minutes = 0;
  for (const c of calls) {
    const running = ["dialing", "connecting", "in_progress"].includes(c.status);
    const secs = c.duration_secs ?? (running ? Math.min(maxCallSeconds(), (now.getTime() - new Date(`${c.started_at.replace(" ", "T")}Z`).getTime()) / 1000) : 0);
    if (secs > 0) minutes += Math.ceil(secs / 60);
  }
  const emails = (
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM email_threads WHERE (direction = 'outbound' AND sent_at >= ? AND sent_at < ?) OR (direction = 'inbound' AND created_at >= ? AND created_at < ?)",
      )
      .get(since, until, since, until) as { n: number }
  ).n;
  const cfg = costConfig();
  const spent = Math.round((minutes * cfg.perMinute + emails * cfg.perEmail) * 100) / 100;
  return { month: since.slice(0, 7), minutes, emails, spent, budget: cfg.monthlyBudget, over: cfg.monthlyBudget > 0 && spent >= cfg.monthlyBudget };
}

/** Throws once this month's spending reaches the cap, and puts that in the review queue once a month. */
export function checkBudget(db: Db, now = new Date()) {
  const u = usage(db, now);
  if (!u.over) return;
  raiseFlag(db, "budget", `This month's twin spending reached its $${u.budget} cap.`, u.month);
  throw new Error(`Your twin reached this month's cost cap of $${u.budget}. It can't call or email until next month, or until the cap (TWIN_MONTHLY_BUDGET) is raised.`);
}

// ---------- Review queue ----------

export type FlagKind = "unknown_contact" | "limit" | "budget" | "blocked_caller" | "repeat_caller" | "injection" | "bad_secret";

export const FLAG_LABEL: Record<FlagKind, string> = {
  unknown_contact: "Tried to reach someone who isn't a contact",
  limit: "Hit a daily limit",
  budget: "Reached the monthly cost cap",
  blocked_caller: "A blocked number called again",
  repeat_caller: "An unknown number keeps calling",
  injection: "An email tried to give your twin orders",
  bad_secret: "Requests with a wrong secret or signature",
};

export interface Flag {
  id: number;
  kind: FlagKind;
  subject: string;
  detail: string;
  count: number;
  status: "open" | "dismissed";
  created_at: string;
  updated_at: string;
}

/**
 * Adds an item to the review queue. The same kind and subject on the same day bumps the open item's count instead, so
 * a flood of bad requests stays one line.
 */
export function raiseFlag(db: Db, kind: FlagKind, detail: string, subject = "") {
  const open = db
    .prepare("SELECT id FROM twin_flags WHERE kind = ? AND subject = ? AND status = 'open' AND date(updated_at) = date('now')")
    .get(kind, subject) as { id: number } | undefined;
  if (open) db.prepare("UPDATE twin_flags SET count = count + 1, detail = ?, updated_at = datetime('now') WHERE id = ?").run(detail.slice(0, 500), open.id);
  else db.prepare("INSERT INTO twin_flags (kind, subject, detail) VALUES (?, ?, ?)").run(kind, subject.slice(0, 200), detail.slice(0, 500));
}

export function dismissFlag(db: Db, id: number) {
  if (!db.prepare("UPDATE twin_flags SET status = 'dismissed', updated_at = datetime('now') WHERE id = ? AND status = 'open'").run(id).changes) throw new Error("That item was already dismissed.");
}

/** Phrases that read as instructions to an AI rather than mail to a person. */
const INJECTION = [
  /\bignore (all |any )?(the |your )?(previous|prior|above) (instructions|prompts?|messages?)\b/i,
  /\b(disregard|forget) (all |your )?(previous |prior )?(instructions|rules)\b/i,
  /\byou are (now )?(an?|the) (ai|assistant|twin)\b.{0,40}\b(must|should|will)\b/i,
  /\b(system prompt|developer message|jailbreak)\b/i,
  /\b(send|forward|share) (me )?(the |your |all )?(passwords?|codes?|api keys?|vault|notes|memories)\b/i,
];

export const looksLikeInjection = (text: string) => INJECTION.some((r) => r.test(text));

export function guardSnapshot(db: Db) {
  const flags = db.prepare("SELECT * FROM twin_flags WHERE status = 'open' ORDER BY updated_at DESC, id DESC LIMIT 30").all() as Flag[];
  const { from, to } = callingHours();
  return {
    usage: usage(db),
    retentionDays: retentionDays(),
    /** The twin is reachable from the internet but the app has no access code, so anyone could open it. */
    exposed: !!process.env.TWIN_PUBLIC_URL?.trim() && !accessCode(),
    callingHours: `${clock(from)} to ${clock(to)}`,
    countries: [...allowedCountries()].sort(),
    flags: flags.map((f) => ({ id: f.id, kind: f.kind, label: FLAG_LABEL[f.kind] ?? f.kind, subject: f.subject, detail: f.detail, count: f.count, at: f.updated_at })),
  };
}
