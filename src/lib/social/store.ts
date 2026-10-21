import { getSetting, setSetting, type Db } from "../db";
import { getProvider, type LlmProvider } from "../llm";
import { deleteNote, slugify, writeNote } from "../vault";
import { PLATFORM_NAMES, PLATFORMS, SocialImportSchema, type Platform, type SocialImport, type SocialPost } from "./parse";
import { buildPersona, personaMarkdown, personaPrompt, type Persona } from "./persona";

// Imported accounts: one source per platform, written into the vault's Social folder so search_memory and Obsidian see
// them, plus a persona the future self is given on every turn. Nothing is imported without the person's consent, and
// deleting a source removes its notes, its tokens and its part of the persona.

export type ImportMethod = "export" | "oauth" | "apify" | "sample";

const PERSONA_KEY = "social_persona";
const PERSONA_TITLE = "Persona from your accounts";
const POSTS_PER_NOTE = 150;

interface SourceRow {
  platform: Platform;
  method: ImportMethod;
  account: string | null;
  consent_at: string;
  imported_at: string;
  notes: string;
  data: string;
}

export function sourceRows(db: Db): (Omit<SourceRow, "notes" | "data"> & { notes: string[]; data: SocialImport })[] {
  return (db.prepare("SELECT * FROM social_sources ORDER BY platform").all() as SourceRow[]).map((r) => ({
    ...r,
    notes: JSON.parse(r.notes),
    data: SocialImportSchema.parse(JSON.parse(r.data)),
  }));
}

const accountLabel = (i: SocialImport) => i.account.handle ?? i.account.name ?? null;

/** The vault notes one platform's posts are written to, by year, in parts of POSTS_PER_NOTE. */
function postNotes(imp: SocialImport): { title: string; posts: SocialPost[] }[] {
  const byYear = new Map<string, SocialPost[]>();
  for (const p of imp.posts) {
    const year = p.date?.slice(0, 4) ?? "undated";
    byYear.set(year, [...(byYear.get(year) ?? []), p]);
  }
  return [...byYear].flatMap(([year, posts]) => {
    const parts = Math.ceil(posts.length / POSTS_PER_NOTE);
    return Array.from({ length: parts }, (_, i) => ({
      title: `${PLATFORM_NAMES[imp.platform]} posts ${year}${parts > 1 ? ` part ${i + 1}` : ""}`,
      posts: posts.slice(i * POSTS_PER_NOTE, (i + 1) * POSTS_PER_NOTE),
    }));
  });
}

const notePath = (title: string) => `Social/${slugify(title)}.md`;

function writeSourceNotes(imp: SocialImport): string[] {
  const name = PLATFORM_NAMES[imp.platform];
  const a = imp.account;
  const tags = ["social", imp.platform];
  const written: string[] = [];
  const profileBody = [
    `Imported from your ${name} data on ${new Date().toISOString().slice(0, 10)}.`,
    a.name && `**Name:** ${a.name}`,
    a.handle && `**Handle:** ${a.handle}`,
    a.headline && `**Headline:** ${a.headline}`,
    a.industry && `**Industry:** ${a.industry}`,
    a.location && `**Location:** ${a.location}`,
    a.websites.length && `**Websites:** ${a.websites.join(", ")}`,
    a.bio && `## About\n\n${a.bio}`,
    imp.positions.length &&
      `## Experience\n\n${imp.positions.map((p) => `- **${p.title || "Role"}**, ${p.company} (${p.start ?? "?"} – ${p.end ?? "now"})${p.location ? `, ${p.location}` : ""}${p.description ? `\n  ${p.description.replace(/\s*\n\s*/g, " ")}` : ""}`).join("\n")}`,
    imp.education.length && `## Education\n\n${imp.education.map((e) => `- ${[e.degree, e.school].filter(Boolean).join(", ")}${e.end ? ` (${e.start ?? "?"} – ${e.end})` : ""}`).join("\n")}`,
    imp.skills.length && `## Skills\n\n${imp.skills.join(", ")}`,
    imp.certifications.length && `## Certifications\n\n${imp.certifications.map((c) => `- ${c}`).join("\n")}`,
    imp.languages.length && `## Languages\n\n${imp.languages.join(", ")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  written.push(writeNote({ folder: "Social", title: `${name} profile`, body: profileBody, tags, links: [PERSONA_TITLE], source: imp.platform }).path);

  for (const n of postNotes(imp)) {
    const body = n.posts
      .map((p) => `### ${p.date ?? "Undated"}${p.reply ? " (reply)" : ""}\n\n${p.text}${p.url ? `\n\n${p.url}` : ""}`)
      .join("\n\n");
    written.push(writeNote({ folder: "Social", title: n.title, body, tags: [...tags, "posts"], links: [`${name} profile`], source: imp.platform }).path);
  }
  return written;
}

function removeNotes(paths: string[]) {
  for (const p of paths) deleteNote(p);
}

/** Saves one platform's data, replacing what was imported from it before. Consent is required, every time. */
export async function importSocial(
  db: Db,
  raw: unknown,
  opts: { method: ImportMethod; consent: boolean; consentAt?: string; provider?: LlmProvider },
): Promise<{ platform: Platform; posts: number; notes: string[] }> {
  if (!opts.consent) throw new Error("Agree to the import first, so FutureMe knows you chose to share this.");
  const imp = SocialImportSchema.parse(raw);
  const old = db.prepare("SELECT notes FROM social_sources WHERE platform = ?").get(imp.platform) as { notes: string } | undefined;
  if (old) removeNotes(JSON.parse(old.notes));
  const notes = writeSourceNotes(imp);
  db.prepare(
    `INSERT INTO social_sources (platform, method, account, consent_at, notes, data) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(platform) DO UPDATE SET method = excluded.method, account = excluded.account, consent_at = excluded.consent_at,
       imported_at = datetime('now'), notes = excluded.notes, data = excluded.data`,
  ).run(imp.platform, opts.method, accountLabel(imp), opts.consentAt ?? new Date().toISOString(), JSON.stringify(notes), JSON.stringify(imp));
  await rebuildPersona(db, opts.provider);
  return { platform: imp.platform, posts: imp.posts.length, notes };
}

/** Deletes one platform's imported data, its token and its ownership check. Revoking the token at the platform is the caller's job. */
export async function deleteSource(db: Db, platform: Platform, provider?: LlmProvider) {
  const row = db.prepare("SELECT notes FROM social_sources WHERE platform = ?").get(platform) as { notes: string } | undefined;
  if (row) removeNotes(JSON.parse(row.notes));
  db.prepare("DELETE FROM social_sources WHERE platform = ?").run(platform);
  db.prepare("DELETE FROM social_tokens WHERE platform = ?").run(platform);
  db.prepare("DELETE FROM social_claims WHERE platform = ?").run(platform);
  await rebuildPersona(db, provider);
}

// ---------- Persona ----------

export function getPersona(db: Db): Persona | null {
  const raw = getSetting(db, PERSONA_KEY);
  return raw ? (JSON.parse(raw) as Persona) : null;
}

/** The persona block for the future self's instructions, or null when nothing is imported. */
export function socialPromptBlock(db: Db): string | null {
  const p = getPersona(db);
  return p ? personaPrompt(p) : null;
}

export const VOICE_MARKER = "[persona-voice]";

export async function rebuildPersona(db: Db, provider: LlmProvider = getProvider()): Promise<Persona | null> {
  const imports = sourceRows(db).map((r) => r.data);
  if (!imports.length) {
    setSetting(db, PERSONA_KEY, null);
    deleteNote(notePath(PERSONA_TITLE));
    return null;
  }
  const persona = buildPersona(imports);
  const previous = getPersona(db);
  persona.summary = await voiceSummary(persona, provider).catch(() => undefined);
  // Keep the last good summary when the model is unavailable and the examples haven't changed.
  if (!persona.summary && previous?.summary && JSON.stringify(previous.examples) === JSON.stringify(persona.examples)) persona.summary = previous.summary;
  setSetting(db, PERSONA_KEY, JSON.stringify(persona));
  writeNote({
    folder: "Social",
    title: PERSONA_TITLE,
    body: personaMarkdown(persona),
    tags: ["social", "persona"],
    links: ["Profile", ...persona.sources.map((s) => `${PLATFORM_NAMES[s]} profile`)],
    evidence: persona.summary ? "ai-inferred" : "user-stated",
  });
  return persona;
}

/** Two or three sentences on how they write, from their own posts. Skipped on the stand-in model. */
async function voiceSummary(p: Persona, provider: LlmProvider): Promise<string | undefined> {
  if (provider.name === "mock" || p.examples.length < 2) return undefined;
  const res = await provider.complete([
    {
      role: "system",
      content:
        "You describe how one person writes, so a model can speak in their voice. In two or three plain sentences, describe their tone, " +
        "sentence length, vocabulary and what they keep coming back to. Base it only on the posts given. Don't quote them. No preamble.",
    },
    { role: "user", content: `${VOICE_MARKER}\nTraits counted from ${p.voice.posts} posts: ${p.voice.traits.join("; ")}\n\nPosts:\n${p.examples.map((e) => `- ${e.text}`).join("\n")}` },
  ]);
  const text = (res.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return text && text.length < 700 ? text : undefined;
}

// ---------- Search (the search_social tool) ----------

export interface SocialHit {
  platform: Platform;
  kind: "post" | "role" | "profile";
  date: string | null;
  text: string;
  url?: string;
  note: string;
}

export function searchSocial(db: Db, query: string, opts: { platform?: Platform; limit?: number } = {}): SocialHit[] {
  const terms = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}#@]+/u).filter((t) => t.length > 2 && !["what", "have", "about", "posted", "post", "posts", "the", "and", "did"].includes(t)))];
  const scored: { hit: SocialHit; score: number }[] = [];
  const score = (text: string) => {
    const t = text.toLowerCase();
    return terms.reduce((n, term) => n + Math.min(t.split(term).length - 1, 3), 0);
  };
  for (const { data: imp } of sourceRows(db)) {
    if (opts.platform && imp.platform !== opts.platform) continue;
    const profileNote = notePath(`${PLATFORM_NAMES[imp.platform]} profile`);
    for (const p of imp.positions) {
      const text = `${p.title} at ${p.company} (${p.start ?? "?"} – ${p.end ?? "now"})${p.description ? `: ${p.description}` : ""}`;
      scored.push({ hit: { platform: imp.platform, kind: "role", date: p.start ?? null, text, note: profileNote }, score: score(text) + (terms.some((t) => /work|job|career|role|experience/.test(t)) ? 2 : 0) });
    }
    const about = [imp.account.headline, imp.account.bio, imp.skills.length && `Skills: ${imp.skills.join(", ")}`].filter(Boolean).join("\n");
    if (about) scored.push({ hit: { platform: imp.platform, kind: "profile", date: null, text: about, note: profileNote }, score: score(about) });
    for (const n of postNotes(imp))
      for (const p of n.posts) scored.push({ hit: { platform: imp.platform, kind: "post", date: p.date, text: p.text, url: p.url, note: notePath(n.title) }, score: score(p.text) });
  }
  const limit = opts.limit ?? 6;
  const matched = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || (b.hit.date ?? "").localeCompare(a.hit.date ?? ""));
  // Nothing matched: show their most recent posts, so "what have I been posting about?" still gets an answer.
  const pool = matched.length ? matched : scored.filter((s) => s.hit.kind === "post").sort((a, b) => (b.hit.date ?? "").localeCompare(a.hit.date ?? ""));
  return pool.slice(0, limit).map((s) => s.hit);
}

export function formatHits(hits: SocialHit[]): string {
  return hits
    .map((h) => `[${PLATFORM_NAMES[h.platform]} ${h.kind}${h.date ? ` · ${h.date}` : ""}] ${h.text.slice(0, 600)}${h.url ? `\n${h.url}` : ""}`)
    .join("\n\n");
}

// ---------- What the Connections page shows ----------

export function socialSummary(db: Db) {
  return sourceRows(db).map((r) => {
    const dates = r.data.posts.map((p) => p.date).filter((d): d is string => !!d).sort();
    return {
      platform: r.platform,
      method: r.method,
      account: r.account,
      consentAt: r.consent_at,
      importedAt: r.imported_at,
      counts: {
        posts: r.data.posts.length,
        roles: r.data.positions.length,
        education: r.data.education.length,
        skills: r.data.skills.length,
        skippedFiles: r.data.skipped,
      },
      range: dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null,
      notes: r.notes,
      recent: r.data.posts.slice(0, 3).map((p) => ({ date: p.date, text: p.text.slice(0, 280), url: p.url })),
    };
  });
}

export const isPlatform = (v: string): v is Platform => (PLATFORMS as readonly string[]).includes(v);
