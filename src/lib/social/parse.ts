import { z } from "zod";

// Turns the data exports people can download from LinkedIn, X and Facebook into one shape FutureMe can learn from.
// Runs in the browser (so the archive never leaves the person's device, only what is read here does) and on the server.
//
// What is read: your profile, your career and education, your skills, and posts you wrote yourself.
// What is never read: messages, connections and contacts, other people's posts and comments, photos, ads and location
// history. Those files are listed as skipped and stay in the archive.

export const PLATFORMS = ["linkedin", "x", "facebook", "instagram", "tiktok", "youtube"] as const;
export type Platform = (typeof PLATFORMS)[number];
/** Platforms with a data export FutureMe can read. The others are fetched from their public profile (see apify.ts). */
export const EXPORT_PLATFORMS = ["linkedin", "x", "facebook"] as const satisfies readonly Platform[];

export const PLATFORM_NAMES: Record<Platform, string> = {
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const MAX_POSTS = 3000;
const MAX_TEXT = 3000;
const str = (max: number) => z.string().trim().max(max);

export const SocialImportSchema = z.object({
  platform: z.enum(PLATFORMS),
  account: z.object({
    name: str(120).optional(),
    handle: str(80).optional(),
    headline: str(300).optional(),
    bio: str(2600).optional(),
    location: str(120).optional(),
    industry: str(120).optional(),
    websites: z.array(str(300)).max(10).default([]),
    joined: str(40).optional(),
  }),
  positions: z
    .array(z.object({ title: str(200), company: str(200), start: str(20).optional(), end: str(20).optional(), location: str(120).optional(), description: str(2000).optional() }))
    .max(60)
    .default([]),
  education: z.array(z.object({ school: str(200), degree: str(200).optional(), start: str(20).optional(), end: str(20).optional() })).max(30).default([]),
  skills: z.array(str(100)).max(200).default([]),
  certifications: z.array(str(200)).max(100).default([]),
  languages: z.array(str(80)).max(30).default([]),
  posts: z
    .array(
      z.object({
        date: str(30).nullable(),
        text: str(MAX_TEXT),
        url: str(500).optional(),
        likes: z.number().int().min(0).optional(),
        reposts: z.number().int().min(0).optional(),
        reply: z.boolean().optional(),
      }),
    )
    .max(MAX_POSTS)
    .default([]),
  /** How many files in the archive were left unread (messages, contacts, media…). */
  skipped: z.number().int().min(0).default(0),
});
export type SocialImport = z.infer<typeof SocialImportSchema>;
export type SocialPost = SocialImport["posts"][number];

export interface ExportFile {
  name: string;
  text: string;
}

// ---------- Which files we read ----------

type Kind =
  | "li-profile"
  | "li-positions"
  | "li-education"
  | "li-skills"
  | "li-shares"
  | "li-certifications"
  | "li-languages"
  | "x-account"
  | "x-profile"
  | "x-tweets"
  | "fb-profile"
  | "fb-posts";

const base = (name: string) => name.split(/[\\/]/).pop()!.toLowerCase();

/** The platform and kind of an export file we read, or null for everything we leave alone. */
export function wantedFile(name: string): { platform: Platform; kind: Kind } | null {
  const b = base(name);
  const lower = name.toLowerCase().replace(/\\/g, "/");
  // Never read anything from a messages or inbox folder, whatever its name.
  if (/(^|\/)(messages|inbox|direct[-_ ]?messages?|e2ee_cutover)(\/|$)/.test(lower)) return null;
  const li: Record<string, Kind> = {
    "profile.csv": "li-profile",
    "positions.csv": "li-positions",
    "education.csv": "li-education",
    "skills.csv": "li-skills",
    "shares.csv": "li-shares",
    "certifications.csv": "li-certifications",
    "languages.csv": "li-languages",
  };
  if (li[b]) return { platform: "linkedin", kind: li[b] };
  if (b === "account.js") return { platform: "x", kind: "x-account" };
  if (b === "profile.js") return { platform: "x", kind: "x-profile" };
  if (/^tweets?(-part\d+)?\.js$/.test(b)) return { platform: "x", kind: "x-tweets" };
  if (b === "profile_information.json") return { platform: "facebook", kind: "fb-profile" };
  if (/^your_posts.*\.json$/.test(b)) return { platform: "facebook", kind: "fb-posts" };
  return null;
}

// ---------- Parsing ----------

/** Parses a set of export files (from one or more archives) into one import per platform found. */
export function parseExport(files: ExportFile[], skipped = 0): SocialImport[] {
  const byPlatform = new Map<Platform, SocialImport>();
  const get = (p: Platform) => {
    if (!byPlatform.has(p)) {
      byPlatform.set(p, { platform: p, account: { websites: [] }, positions: [], education: [], skills: [], certifications: [], languages: [], posts: [], skipped: 0 });
    }
    return byPlatform.get(p)!;
  };
  // Account files first, so X post links can use the username.
  const sorted = [...files].sort((a, b) => Number(/account|profile/i.test(base(b.name))) - Number(/account|profile/i.test(base(a.name))));
  for (const f of sorted) {
    const w = wantedFile(f.name);
    if (!w) {
      skipped++;
      continue;
    }
    const out = get(w.platform);
    try {
      PARSERS[w.kind](f.text.replace(/^﻿/, ""), out);
    } catch {
      throw new Error(`Couldn't read ${base(f.name)}. Is it from an unmodified ${PLATFORM_NAMES[w.platform]} export?`);
    }
  }
  const results = [...byPlatform.values()];
  for (const r of results) {
    r.skipped = skipped;
    r.posts = r.posts
      .filter((p) => p.text.trim().length > 0)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, MAX_POSTS)
      .map((p) => ({ ...p, text: p.text.slice(0, MAX_TEXT) }));
  }
  return results.filter((r) => r.posts.length || r.positions.length || r.account.name || r.account.handle || r.skills.length);
}

const PARSERS: Record<Kind, (text: string, out: SocialImport) => void> = {
  "li-profile": (text, out) => {
    const row = csvObjects(text)[0];
    if (!row) return;
    // Address, birth date, zip code and messenger handles are in this file too; we don't keep them.
    const name = [row["First Name"], row["Last Name"]].filter(Boolean).join(" ");
    out.account = {
      ...out.account,
      name: name || undefined,
      headline: row["Headline"] || undefined,
      bio: row["Summary"] || undefined,
      industry: row["Industry"] || undefined,
      location: row["Geo Location"] || undefined,
      websites: listCell(row["Websites"]),
    };
  },
  "li-positions": (text, out) => {
    out.positions = csvObjects(text)
      .filter((r) => r["Title"] || r["Company Name"])
      .map((r) => ({
        title: r["Title"] ?? "",
        company: r["Company Name"] ?? "",
        start: monthOf(r["Started On"]),
        end: monthOf(r["Finished On"]),
        location: r["Location"] || undefined,
        description: r["Description"] || undefined,
      }));
  },
  "li-education": (text, out) => {
    out.education = csvObjects(text)
      .filter((r) => r["School Name"])
      .map((r) => ({ school: r["School Name"], degree: r["Degree Name"] || undefined, start: monthOf(r["Start Date"]), end: monthOf(r["End Date"]) }));
  },
  "li-skills": (text, out) => {
    out.skills = csvObjects(text).map((r) => r["Name"]).filter(Boolean);
  },
  "li-certifications": (text, out) => {
    out.certifications = csvObjects(text).map((r) => [r["Name"], r["Authority"]].filter(Boolean).join(", ")).filter(Boolean);
  },
  "li-languages": (text, out) => {
    out.languages = csvObjects(text).map((r) => [r["Name"], r["Proficiency"] && `(${r["Proficiency"]})`].filter(Boolean).join(" ")).filter(Boolean);
  },
  "li-shares": (text, out) => {
    for (const r of csvObjects(text)) {
      const body = (r["ShareCommentary"] ?? "").replace(/""/g, '"').trim();
      if (!body) continue; // A bare reshare with nothing the person wrote.
      out.posts.push({ date: isoDate(r["Date"]), text: body, url: r["ShareLink"] || undefined });
    }
  },
  "x-account": (text, out) => {
    const a = (ytd(text)[0] as { account?: Record<string, string> } | undefined)?.account;
    if (!a) return;
    // The account file also holds the email address and phone; we keep only the public name and handle.
    out.account = { ...out.account, name: out.account.name ?? a.accountDisplayName, handle: a.username ? `@${a.username}` : undefined, joined: isoDate(a.createdAt) ?? undefined };
  },
  "x-profile": (text, out) => {
    const d = (ytd(text)[0] as { profile?: { description?: { bio?: string; website?: string; location?: string } } } | undefined)?.profile?.description;
    if (!d) return;
    out.account = { ...out.account, bio: d.bio || undefined, location: d.location || undefined, websites: d.website ? [d.website] : out.account.websites };
  },
  "x-tweets": (text, out) => {
    const user = out.account.handle?.slice(1);
    for (const item of ytd(text) as { tweet?: XTweet }[]) {
      const t = item.tweet ?? (item as XTweet);
      let body = t.full_text ?? t.text ?? "";
      if (!body || body.startsWith("RT @")) continue; // Someone else's words.
      for (const u of t.entities?.urls ?? []) if (u.url && u.expanded_url) body = body.replaceAll(u.url, u.expanded_url);
      const id = t.id_str ?? t.id;
      out.posts.push({
        date: isoDate(t.created_at),
        text: decodeEntities(body),
        url: id ? (user ? `https://x.com/${user}/status/${id}` : `https://x.com/i/web/status/${id}`) : undefined,
        likes: num(t.favorite_count),
        reposts: num(t.retweet_count),
        reply: !!t.in_reply_to_status_id_str || undefined,
      });
    }
  },
  "fb-profile": (text, out) => {
    const json = fixFacebook(JSON.parse(text)) as Record<string, FbProfile>;
    const p = json.profile_v2 ?? json.profile;
    if (!p) return;
    out.account = {
      ...out.account,
      name: p.name?.full_name || out.account.name,
      location: p.current_city?.name || out.account.location,
      bio: p.intro_bio?.name || out.account.bio,
    };
    out.positions = (p.work_experiences ?? [])
      .filter((w) => w.employer)
      .map((w) => ({ title: w.title ?? "", company: w.employer!, location: w.location || undefined, description: w.description || undefined, start: monthOfTs(w.start_timestamp), end: monthOfTs(w.end_timestamp) }));
    out.education = (p.education_experiences ?? [])
      .filter((e) => e.name)
      .map((e) => ({ school: e.name!, degree: e.degree || e.concentrations?.join(", ") || undefined, start: monthOfTs(e.start_timestamp), end: monthOfTs(e.end_timestamp) }));
  },
  "fb-posts": (text, out) => {
    const json = fixFacebook(JSON.parse(text));
    const items = (Array.isArray(json) ? json : Object.values(json as object).find(Array.isArray) ?? []) as FbPost[];
    for (const it of items) {
      const body = (it.data ?? []).map((d) => d.post).filter(Boolean).join("\n").trim();
      if (!body) continue; // Photo uploads and check-ins with no words of their own.
      out.posts.push({ date: it.timestamp ? new Date(it.timestamp * 1000).toISOString().slice(0, 10) : null, text: body });
    }
  },
};

interface XTweet {
  full_text?: string;
  text?: string;
  created_at?: string;
  id_str?: string;
  id?: string;
  favorite_count?: string | number;
  retweet_count?: string | number;
  in_reply_to_status_id_str?: string;
  entities?: { urls?: { url?: string; expanded_url?: string }[] };
}
interface FbProfile {
  name?: { full_name?: string };
  current_city?: { name?: string };
  intro_bio?: { name?: string };
  work_experiences?: { employer?: string; title?: string; location?: string; description?: string; start_timestamp?: number; end_timestamp?: number }[];
  education_experiences?: { name?: string; degree?: string; concentrations?: string[]; start_timestamp?: number; end_timestamp?: number }[];
}
interface FbPost {
  timestamp?: number;
  data?: { post?: string }[];
}

// ---------- Helpers ----------

/** X archive files are JavaScript: `window.YTD.tweets.part0 = [ ... ]`. */
function ytd(text: string): unknown[] {
  const json = JSON.parse(text.slice(text.indexOf("=") + 1).trim().replace(/;$/, ""));
  return Array.isArray(json) ? json : [];
}

/** RFC 4180 CSV, including quoted fields with commas and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim()));
}

function csvObjects(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const listCell = (cell: string | undefined) =>
  (cell ?? "")
    .replace(/^\[|\]$/g, "")
    .split(/[,;]\s*/)
    .map((s) => s.replace(/^[A-Z_]+:/, "").trim())
    .filter((s) => /\w\.\w/.test(s));

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Jan 2020" → "2020-01", "2020" → "2020". */
export function monthOf(v: string | undefined): string | undefined {
  if (!v?.trim()) return undefined;
  const m = v.trim().match(/^([A-Za-z]{3})[a-z]*\.? (\d{4})$/);
  if (m) {
    const i = MONTHS.indexOf(m[1].toLowerCase());
    if (i >= 0) return `${m[2]}-${String(i + 1).padStart(2, "0")}`;
  }
  return v.trim().slice(0, 20);
}

const monthOfTs = (ts: number | undefined) => (ts ? new Date(ts * 1000).toISOString().slice(0, 7) : undefined);

export function isoDate(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(v.includes(" UTC") ? v.replace(" UTC", "Z").replace(" ", "T") : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

const num = (v: string | number | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Facebook writes UTF-8 bytes as \u00XX escapes, so "café" arrives as "cafÃ©". Undo that everywhere in the tree. */
export function fixFacebook(v: unknown): unknown {
  if (typeof v === "string") {
    if (!/[\u0080-ÿ]/.test(v) || /[^\u0000-ÿ]/.test(v)) return v;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(v, (c) => c.charCodeAt(0)));
    } catch {
      return v;
    }
  }
  if (Array.isArray(v)) return v.map(fixFacebook);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fixFacebook(x)]));
  return v;
}
