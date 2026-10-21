import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getSetting, setSetting, type Db } from "../db";
import { isoDate, monthOf, PLATFORM_NAMES, type Platform, type SocialImport } from "./parse";
import { decryptSecret, encryptSecret } from "./secrets";

// Fetching someone's public profile and recent posts with Apify actors, through Apify's hosted MCP server
// (https://mcp.apify.com), with its REST API as the fallback. Only used after the person has proved the account is
// theirs (claims.ts): this file never decides on its own whose data to fetch, and the agent has no tool that reaches it.
// The token stays on the server: APIFY_TOKEN, or a key pasted on the Connected accounts page, stored encrypted like the
// sign-in tokens (secrets.ts). Every run is capped in items, time and dollars.

export interface RunLimits {
  maxItems: number;
  /** Seconds the actor may run. */
  timeout: number;
  maxTotalChargeUsd: number;
}

export interface ApifyRunner {
  transport: "mcp" | "rest";
  run(actor: string, input: Record<string, unknown>, limits: RunLimits): Promise<unknown[]>;
}

/** The actor ran but didn't produce a result (failed, timed out, input refused). Not worth retrying over REST. */
export class ActorError extends Error {}

const MCP_URL = "https://mcp.apify.com";
const REST_URL = "https://api.apify.com/v2";
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const KEY_SETTING = "apify_token";
const ACCOUNT_SETTING = "apify_account";

function apifyToken(db: Db): { token: string; source: "env" | "saved" } | null {
  const env = process.env.APIFY_TOKEN?.trim();
  if (env) return { token: env, source: "env" };
  const sealed = getSetting(db, KEY_SETTING);
  const token = sealed ? decryptSecret(sealed) : null;
  return token ? { token, source: "saved" } : null;
}

/** Whether profiles can be fetched, and where the key came from (never the key itself). */
export function apifyStatus(db: Db) {
  const t = apifyToken(db);
  return { configured: !!t, source: t?.source ?? null, account: t?.source === "saved" ? getSetting(db, ACCOUNT_SETTING) : null };
}

/** Checks a pasted Apify key with Apify, then stores it encrypted. Returns the Apify username it belongs to. */
export async function saveApifyKey(db: Db, token: string, http: typeof fetch = fetch): Promise<string> {
  const key = token.trim();
  if (!/^[A-Za-z0-9_]{20,120}$/.test(key)) throw new Error("That doesn't look like an Apify API token. Copy it from Apify Console → Settings → API & Integrations.");
  const res = await http(`${REST_URL}/users/me`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
  if (res.status === 401 || res.status === 403) throw new Error("Apify didn't accept that token. Copy it again from Apify Console → Settings → API & Integrations.");
  if (!res.ok) throw new Error(`Couldn't reach Apify to check the token (${res.status}).`);
  const me = ((await res.json()) as { data?: { username?: string } }).data;
  const account = me?.username ?? "your Apify account";
  setSetting(db, KEY_SETTING, encryptSecret(key));
  setSetting(db, ACCOUNT_SETTING, account);
  return account;
}

export function removeApifyKey(db: Db) {
  setSetting(db, KEY_SETTING, null);
  setSetting(db, ACCOUNT_SETTING, null);
}

/** The runner this server uses: MCP first, REST when MCP can't be reached or APIFY_TRANSPORT=rest. */
export function apifyRunner(db: Db): ApifyRunner | null {
  const token = apifyToken(db)?.token;
  if (!token) return null;
  const rest = restRunner(token);
  if (process.env.APIFY_TRANSPORT === "rest") return rest;
  const mcp = mcpRunner(token);
  return {
    transport: "mcp",
    async run(actor, input, limits) {
      try {
        return await mcp.run(actor, input, limits);
      } catch (err) {
        if (err instanceof ActorError) throw err;
        return rest.run(actor, input, limits);
      }
    },
  };
}

type ToolResult = { structuredContent?: unknown; content?: unknown; isError?: boolean };

/** What an Apify MCP tool returned, as an object: structuredContent, or the JSON in its first text block. */
export function toolJson(res: ToolResult): Record<string, unknown> {
  const text = Array.isArray(res.content) ? (res.content as { type?: string; text?: string }[]).find((c) => c.type === "text")?.text : undefined;
  if (res.isError) throw new ActorError(text?.slice(0, 300) || "Apify refused the run.");
  if (res.structuredContent && typeof res.structuredContent === "object") return res.structuredContent as Record<string, unknown>;
  try {
    return JSON.parse(text ?? "") as Record<string, unknown>;
  } catch {
    throw new Error("Apify's MCP server sent something unexpected.");
  }
}

export interface McpCaller {
  callTool(params: { name: string; arguments: Record<string, unknown> }): Promise<ToolResult>;
  close(): Promise<void>;
}

/** Runs an actor over MCP: call-actor (waits up to 45 s), get-actor-run until it finishes, then get-dataset-items. */
export function mcpRunner(token: string, connect: (actor: string) => Promise<McpCaller> = (actor) => connectMcp(token, actor), pollMs = 4000): ApifyRunner {
  return {
    transport: "mcp",
    async run(actor, input, limits) {
      const client = await connect(actor);
      try {
        let run = toolJson(
          await client.callTool({
            name: "call-actor",
            arguments: { actor, input, waitSecs: 45, callOptions: { timeout: limits.timeout, maxItems: limits.maxItems, maxTotalChargeUsd: limits.maxTotalChargeUsd } },
          }),
        );
        const deadline = Date.now() + (limits.timeout + 30) * 1000;
        while (!TERMINAL.has(String(run.status)) && Date.now() < deadline) {
          await sleep(pollMs);
          run = toolJson(await client.callTool({ name: "get-actor-run", arguments: { runId: run.runId } }));
        }
        if (run.status !== "SUCCEEDED") throw new ActorError(`The ${actor} run ${String(run.status ?? "didn't finish").toLowerCase()}.`);
        const datasetId = (run.storages as { datasets?: { default?: { id?: string } } } | undefined)?.datasets?.default?.id ?? (run.defaultDatasetId as string | undefined);
        if (!datasetId) throw new ActorError("The run finished without a dataset.");
        const page = toolJson(await client.callTool({ name: "get-dataset-items", arguments: { datasetId, limit: limits.maxItems, clean: true } }));
        return Array.isArray(page.items) ? page.items : [];
      } finally {
        await client.close().catch(() => undefined);
      }
    },
  };
}

async function connectMcp(token: string, actor: string): Promise<McpCaller> {
  // Only the tools this run needs are loaded, and only this actor can be called through call-actor.
  const url = new URL(MCP_URL);
  url.searchParams.set("tools", ["call-actor", "get-actor-run", "get-dataset-items", actor].join(","));
  url.searchParams.set("telemetry-enabled", "false");
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  const client = new Client({ name: "futureme", version: "0.5.0" });
  await client.connect(transport);
  return { callTool: (p) => client.callTool(p) as Promise<ToolResult>, close: () => client.close() };
}

/** Runs an actor with one synchronous REST call, which returns its dataset items. */
export function restRunner(token: string, http: typeof fetch = fetch): ApifyRunner {
  return {
    transport: "rest",
    async run(actor, input, limits) {
      const qs = new URLSearchParams({ timeout: String(limits.timeout), maxItems: String(limits.maxItems), maxTotalChargeUsd: String(limits.maxTotalChargeUsd), clean: "true" });
      const res = await http(`${REST_URL}/acts/${actor.replace("/", "~")}/run-sync-get-dataset-items?${qs}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout((limits.timeout + 30) * 1000),
      });
      if (res.status === 401 || res.status === 403) throw new ActorError("Apify didn't accept the APIFY_TOKEN on this server.");
      if (!res.ok) throw new ActorError(`The ${actor} run failed (${res.status}).`);
      const items = await res.json();
      return Array.isArray(items) ? items : [];
    },
  };
}

// ---------- Which account: handles and profile links ----------

const HOSTS: Record<Platform, string[]> = {
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  x: ["x.com", "twitter.com"],
  linkedin: ["linkedin.com"],
  facebook: ["facebook.com", "fb.com"],
  youtube: ["youtube.com"],
};
const HANDLE: Record<Platform, RegExp> = {
  instagram: /^[A-Za-z0-9._]{1,30}$/,
  tiktok: /^[A-Za-z0-9._]{2,24}$/,
  x: /^[A-Za-z0-9_]{1,15}$/,
  linkedin: /^[A-Za-z0-9\-_%]{3,100}$/,
  facebook: /^[A-Za-z0-9.\-]{5,80}$/,
  youtube: /^[A-Za-z0-9._\-]{3,30}$/,
};

export interface Target {
  platform: Platform;
  handle: string;
  url: string;
}

/** "@name", "name" or a profile link → the account to fetch. Throws on anything else, including other sites. */
export function parseTarget(platform: Platform, input: string): Target {
  let v = input.trim();
  if (/^(https?:\/\/)?([\w-]+\.)*[\w-]+\.[a-z]{2,}\//i.test(v)) {
    const u = new URL(v.startsWith("http") ? v : `https://${v}`);
    const host = u.hostname.replace(/^(www|m|mobile)\./, "");
    if (!HOSTS[platform].some((h) => host === h || host.endsWith(`.${h}`))) throw new Error(`That isn't a ${PLATFORM_NAMES[platform]} link.`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (platform === "linkedin") {
      if (parts[0] !== "in" || !parts[1]) throw new Error("Use your LinkedIn profile link, the one with /in/ in it.");
      v = decodeURIComponent(parts[1]);
    } else if (platform === "facebook" && (parts[0] === "profile.php" || parts[0] === "people")) {
      throw new Error("Only public Facebook Pages can be fetched. For your personal profile, import your Facebook data export.");
    } else v = parts[0] ?? "";
  }
  v = v.replace(/^@/, "");
  if (!HANDLE[platform].test(v)) throw new Error(`That doesn't look like a ${PLATFORM_NAMES[platform]} username.`);
  const urls: Record<Platform, string> = {
    instagram: `https://www.instagram.com/${v}/`,
    tiktok: `https://www.tiktok.com/@${v}`,
    x: `https://x.com/${v}`,
    linkedin: `https://www.linkedin.com/in/${v}/`,
    facebook: `https://www.facebook.com/${v}`,
    youtube: `https://www.youtube.com/@${v}`,
  };
  return { platform, handle: v, url: urls[platform] };
}

// ---------- What is fetched, and how it becomes an import ----------

type Item = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : undefined);
const o = (v: unknown): Item => (v && typeof v === "object" && !Array.isArray(v) ? (v as Item) : {});
const a = (v: unknown): Item[] => (Array.isArray(v) ? v.map(o) : []);
const same = (x: unknown, handle: string) => s(x)?.replace(/^@/, "").toLowerCase() === handle.toLowerCase();
const dateOf = (v: unknown) => (typeof v === "number" ? new Date(v > 1e12 ? v : v * 1000).toISOString().slice(0, 10) : isoDate(s(v)));

/** What one fetch found: the import, and the public texts the verification code is looked for in. */
export interface Fetched {
  import: SocialImport;
  proof: string[];
}

/** Thrown when the account can't be fetched for a reason the person can fix (private, wrong name, nothing public). */
export class FetchRefused extends Error {}

interface Actor {
  id: string;
  input: (t: Target) => Record<string, unknown>;
  limits: RunLimits;
}

export interface PlatformFetch {
  /** Where the person puts the code: shown in the verify step. */
  where: string;
  /** What's fetched, shown before they agree. */
  reads: string;
  profile: Actor & { map: (items: Item[], t: Target) => Fetched };
  /** Fetched only once the account is verified (LinkedIn's posts are a second actor). */
  more?: Actor & { add: (items: Item[], imp: SocialImport, t: Target) => void };
}

const LIMITS = (maxItems: number): RunLimits => ({ maxItems, timeout: 120, maxTotalChargeUsd: 0.25 });

const empty = (platform: Platform): SocialImport => ({
  platform,
  account: { websites: [] },
  positions: [],
  education: [],
  skills: [],
  certifications: [],
  languages: [],
  posts: [],
  skipped: 0,
});

function refuseNone(items: Item[], t: Target): asserts items is [Item, ...Item[]] {
  if (!items.length) throw new FetchRefused(`No public ${PLATFORM_NAMES[t.platform]} account called ${t.handle} was found, or it has nothing public yet.`);
}

export const FETCHERS: Record<Platform, PlatformFetch> = {
  instagram: {
    where: "your Instagram bio, or the caption of a new post",
    reads: "Your public bio, name, link and the captions of your latest posts.",
    profile: {
      id: "apify/instagram-profile-scraper",
      input: (t) => ({ usernames: [t.handle] }),
      limits: LIMITS(1),
      map(items, t) {
        const p = items.find((i) => same(i.username, t.handle));
        refuseNone(p ? [p] : [], t);
        if (p!.private === true) throw new FetchRefused("This Instagram account is private, so nothing can be fetched. Import is only for public accounts.");
        const imp = empty("instagram");
        imp.account = { name: s(p!.fullName), handle: `@${s(p!.username)}`, bio: s(p!.biography), websites: [s(p!.externalUrl)].filter((w): w is string => !!w) };
        imp.posts = a(p!.latestPosts).flatMap((x) =>
          s(x.caption) ? [{ date: dateOf(x.timestamp), text: s(x.caption)!, url: s(x.url), likes: n(x.likesCount), reposts: undefined, reply: false }] : [],
        );
        return { import: imp, proof: [imp.account.bio ?? "", ...imp.posts.map((x) => x.text)] };
      },
    },
  },
  tiktok: {
    where: "your TikTok bio, or the caption of a new video",
    reads: "Your public bio, name, link and the captions of your latest videos.",
    profile: {
      id: "clockworks/tiktok-profile-scraper",
      input: (t) => ({ profiles: [t.handle], resultsPerPage: 60, profileSorting: "latest" }),
      limits: LIMITS(60),
      map(items, t) {
        const own = items.filter((i) => same(o(i.authorMeta).name, t.handle));
        refuseNone(own, t);
        const author = o(own[0].authorMeta);
        if (author.privateAccount === true) throw new FetchRefused("This TikTok account is private, so nothing can be fetched.");
        const imp = empty("tiktok");
        imp.account = { name: s(author.nickName), handle: `@${s(author.name)}`, bio: s(author.signature), websites: [s(o(author.bioLink).link) ?? s(author.bioLink)].filter((w): w is string => !!w) };
        imp.posts = own.flatMap((x) => (s(x.text) ? [{ date: dateOf(x.createTimeISO ?? x.createTime), text: s(x.text)!, url: s(x.webVideoUrl), likes: n(x.diggCount), reposts: n(x.shareCount), reply: false }] : []));
        return { import: imp, proof: [imp.account.bio ?? "", ...imp.posts.map((x) => x.text)] };
      },
    },
  },
  x: {
    where: "your X bio, or a new post",
    reads: "Your public bio, name, location and your latest 100 posts. Reposts of other people are skipped.",
    profile: {
      id: "apidojo/tweet-scraper",
      input: (t) => ({ twitterHandles: [t.handle], maxItems: 100, sort: "Latest" }),
      limits: LIMITS(100),
      map(items, t) {
        // The search can return other people's posts (quotes, mentions); only the account's own are kept.
        const own = items.filter((i) => !i.noResults && same(o(i.author).userName, t.handle) && i.isRetweet !== true);
        refuseNone(own, t);
        const author = o(own[0].author);
        const imp = empty("x");
        imp.account = { name: s(author.name), handle: `@${s(author.userName)}`, bio: s(author.description), location: s(author.location), websites: [] };
        imp.posts = own.flatMap((x) => {
          const text = s(x.fullText) ?? s(x.text);
          return text ? [{ date: dateOf(x.createdAt), text, url: s(x.url), likes: n(x.likeCount), reposts: n(x.retweetCount), reply: x.isReply === true }] : [];
        });
        return { import: imp, proof: [imp.account.bio ?? "", ...imp.posts.map((x) => x.text)] };
      },
    },
  },
  linkedin: {
    where: "your LinkedIn headline or About section",
    reads: "Your public headline, About, experience, education, skills and languages, then your latest 50 posts once the account is verified.",
    profile: {
      id: "harvestapi/linkedin-profile-scraper",
      input: (t) => ({ queries: [t.url], profileScraperMode: "Profile details no email ($4 per 1k)" }),
      limits: LIMITS(1),
      map(items, t) {
        refuseNone(items, t);
        const p = items[0];
        if (s(p.publicIdentifier) && !same(p.publicIdentifier, t.handle)) throw new FetchRefused("LinkedIn returned a different profile than the one you named.");
        const imp = empty("linkedin");
        const text = (v: unknown) => s(o(v).text) ?? s(v);
        const current = (v: unknown) => /present|now/i.test(text(v) ?? "");
        imp.account = {
          name: [s(p.firstName), s(p.lastName)].filter(Boolean).join(" ") || undefined,
          handle: t.handle,
          headline: s(p.headline),
          bio: s(p.about),
          location: s(o(p.location).linkedinText) ?? s(p.location),
          websites: [],
        };
        imp.positions = a(p.experience).flatMap((x) =>
          s(x.companyName) || s(x.position)
            ? [{ title: s(x.position) ?? "", company: s(x.companyName) ?? "", start: monthOf(text(x.startDate)), end: current(x.endDate) ? undefined : monthOf(text(x.endDate)), location: s(x.location), description: s(x.description)?.slice(0, 2000) }]
            : [],
        );
        imp.education = a(p.education).flatMap((x) =>
          s(x.schoolName)
            ? [{ school: s(x.schoolName)!, degree: [s(x.degree), s(x.fieldOfStudy)].filter(Boolean).join(", ") || undefined, start: monthOf(text(x.startDate)), end: monthOf(text(x.endDate)) }]
            : [],
        );
        imp.skills = a(p.skills).flatMap((x) => (s(x.name) ? [s(x.name)!] : []));
        imp.certifications = a(p.certifications).flatMap((x) => (s(x.title) ?? s(x.name) ? [(s(x.title) ?? s(x.name))!] : []));
        imp.languages = a(p.languages).flatMap((x) => (s(x.name) ? [[s(x.name), s(x.proficiency)].filter(Boolean).join(" (") + (s(x.proficiency) ? ")" : "")] : []));
        return { import: imp, proof: [imp.account.headline ?? "", imp.account.bio ?? ""] };
      },
    },
    more: {
      id: "harvestapi/linkedin-profile-posts",
      input: (t) => ({ targetUrls: [t.url], maxPosts: 50, includeReposts: false }),
      limits: LIMITS(50),
      add(items, imp) {
        imp.posts = items.flatMap((x) => {
          const text = s(x.content);
          const at = o(x.postedAt);
          return text ? [{ date: dateOf(at.date ?? at.timestamp), text, url: s(x.linkedinUrl), likes: n(o(x.engagement).likes), reposts: n(o(x.engagement).shares), reply: false }] : [];
        });
      },
    },
  },
  facebook: {
    where: "a new public post on your Facebook Page",
    reads: "The latest 50 public posts on your Facebook Page. Personal profiles can't be fetched; import your Facebook data export for those.",
    profile: {
      id: "apify/facebook-posts-scraper",
      input: (t) => ({ startUrls: [{ url: t.url }], resultsLimit: 50 }),
      limits: LIMITS(50),
      map(items, t) {
        refuseNone(items, t);
        const imp = empty("facebook");
        imp.account = { name: s(items[0].pageName) ?? s(o(items[0].user).name), handle: t.handle, websites: [] };
        imp.posts = items.flatMap((x) => (s(x.text) ? [{ date: dateOf(x.time ?? x.timestamp), text: s(x.text)!, url: s(x.url), likes: n(x.likes), reposts: n(x.shares), reply: false }] : []));
        return { import: imp, proof: imp.posts.map((x) => x.text) };
      },
    },
  },
  youtube: {
    where: "your YouTube channel description",
    reads: "Your channel name, description and location, and the titles of your latest 50 videos.",
    profile: {
      id: "streamers/youtube-channel-scraper",
      input: (t) => ({ startUrls: [{ url: t.url }], maxResults: 50 }),
      limits: LIMITS(50),
      map(items, t) {
        refuseNone(items, t);
        const first = items[0];
        if (s(first.channelUsername) && !same(first.channelUsername, t.handle)) throw new FetchRefused("YouTube returned a different channel than the one you named.");
        const imp = empty("youtube");
        imp.account = {
          name: s(first.channelName),
          handle: `@${t.handle}`,
          bio: s(first.channelDescription) ?? s(o(first.aboutChannelInfo).channelDescription),
          location: s(first.channelLocation),
          websites: [],
        };
        imp.posts = items.flatMap((x) => {
          const text = [s(x.title), s(x.text)].filter(Boolean).join("\n\n");
          return text ? [{ date: dateOf(x.date), text: text.slice(0, 3000), url: s(x.url), likes: n(x.likes), reposts: undefined, reply: false }] : [];
        });
        return { import: imp, proof: [imp.account.bio ?? ""] };
      },
    },
  },
};
