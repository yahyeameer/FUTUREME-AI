import crypto from "node:crypto";
import { getSetting, setSetting, type Db } from "../db";
import { decryptSecret, encryptSecret } from "../social/secrets";

// The user's Google account, for Gmail and Google Calendar. Two ways in:
//   GOOGLE_REFRESH_TOKEN   a refresh token you made yourself (for example with Google's OAuth Playground), or
//   Connect Google         the button on the Agent page, which runs Google's consent screen and stores the refresh
//                          token encrypted (social/secrets.ts).
// Both need an OAuth client from Google Cloud: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, with
// <your address>/api/integrations/google/callback as an authorised redirect URI for the button.

type Fetch = typeof fetch;

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
];

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const STATE_TTL_MS = 10 * 60_000;

const clientId = () => process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET?.trim();

/** True when the server has an OAuth client, so the Connect button can work. */
export const googleClientConfigured = () => !!clientId() && !!clientSecret();

function storedRefreshToken(db: Db): string | null {
  const env = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  if (env) return env;
  const sealed = getSetting(db, "google_refresh_token");
  return sealed ? decryptSecret(sealed) : null;
}

export function googleConnection(db: Db): { connected: boolean; via: "env" | "app" | null; email: string | null } {
  if (!googleClientConfigured()) return { connected: false, via: null, email: null };
  if (process.env.GOOGLE_REFRESH_TOKEN?.trim()) return { connected: true, via: "env", email: getSetting(db, "google_email") };
  const token = storedRefreshToken(db);
  return { connected: !!token, via: token ? "app" : null, email: token ? getSetting(db, "google_email") : null };
}

// One access token per process, refreshed a minute before it expires.
const g = globalThis as unknown as { __futuremeGoogleToken?: { refresh: string; access: string; expiresAt: number } };

export async function googleAccessToken(db: Db, http: Fetch = fetch): Promise<string> {
  const refresh = storedRefreshToken(db);
  if (!googleClientConfigured() || !refresh) throw new Error("Google isn't connected. Connect it on the Agent page, under Integrations.");
  const cached = g.__futuremeGoogleToken;
  if (cached?.refresh === refresh && cached.expiresAt - 60_000 > Date.now()) return cached.access;
  const res = await http(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId()!, client_secret: clientSecret()!, refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Google refused the saved sign-in (${res.status}). Connect Google again. ${body.slice(0, 160)}`);
  const t = JSON.parse(body) as { access_token: string; expires_in?: number };
  g.__futuremeGoogleToken = { refresh, access: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  return t.access_token;
}

/** A call to a Google REST API with the user's access token. Throws with Google's message when it fails. */
export async function googleApi<T>(db: Db, url: string, init: { method?: string; body?: unknown } = {}, http: Fetch = fetch): Promise<T> {
  const token = await googleAccessToken(db, http);
  const res = await http(url, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 200);
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      // not JSON
    }
    throw new Error(`Google answered ${res.status}: ${message}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// ---------- Connect Google (the consent screen) ----------

export const googleRedirectUri = (base: string) => `${base.replace(/\/+$/, "")}/api/integrations/google/callback`;

/** Step 1: the link to Google's consent screen. */
export function startGoogleOAuth(db: Db, base: string): string {
  if (!googleClientConfigured()) throw new Error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server first.");
  const state = crypto.randomBytes(24).toString("base64url");
  setSetting(db, "google_oauth_state", JSON.stringify({ state, at: Date.now() }));
  const q = new URLSearchParams({
    client_id: clientId()!,
    redirect_uri: googleRedirectUri(base),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Step 2: Google sent the person back. Swaps the code for a refresh token and stores it encrypted. */
export async function finishGoogleOAuth(db: Db, base: string, code: string, state: string, http: Fetch = fetch): Promise<string | null> {
  const saved = getSetting(db, "google_oauth_state");
  setSetting(db, "google_oauth_state", null);
  const parsed = saved ? (JSON.parse(saved) as { state: string; at: number }) : null;
  if (!parsed || parsed.state !== state || Date.now() - parsed.at > STATE_TTL_MS) throw new Error("That sign-in link expired. Try Connect Google again.");
  const res = await http(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId()!, client_secret: clientSecret()!, redirect_uri: googleRedirectUri(base), grant_type: "authorization_code" }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status}): ${body.slice(0, 200)}`);
  const t = JSON.parse(body) as { access_token: string; refresh_token?: string; expires_in?: number; id_token?: string };
  if (!t.refresh_token) throw new Error("Google didn't return a long-lived sign-in. Remove TOMORA from your Google account's third-party access and connect again.");
  setSetting(db, "google_refresh_token", encryptSecret(t.refresh_token));
  g.__futuremeGoogleToken = { refresh: t.refresh_token, access: t.access_token, expiresAt: Date.now() + (t.expires_in ?? 3600) * 1000 };
  const email = emailFromIdToken(t.id_token);
  setSetting(db, "google_email", email);
  return email;
}

/** The address inside Google's id_token. It came straight from Google's token endpoint over TLS, so it isn't re-verified. */
function emailFromIdToken(idToken?: string): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    return (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: string }).email ?? null;
  } catch {
    return null;
  }
}

/** Forgets the stored sign-in and revokes it at Google. A token from GOOGLE_REFRESH_TOKEN stays (it's in the env). */
export async function disconnectGoogle(db: Db, http: Fetch = fetch) {
  const sealed = getSetting(db, "google_refresh_token");
  const token = sealed ? decryptSecret(sealed) : null;
  setSetting(db, "google_refresh_token", null);
  setSetting(db, "google_email", null);
  g.__futuremeGoogleToken = undefined;
  if (token) await http(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}
