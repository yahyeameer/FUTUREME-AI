import dns from "node:dns/promises";
import net from "node:net";

// Web access for the research agent: a search tool and a page reader.
// Both run on the server only. Search uses You.com when YDC_API_KEY is set, else Brave when BRAVE_SEARCH_API_KEY is set,
// otherwise DuckDuckGo's HTML endpoint (which blocks most cloud servers, so a hosted deployment should set a key).
// WEB_SEARCH=off turns both off.

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export type SearchProvider = "you" | "brave" | "duckduckgo" | "off";

export function searchProvider(): SearchProvider {
  if (process.env.WEB_SEARCH === "off") return "off";
  if (process.env.YDC_API_KEY?.trim()) return "you";
  return process.env.BRAVE_SEARCH_API_KEY ? "brave" : "duckduckgo";
}

const UA = "Mozilla/5.0 (compatible; TOMORA-Research/1.0)";
const TIMEOUT_MS = 10_000;

export async function webSearch(query: string, limit = 5): Promise<SearchResult[]> {
  const provider = searchProvider();
  if (provider === "off") throw new Error("Web search is turned off on this server (WEB_SEARCH=off).");
  const results = provider === "you" ? await youSearch(query) : provider === "brave" ? await braveSearch(query) : await duckDuckGoSearch(query);
  const seen = new Set<string>();
  return results.filter((r) => isHttpUrl(r.url) && !seen.has(r.url) && seen.add(r.url)).slice(0, limit);
}

/** You.com's Search API. The key goes in X-API-Key (and as a Bearer token, which the newer docs name). */
async function youSearch(query: string): Promise<SearchResult[]> {
  const key = process.env.YDC_API_KEY!.trim();
  const res = await fetch(`https://api.you.com/v1/search?count=10&query=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json", "X-API-Key": key, Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`You.com Search returned ${res.status}.`);
  return parseYouSearch(await res.json());
}

/** Reads You.com's results: web hits under results.web (or the older top-level hits), each with a title, url and snippets. Exported for tests. */
export function parseYouSearch(json: unknown): SearchResult[] {
  type Hit = { url?: unknown; title?: unknown; description?: unknown; snippets?: unknown };
  const j = json as { results?: { web?: Hit[] }; hits?: Hit[] } | null;
  const hits = j?.results?.web ?? j?.hits ?? [];
  if (!Array.isArray(hits)) return [];
  return hits.flatMap((h) => {
    if (typeof h?.url !== "string") return [];
    const snippets = Array.isArray(h.snippets) ? h.snippets.filter((s): s is string => typeof s === "string") : [];
    const snippet = typeof h.description === "string" && h.description ? h.description : (snippets[0] ?? "");
    return [{ title: stripTags(typeof h.title === "string" ? h.title : h.url), url: h.url, snippet: stripTags(snippet) }];
  });
}

async function braveSearch(query: string): Promise<SearchResult[]> {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?count=10&q=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": process.env.BRAVE_SEARCH_API_KEY! },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Brave Search returned ${res.status}.`);
  const json = (await res.json()) as { web?: { results?: { title: string; url: string; description?: string }[] } };
  return (json.web?.results ?? []).map((r) => ({ title: stripTags(r.title), url: r.url, snippet: stripTags(r.description ?? "") }));
}

async function duckDuckGoSearch(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
    body: new URLSearchParams({ q: query }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}.`);
  return parseDuckDuckGo(await res.text());
}

/** Parses DuckDuckGo's HTML results page. Exported for tests. */
export function parseDuckDuckGo(html: string): SearchResult[] {
  const out: SearchResult[] = [];
  const blocks = html.split(/(?=<div[^>]+class="[^"]*\bresult\b[^"]*")/).filter((b) => b.startsWith("<div"));
  for (const block of blocks) {
    if (/result--ad\b/.test(block.slice(0, block.indexOf(">")))) continue;
    const a = block.match(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const snippet = block.match(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/);
    const url = unwrapDuckDuckGo(decodeEntities(a[1]));
    if (!url) continue;
    out.push({ title: stripTags(a[2]), url, snippet: snippet ? stripTags(snippet[1]) : "" });
  }
  return out;
}

function unwrapDuckDuckGo(href: string): string | null {
  try {
    const u = new URL(href, "https://duckduckgo.com");
    if (u.hostname.endsWith("duckduckgo.com") && u.pathname === "/l/") return u.searchParams.get("uddg");
    if (u.hostname.endsWith("duckduckgo.com")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export interface Page {
  url: string;
  title: string;
  text: string;
}

const MAX_BYTES = 400_000;
const MAX_TEXT = 6_000;

/** Reads a public web page as plain text. Refuses private, loopback and link-local addresses. */
export async function fetchPage(rawUrl: string): Promise<Page> {
  if (searchProvider() === "off") throw new Error("Web access is turned off on this server (WEB_SEARCH=off).");
  let url = new URL(rawUrl);
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url);
    const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": UA, Accept: "text/html,text/plain" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`${url.hostname} returned ${res.status}.`);
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/(html|plain)|application\/xhtml/.test(type)) throw new Error(`${url.hostname} returned ${type || "an unknown type"}, not a web page.`);
    const html = await readCapped(res, MAX_BYTES);
    const title = stripTags(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url.hostname);
    return { url: url.toString(), title, text: htmlToText(html).slice(0, MAX_TEXT) };
  }
  throw new Error("Too many redirects.");
}

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return "";
  const decoder = new TextDecoder();
  let out = "";
  let bytes = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    bytes += chunk.byteLength;
    out += decoder.decode(chunk, { stream: true });
    if (bytes >= max) break;
  }
  return out;
}

function isHttpUrl(s: string) {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only http and https pages can be read.");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((a) => a.address);
  if (!addrs.length || addrs.some(isPrivateAddress)) throw new Error(`${url.hostname} is not a public address.`);
}

/** True for loopback, private, link-local, CGNAT and other non-public ranges. Exported for tests. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return v6 === "::" || v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb");
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function stripTags(s: string) {
  return decodeEntities(s.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
