import crypto from "node:crypto";
import type { Db } from "../db";
import type { LlmProvider } from "../llm";
import { PLATFORM_NAMES, type Platform, type SocialImport } from "./parse";
import { decryptSecret, encryptSecret } from "./secrets";
import { deleteSource, importSocial } from "./store";

// Signing in with an account, where the platform lets a personal app read the person's own data. What each one allows
// (as of 2026) is narrower than its data export, so the export import is the main path and OAuth is the quick one:
//   X         OAuth 2.0 with PKCE: profile and recent posts (up to 100). The free API tier allows very few reads a month.
//   LinkedIn  "Sign In with LinkedIn using OpenID Connect": name and photo only. Posts and career need LinkedIn's
//             partner programs, so use the data export for those.
//   Facebook  Facebook Login with user_posts: your posts. Without App Review this works only for people with a role on
//             the app (admins, developers, testers), which is fine for your own FutureMe.
// Tokens are stored encrypted (secrets.ts) and revoked at the platform when you disconnect.

export interface Token {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

type Fetch = typeof fetch;

interface Provider {
  scopes: string[];
  clientId: () => string | undefined;
  clientSecret: () => string | undefined;
  authorizeUrl: () => string;
  pkce: boolean;
  exchange(code: string, verifier: string, redirectUri: string, http: Fetch): Promise<Token>;
  refresh?(token: Token, http: Fetch): Promise<Token>;
  fetchData(token: Token, http: Fetch): Promise<SocialImport>;
  revoke(token: Token, http: Fetch): Promise<void>;
  /** What this connection can and can't read, shown before the person agrees. */
  reads: string;
}

const graphVersion = () => process.env.FACEBOOK_GRAPH_VERSION ?? "v24.0";
const GRAPH = () => `https://graph.facebook.com/${graphVersion()}`;

async function json<T>(res: Response, what: string): Promise<T> {
  const body = await res.text();
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${body.slice(0, 200)}`);
  return JSON.parse(body) as T;
}

const basicAuth = (id: string, secret?: string): Record<string, string> => (secret ? { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` } : {});
const bearer = (t: Token) => ({ Authorization: `Bearer ${t.access_token}` });
const expiry = (seconds?: number) => (seconds ? Date.now() + seconds * 1000 : undefined);
const empty = (platform: Platform): SocialImport => ({ platform, account: { websites: [] }, positions: [], education: [], skills: [], certifications: [], languages: [], posts: [], skipped: 0 });

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export const PROVIDERS: Record<Platform, Provider> = {
  x: {
    scopes: ["tweet.read", "users.read", "offline.access"],
    clientId: () => process.env.X_CLIENT_ID,
    clientSecret: () => process.env.X_CLIENT_SECRET,
    authorizeUrl: () => "https://x.com/i/oauth2/authorize",
    pkce: true,
    reads: "Your profile (name, handle, bio, location) and your 100 most recent posts. Not your DMs, likes, followers or anyone else's posts.",
    async exchange(code, verifier, redirectUri, http) {
      const id = this.clientId()!;
      const res = await http("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...basicAuth(id, this.clientSecret()) },
        body: new URLSearchParams({ code, grant_type: "authorization_code", client_id: id, redirect_uri: redirectUri, code_verifier: verifier }),
      });
      const t = await json<TokenResponse>(res, "X sign-in");
      return { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: expiry(t.expires_in) };
    },
    async refresh(token, http) {
      const id = this.clientId()!;
      const res = await http("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...basicAuth(id, this.clientSecret()) },
        body: new URLSearchParams({ refresh_token: token.refresh_token!, grant_type: "refresh_token", client_id: id }),
      });
      const t = await json<TokenResponse>(res, "Refreshing the X connection");
      return { access_token: t.access_token, refresh_token: t.refresh_token ?? token.refresh_token, expires_at: expiry(t.expires_in) };
    },
    async fetchData(token, http) {
      type User = { id: string; name: string; username: string; description?: string; location?: string; created_at?: string; entities?: { url?: { urls?: { expanded_url?: string }[] } } };
      const me = (await json<{ data: User }>(await http("https://api.x.com/2/users/me?user.fields=description,location,created_at,entities", { headers: bearer(token) }), "Reading your X profile")).data;
      type Tweet = { id: string; text: string; created_at?: string; in_reply_to_user_id?: string; public_metrics?: { like_count?: number; retweet_count?: number } };
      const tweets = await json<{ data?: Tweet[] }>(
        await http(`https://api.x.com/2/users/${me.id}/tweets?max_results=100&exclude=retweets&tweet.fields=created_at,public_metrics,in_reply_to_user_id`, { headers: bearer(token) }),
        "Reading your X posts",
      );
      const out = empty("x");
      const site = me.entities?.url?.urls?.[0]?.expanded_url;
      out.account = { name: me.name, handle: `@${me.username}`, bio: me.description || undefined, location: me.location || undefined, joined: me.created_at?.slice(0, 10), websites: site ? [site] : [] };
      out.posts = (tweets.data ?? []).map((t) => ({
        date: t.created_at?.slice(0, 10) ?? null,
        text: t.text,
        url: `https://x.com/${me.username}/status/${t.id}`,
        likes: t.public_metrics?.like_count,
        reposts: t.public_metrics?.retweet_count,
        reply: !!t.in_reply_to_user_id || undefined,
      }));
      return out;
    },
    async revoke(token, http) {
      const id = this.clientId();
      if (!id) return;
      await http("https://api.x.com/2/oauth2/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", ...basicAuth(id, this.clientSecret()) },
        body: new URLSearchParams({ token: token.refresh_token ?? token.access_token, token_type_hint: token.refresh_token ? "refresh_token" : "access_token", client_id: id }),
      });
    },
  },
  linkedin: {
    scopes: ["openid", "profile"],
    clientId: () => process.env.LINKEDIN_CLIENT_ID,
    clientSecret: () => process.env.LINKEDIN_CLIENT_SECRET,
    authorizeUrl: () => "https://www.linkedin.com/oauth/v2/authorization",
    pkce: false,
    reads: "Your name only. LinkedIn doesn't let personal apps read posts or career history; import your LinkedIn data export for those.",
    async exchange(code, _verifier, redirectUri, http) {
      const res = await http("https://www.linkedin.com/oauth/v2/accessToken", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: this.clientId()!, client_secret: this.clientSecret() ?? "" }),
      });
      const t = await json<TokenResponse>(res, "LinkedIn sign-in");
      return { access_token: t.access_token, expires_at: expiry(t.expires_in) };
    },
    async fetchData(token, http) {
      const me = await json<{ name?: string; given_name?: string; family_name?: string }>(await http("https://api.linkedin.com/v2/userinfo", { headers: bearer(token) }), "Reading your LinkedIn profile");
      const out = empty("linkedin");
      out.account = { name: me.name ?? ([me.given_name, me.family_name].filter(Boolean).join(" ") || undefined), websites: [] };
      return out;
    },
    async revoke(token, http) {
      const id = this.clientId();
      if (!id) return;
      await http("https://www.linkedin.com/oauth/v2/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: id, client_secret: this.clientSecret() ?? "", token: token.access_token }),
      });
    },
  },
  facebook: {
    scopes: ["public_profile", "user_posts"],
    clientId: () => process.env.FACEBOOK_APP_ID,
    clientSecret: () => process.env.FACEBOOK_APP_SECRET,
    authorizeUrl: () => `https://www.facebook.com/${graphVersion()}/dialog/oauth`,
    pkce: false,
    reads: "Your name and posts you wrote on your own timeline (up to 500). Not your messages, friends, photos or other people's posts.",
    async exchange(code, _verifier, redirectUri, http) {
      const q = new URLSearchParams({ client_id: this.clientId()!, client_secret: this.clientSecret() ?? "", redirect_uri: redirectUri, code });
      const t = await json<TokenResponse>(await http(`${GRAPH()}/oauth/access_token?${q}`), "Facebook sign-in");
      return { access_token: t.access_token, expires_at: expiry(t.expires_in) };
    },
    async fetchData(token, http) {
      const me = await json<{ id: string; name?: string }>(await http(`${GRAPH()}/me?fields=id,name`, { headers: bearer(token) }), "Reading your Facebook profile");
      const out = empty("facebook");
      out.account = { name: me.name, websites: [] };
      let next: string | undefined = `${GRAPH()}/me/posts?fields=message,created_time,permalink_url&limit=100`;
      for (let page = 0; next && page < 5; page++) {
        const res: { data?: { message?: string; created_time?: string; permalink_url?: string }[]; paging?: { next?: string } } = await json(
          await http(next, { headers: bearer(token) }),
          "Reading your Facebook posts",
        );
        for (const p of res.data ?? []) if (p.message) out.posts.push({ date: p.created_time?.slice(0, 10) ?? null, text: p.message, url: p.permalink_url });
        next = res.paging?.next;
      }
      return out;
    },
    async revoke(token, http) {
      await http(`${GRAPH()}/me/permissions`, { method: "DELETE", headers: bearer(token) });
    },
  },
};

export const oauthConfigured = (p: Platform) => !!PROVIDERS[p].clientId() && (PROVIDERS[p].pkce || !!PROVIDERS[p].clientSecret());

/** Where the platform sends the person back. Set FUTUREME_PUBLIC_URL when FutureMe runs behind a proxy or on a domain. */
export const publicBase = (origin: string) => (process.env.FUTUREME_PUBLIC_URL ?? process.env.TWIN_PUBLIC_URL ?? origin).replace(/\/+$/, "");

export const redirectUri = (platform: Platform, origin: string) => `${publicBase(origin)}/api/connections/oauth/${platform}/callback`;

const STATE_TTL_MINUTES = 10;

/** Step 1: the link to the platform's consent screen. The person has already agreed in FutureMe. */
export function startOAuth(db: Db, platform: Platform, origin: string, consent: boolean): string {
  if (!consent) throw new Error("Agree to the connection first.");
  const p = PROVIDERS[platform];
  if (!oauthConfigured(platform)) throw new Error(`Signing in with ${PLATFORM_NAMES[platform]} isn't set up on this server. Import your data export instead.`);
  db.prepare(`DELETE FROM social_oauth_states WHERE created_at < datetime('now', '-${STATE_TTL_MINUTES} minutes')`).run();
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  db.prepare("INSERT INTO social_oauth_states (state, platform, verifier, consent_at) VALUES (?, ?, ?, ?)").run(state, platform, verifier, new Date().toISOString());
  const q = new URLSearchParams({ response_type: "code", client_id: p.clientId()!, redirect_uri: redirectUri(platform, origin), scope: p.scopes.join(" "), state });
  if (p.pkce) {
    q.set("code_challenge", crypto.createHash("sha256").update(verifier).digest("base64url"));
    q.set("code_challenge_method", "S256");
  }
  return `${p.authorizeUrl()}?${q}`;
}

/** Step 2: the platform sent the person back. Checks the state, stores the token encrypted, and imports. */
export async function finishOAuth(
  db: Db,
  platform: Platform,
  params: { code?: string | null; state?: string | null; error?: string | null },
  origin: string,
  opts: { http?: Fetch; provider?: LlmProvider } = {},
) {
  const http = opts.http ?? fetch;
  const row = params.state
    ? (db
        .prepare(`SELECT platform, verifier, consent_at FROM social_oauth_states WHERE state = ? AND created_at >= datetime('now', '-${STATE_TTL_MINUTES} minutes')`)
        .get(params.state) as { platform: string; verifier: string; consent_at: string } | undefined)
    : undefined;
  if (params.state) db.prepare("DELETE FROM social_oauth_states WHERE state = ?").run(params.state);
  if (params.error) throw new Error(`${PLATFORM_NAMES[platform]} said: ${params.error}. Nothing was imported.`);
  if (!row || row.platform !== platform || !params.code) throw new Error("This sign-in link expired or didn't come from FutureMe. Start again from Connected accounts.");

  const provider = PROVIDERS[platform];
  const token = await provider.exchange(params.code, row.verifier, redirectUri(platform, origin), http);
  const data = await provider.fetchData(token, http);
  db.prepare(
    "INSERT INTO social_tokens (platform, secret, account, scopes) VALUES (?, ?, ?, ?) ON CONFLICT(platform) DO UPDATE SET secret = excluded.secret, account = excluded.account, scopes = excluded.scopes, created_at = datetime('now')",
  ).run(platform, encryptSecret(JSON.stringify(token)), data.account.handle ?? data.account.name ?? null, provider.scopes.join(" "));
  return importSocial(db, data, { method: "oauth", consent: true, consentAt: row.consent_at, provider: opts.provider });
}

function storedToken(db: Db, platform: Platform): Token | null {
  const row = db.prepare("SELECT secret FROM social_tokens WHERE platform = ?").get(platform) as { secret: string } | undefined;
  const plain = row && decryptSecret(row.secret);
  return plain ? (JSON.parse(plain) as Token) : null;
}

/** Fetches again with the stored token, refreshing it first when it has expired. */
export async function syncOAuth(db: Db, platform: Platform, opts: { http?: Fetch; provider?: LlmProvider } = {}) {
  const http = opts.http ?? fetch;
  const p = PROVIDERS[platform];
  let token = storedToken(db, platform);
  if (!token) throw new Error(`Connect ${PLATFORM_NAMES[platform]} again: the saved connection is missing or can't be read with this server's key.`);
  if (token.expires_at && token.expires_at < Date.now() + 60_000) {
    if (!p.refresh || !token.refresh_token) throw new Error(`The ${PLATFORM_NAMES[platform]} connection expired. Connect again.`);
    token = await p.refresh(token, http);
    db.prepare("UPDATE social_tokens SET secret = ? WHERE platform = ?").run(encryptSecret(JSON.stringify(token)), platform);
  }
  const consentAt = (db.prepare("SELECT consent_at FROM social_sources WHERE platform = ?").get(platform) as { consent_at: string } | undefined)?.consent_at;
  return importSocial(db, await p.fetchData(token, http), { method: "oauth", consent: true, consentAt, provider: opts.provider });
}

/** Revokes the token at the platform (best effort) and forgets it. Imported data stays unless `deleteData`. */
export async function disconnect(db: Db, platform: Platform, opts: { deleteData?: boolean; http?: Fetch; provider?: LlmProvider } = {}) {
  const token = storedToken(db, platform);
  if (token) await PROVIDERS[platform].revoke(token, opts.http ?? fetch).catch(() => undefined);
  db.prepare("DELETE FROM social_tokens WHERE platform = ?").run(platform);
  if (opts.deleteData) await deleteSource(db, platform, opts.provider);
}

export function connectedAccounts(db: Db): Record<string, { account: string | null; since: string }> {
  const rows = db.prepare("SELECT platform, account, created_at FROM social_tokens").all() as { platform: string; account: string | null; created_at: string }[];
  return Object.fromEntries(rows.map((r) => [r.platform, { account: r.account, since: r.created_at }]));
}
