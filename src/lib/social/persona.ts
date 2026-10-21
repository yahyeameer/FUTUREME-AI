import { PLATFORM_NAMES, type Platform, type SocialImport } from "./parse";

// A persona built from the person's own accounts: who they are on paper, what they post about, and how they write.
// Everything here is counted or copied from their data, never guessed, so the future self can sound like them and get
// their history right. An optional model-written voice summary is added by the caller (see social/index.ts).

export interface Persona {
  name?: string;
  handles: { platform: Platform; handle: string }[];
  headline?: string;
  location?: string;
  bio?: string;
  now?: string;
  career: string[];
  education: string[];
  skills: string[];
  certifications: string[];
  languages: string[];
  topics: { term: string; count: number }[];
  voice: { posts: number; avgWords: number; traits: string[] };
  examples: { platform: Platform; date: string | null; text: string }[];
  sources: Platform[];
  /** Two or three sentences on how they write, by the model. Absent when no model was available. */
  summary?: string;
  updatedAt: string;
}

const STOP = new Set(
  (
    "about above after again against also among an and another any are around because been before being below between both but by can cannot " +
    "could did does doing down during each even every few for from further get gets getting going gonna got had has have having her here hers " +
    "him his how however into its it's itself just know like made make makes many may more most much must myself need never next not now off " +
    "often once only other our ours ourselves out over own really same say says she should since some still such than that thats that's the " +
    "their theirs them themselves then there these they thing things think this those though through today too under until upon very want " +
    "was way we'll we're were what when where which while who whom why will with within without would year years yet you you're your yours " +
    "yourself i'm i've don't can't didn't won't it's let's here's what's https http www com amp via one two first last new good great " +
    "time day days week back well right lot people work working three four five six seven eight nine"
  ).split(" "),
);

const EMOJI = /\p{Extended_Pictographic}/u;
const ym = (s?: string) => s ?? "";

export function buildPersona(imports: SocialImport[], now = new Date()): Persona {
  const all = imports.flatMap((i) => i.posts.map((p) => ({ ...p, platform: i.platform })));
  const own = all.filter((p) => !p.reply);
  const pick = <K extends keyof SocialImport["account"]>(k: K) => imports.map((i) => i.account[k]).find((v) => v && (typeof v !== "object" || (v as unknown[]).length));

  // The longest career history wins (LinkedIn usually), current roles first.
  // Current roles keep the export's order (the main one is listed first); past roles go newest first.
  const positions = [...(imports.map((i) => i.positions).sort((a, b) => b.length - a.length)[0] ?? [])].sort(
    (a, b) => Number(!!a.end) - Number(!!b.end) || (a.end && b.end ? ym(b.start).localeCompare(ym(a.start)) : 0),
  );
  const current = positions.filter((p) => !p.end);
  const career = positions.slice(0, 8).map((p) => `${[p.title, p.company].filter(Boolean).join(" at ")} (${p.start ?? "?"} – ${p.end ?? "now"})`);
  const education = imports
    .flatMap((i) => i.education)
    .slice(0, 5)
    .map((e) => [e.degree, e.school].filter(Boolean).join(", ") + (e.end ? ` (${e.end.slice(0, 4)})` : ""));

  return {
    name: pick("name") as string | undefined,
    handles: imports.flatMap((i) => (i.account.handle ? [{ platform: i.platform, handle: i.account.handle }] : [])),
    headline: pick("headline") as string | undefined,
    location: pick("location") as string | undefined,
    bio: (pick("bio") as string | undefined)?.slice(0, 600),
    now: current.length ? current.map((p) => [p.title, p.company].filter(Boolean).join(" at ")).join("; ") : undefined,
    career,
    education: [...new Set(education)],
    skills: [...new Set(imports.flatMap((i) => i.skills))].slice(0, 25),
    certifications: [...new Set(imports.flatMap((i) => i.certifications))].slice(0, 10),
    languages: [...new Set(imports.flatMap((i) => i.languages))].slice(0, 8),
    topics: topics(own.map((p) => p.text)),
    voice: voice(own.map((p) => p.text)),
    examples: examples(own),
    sources: imports.map((i) => i.platform),
    updatedAt: now.toISOString(),
  };
}

function topics(texts: string[]): Persona["topics"] {
  const counts = new Map<string, number>();
  for (const t of texts) {
    const seen = new Set<string>();
    for (const tag of t.match(/#[\p{L}\p{N}_]{2,}/gu) ?? []) seen.add(tag.toLowerCase());
    const words = t
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[@#][\p{L}\p{N}_]+/gu, " ")
      .toLowerCase()
      .split(/[^\p{L}\p{N}'-]+/u);
    for (const w of words) if (w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)) seen.add(w.replace(/^'+|'+$/g, ""));
    for (const term of seen) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  const min = texts.length >= 20 ? 3 : 2;
  return [...counts]
    .filter(([, n]) => n >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([term, count]) => ({ term, count }));
}

function voice(texts: string[]): Persona["voice"] {
  const n = texts.length;
  if (!n) return { posts: 0, avgWords: 0, traits: [] };
  const share = (test: (t: string) => boolean) => texts.filter(test).length / n;
  const words = texts.map((t) => t.split(/\s+/).filter(Boolean).length);
  const avgWords = Math.round(words.reduce((a, b) => a + b, 0) / n);
  const traits: string[] = [];
  traits.push(avgWords < 25 ? "short, punchy posts" : avgWords < 90 ? "medium-length posts" : "long-form posts");
  const emoji = share((t) => EMOJI.test(t));
  if (emoji > 0.3) traits.push("uses emoji often");
  else if (emoji < 0.05) traits.push("almost never uses emoji");
  if (share((t) => t.includes("?")) > 0.25) traits.push("often asks their audience questions");
  if (share((t) => t.includes("!")) > 0.3) traits.push("enthusiastic, with exclamation marks");
  if (share((t) => /#[\p{L}\p{N}_]{2,}/u.test(t)) > 0.4) traits.push("tags posts with hashtags");
  if (share((t) => /https?:\/\//.test(t)) > 0.4) traits.push("shares links to what they read");
  const first = share((t) => /\b(I|I'm|I've|my|me)\b/.test(t));
  const team = share((t) => /\b(we|our|us|we're)\b/i.test(t));
  if (team > first && team > 0.3) traits.push("talks about 'we' and the team more than 'I'");
  else if (first > 0.5) traits.push("writes personally, in the first person");
  if (share((t) => t.split("\n").filter((l) => /^\s*([-•*]|\d+[.)])\s/.test(l)).length >= 2) > 0.2) traits.push("likes lists and numbered points");
  return { posts: n, avgWords, traits };
}

function examples(posts: (SocialImport["posts"][number] & { platform: Platform })[]): Persona["examples"] {
  const fit = posts.filter((p) => p.text.length >= 40 && p.text.length <= 420 && !/^https?:\/\/\S+$/.test(p.text));
  const score = (p: (typeof fit)[number]) => (p.likes ?? 0) + 2 * (p.reposts ?? 0);
  const ranked = [...fit].sort((a, b) => score(b) - score(a) || (b.date ?? "").localeCompare(a.date ?? ""));
  // Spread across platforms: take the best from each in turn.
  const byPlatform = new Map<Platform, typeof ranked>();
  for (const p of ranked) byPlatform.set(p.platform, [...(byPlatform.get(p.platform) ?? []), p]);
  const out: Persona["examples"] = [];
  while (out.length < 5 && [...byPlatform.values()].some((l) => l.length)) {
    for (const list of byPlatform.values()) {
      const p = list.shift();
      if (p && out.length < 5) out.push({ platform: p.platform, date: p.date, text: p.text });
    }
  }
  return out;
}

/** Roles that have ended; current ones are in `now`. */
export const past = (p: Persona) => p.career.filter((c) => !c.endsWith("– now)"));

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** The block added to the future self's instructions. Kept short: it rides along with every turn. */
export function personaPrompt(p: Persona): string {
  const from = p.sources.map((s) => PLATFORM_NAMES[s]).join(", ");
  const lines = [
    `What their own accounts say about them (they imported this from ${from}). Use it to get their life right and to sound like them; never invent past events beyond it:`,
    p.headline && `- Headline: ${clip(p.headline, 160)}`,
    p.now && `- Now: ${clip(p.now, 200)}`,
    past(p).length > 0 && `- Before: ${clip(past(p).slice(0, 4).join("; "), 320)}`,
    p.education.length && `- Studied: ${clip(p.education.join("; "), 200)}`,
    p.location && `- Based in: ${p.location}`,
    p.skills.length && `- Skills: ${clip(p.skills.slice(0, 12).join(", "), 220)}`,
    p.topics.length && `- Posts most about: ${p.topics.slice(0, 8).map((t) => t.term).join(", ")}`,
    p.voice.posts && `- How they write: ${p.summary ? clip(p.summary, 480) : p.voice.traits.join("; ")}`,
    p.examples.length && `- In their words: ${p.examples.slice(0, 3).map((e) => `"${clip(e.text.replace(/\s+/g, " "), 160)}"`).join(" ")}`,
    "Speak as their future self in that same voice. When they ask about their work history, skills or what they've posted, call search_social and quote it.",
  ];
  return lines.filter(Boolean).join("\n");
}

/** The persona as a vault note, so it can be read and edited in Obsidian like everything else. */
export function personaMarkdown(p: Persona): string {
  const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
  return [
    `Built on ${p.updatedAt.slice(0, 10)} from your ${p.sources.map((s) => PLATFORM_NAMES[s]).join(", ")} data. Counted and copied from what you wrote; nothing here is guessed.`,
    p.headline && `**Headline:** ${p.headline}`,
    p.now && `**Now:** ${p.now}`,
    p.location && `**Based in:** ${p.location}`,
    p.handles.length && `**Accounts:** ${p.handles.map((h) => `${PLATFORM_NAMES[h.platform]} ${h.handle}`).join(", ")}`,
    p.bio && `## About\n\n${p.bio}`,
    p.career.length && `## Career\n\n${list(p.career)}`,
    p.education.length && `## Education\n\n${list(p.education)}`,
    p.skills.length && `## Skills\n\n${p.skills.join(", ")}`,
    p.certifications.length && `## Certifications\n\n${list(p.certifications)}`,
    p.languages.length && `## Languages\n\n${p.languages.join(", ")}`,
    p.topics.length && `## What you post about\n\n${p.topics.map((t) => `${t.term} (${t.count})`).join(", ")}`,
    p.voice.posts && `## How you write\n\n${p.summary ? `${p.summary}\n\n` : ""}${list([`${p.voice.posts} posts, ${p.voice.avgWords} words on average`, ...p.voice.traits])}`,
    p.examples.length && `## In your words\n\n${p.examples.map((e) => `> ${e.text.replace(/\n+/g, " ")}\n> — ${PLATFORM_NAMES[e.platform]}${e.date ? `, ${e.date}` : ""}`).join("\n\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
