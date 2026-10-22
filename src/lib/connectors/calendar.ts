import type { Db } from "../db";
import { writeNote } from "../vault";
import { googleApi, googleConnection } from "./google";

// The agent's calendar. Reading merges every source that is set up; new events go to Google when it's connected and
// to TOMORA's own calendar otherwise, so the tools work with no account at all:
//   Google Calendar    the user's Google account (google.ts), primary calendar.
//   ICS feeds          CALENDAR_ICS_URLS: comma-separated secret iCal addresses (Outlook, iCloud, Proton, Google's
//                      "secret address in iCal format"). Read-only. Repeating events show their first date only.
//   TOMORA calendar    a table in SQLite, with each event also written to the vault's Calendar folder.

export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  location?: string;
  description?: string;
  attendees?: string[];
  source: "google" | "ics" | "tomora";
  link?: string;
}

export interface NewEvent {
  title: string;
  start: string;
  end: string;
  location?: string;
  description?: string;
  attendees?: string[];
}

type Fetch = typeof fetch;

export const icsUrls = (env: Record<string, string | undefined> = process.env) =>
  (env.CALENDAR_ICS_URLS ?? env.CALENDAR_ICS_URL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s));

export function calendarSources(db: Db) {
  return { google: googleConnection(db).connected, ics: icsUrls().length, tomora: true };
}

/** Where calendar_create_event puts a new event. */
export const calendarTarget = (db: Db): "google" | "tomora" => (googleConnection(db).connected ? "google" : "tomora");

export async function listEvents(db: Db, from: Date, to: Date, query?: string, http: Fetch = fetch): Promise<{ events: CalendarEvent[]; problems: string[] }> {
  const problems: string[] = [];
  const all: CalendarEvent[] = [...localEvents(db, from, to)];
  if (googleConnection(db).connected) {
    try {
      all.push(...(await googleEvents(db, from, to, query, http)));
    } catch (err) {
      problems.push(`Google Calendar: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  for (const url of icsUrls()) {
    try {
      const res = await http(url, { headers: { Accept: "text/calendar" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`answered ${res.status}`);
      all.push(...parseIcs(await res.text()).filter((e) => overlaps(e, from, to)));
    } catch (err) {
      problems.push(`${new URL(url).hostname} calendar feed: ${err instanceof Error ? err.message : "failed"}`);
    }
  }
  const q = query?.trim().toLowerCase();
  const events = all
    .filter((e) => !q || `${e.title} ${e.location ?? ""} ${e.description ?? ""}`.toLowerCase().includes(q))
    .sort((a, b) => a.start.localeCompare(b.start));
  return { events, problems };
}

const overlaps = (e: CalendarEvent, from: Date, to: Date) => new Date(e.end || e.start) >= from && new Date(e.start) <= to;

export async function createEvent(db: Db, e: NewEvent, http: Fetch = fetch): Promise<CalendarEvent> {
  if (calendarTarget(db) === "google") {
    const body = {
      summary: e.title,
      description: e.description,
      location: e.location,
      start: { dateTime: e.start },
      end: { dateTime: e.end },
      attendees: e.attendees?.map((email) => ({ email })),
    };
    // Invitations go out only when there are attendees; the user approved the attendee list on the card.
    const sendUpdates = e.attendees?.length ? "all" : "none";
    const ev = await googleApi<GoogleEvent>(db, `${GCAL}/calendars/primary/events?sendUpdates=${sendUpdates}`, { body }, http);
    return fromGoogle(ev);
  }
  const note = writeNote({
    folder: "Calendar",
    title: `${e.start.slice(0, 10)} ${e.title}`.slice(0, 120),
    tags: ["calendar", "event"],
    evidence: "user-stated",
    body: [
      `- **When:** ${e.start} to ${e.end}`,
      e.location && `- **Where:** ${e.location}`,
      e.attendees?.length && `- **With:** ${e.attendees.join(", ")}`,
      e.description && `\n${e.description}`,
    ]
      .filter(Boolean)
      .join("\n"),
  });
  const id = db
    .prepare("INSERT INTO calendar_events (title, starts_at, ends_at, location, description, attendees, note_path) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(e.title, e.start, e.end, e.location ?? null, e.description ?? null, e.attendees?.length ? JSON.stringify(e.attendees) : null, note.path).lastInsertRowid;
  return { id: `tomora-${id}`, ...e, source: "tomora", link: note.path };
}

function localEvents(db: Db, from: Date, to: Date): CalendarEvent[] {
  const rows = db.prepare("SELECT * FROM calendar_events ORDER BY starts_at").all() as {
    id: number;
    title: string;
    starts_at: string;
    ends_at: string;
    location: string | null;
    description: string | null;
    attendees: string | null;
    note_path: string | null;
  }[];
  return rows
    .map((r) => ({
      id: `tomora-${r.id}`,
      title: r.title,
      start: r.starts_at,
      end: r.ends_at,
      location: r.location ?? undefined,
      description: r.description ?? undefined,
      attendees: r.attendees ? (JSON.parse(r.attendees) as string[]) : undefined,
      source: "tomora" as const,
      link: r.note_path ?? undefined,
    }))
    .filter((e) => overlaps(e, from, to));
}

// ---------- Google Calendar ----------

const GCAL = "https://www.googleapis.com/calendar/v3";

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string }[];
}

const fromGoogle = (e: GoogleEvent): CalendarEvent => ({
  id: e.id,
  title: e.summary || "(no title)",
  start: e.start?.dateTime ?? e.start?.date ?? "",
  end: e.end?.dateTime ?? e.end?.date ?? "",
  allDay: !e.start?.dateTime,
  location: e.location,
  description: e.description?.slice(0, 500),
  attendees: e.attendees?.map((a) => a.email),
  source: "google",
  link: e.htmlLink,
});

async function googleEvents(db: Db, from: Date, to: Date, query: string | undefined, http: Fetch) {
  const q = new URLSearchParams({ timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "50" });
  if (query?.trim()) q.set("q", query.trim());
  const res = await googleApi<{ items?: GoogleEvent[] }>(db, `${GCAL}/calendars/primary/events?${q}`, {}, http);
  return (res.items ?? []).map(fromGoogle);
}

// ---------- ICS ----------

/** Turns an iCalendar date (20261023T090000Z, 20261023T090000, 20261023) into ISO 8601. */
function icsDate(value: string): { iso: string; allDay: boolean } {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { iso: value, allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (!h) return { iso: `${y}-${mo}-${d}`, allDay: true };
  return { iso: `${y}-${mo}-${d}T${h}:${mi}:${s}${z ? "Z" : ""}`, allDay: false };
}

const icsText = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");

export function parseIcs(text: string): CalendarEvent[] {
  // Unfold continuation lines first (RFC 5545 §3.1).
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out: CalendarEvent[] = [];
  let cur: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT" && cur) {
      if (cur.DTSTART) {
        const start = icsDate(cur.DTSTART);
        const end = cur.DTEND ? icsDate(cur.DTEND) : start;
        out.push({
          id: `ics-${cur.UID ?? out.length}`,
          title: icsText(cur.SUMMARY ?? "(no title)"),
          start: start.iso,
          end: end.iso,
          allDay: start.allDay || undefined,
          location: cur.LOCATION ? icsText(cur.LOCATION) : undefined,
          description: cur.DESCRIPTION ? icsText(cur.DESCRIPTION).slice(0, 500) : undefined,
          source: "ics",
        });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i > 0) cur[line.slice(0, i).split(";")[0].toUpperCase()] = line.slice(i + 1);
    }
  }
  return out;
}
