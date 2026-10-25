import { ACCESS_COOKIE, accessCode, accessToken, checkCode } from "@/lib/access";
import { isWorkspaceId, multiUser, newWorkspaceId, WORKSPACE_COOKIE } from "@/lib/workspace-id";

// Signs in with FUTUREME_ACCESS_CODE and sets the access cookie. A few wrong codes in a row from one address are slowed.
// The address comes from X-Forwarded-For, which a client can set itself, so wrong codes are also capped across all
// addresses: changing the header can't buy unlimited guesses.
// In multi-user mode (FUTUREME_MULTI_USER=1) a correct code also hands out a workspace cookie: a new private workspace,
// or the one named by the optional "workspace" field, so a judge can pick their own up again on another device.

const MAX_TRIES = 5;
const MAX_TRIES_ALL = 50;
const WINDOW_MS = 15 * 60_000;
const ALL = "\u0000all";
const tries = new Map<string, { n: number; since: number }>();

function blocked(key: string, max: number) {
  const t = tries.get(key);
  return !!t && Date.now() - t.since <= WINDOW_MS && t.n >= max;
}

function count(key: string) {
  const t = tries.get(key);
  tries.set(key, !t || Date.now() - t.since > WINDOW_MS ? { n: 1, since: Date.now() } : { n: t.n + 1, since: t.since });
}

/** A relative Location: behind a proxy request.url names the internal host (http://localhost:3000), not the public one. */
const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ Location: location });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
};

/** Only a path on this site: "//host" and "/\host" would leave it. */
const safeNext = (next: unknown) => (typeof next === "string" && /^\/(?![\/\\])/.test(next) && !next.includes("\\") ? next : "/");

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const code = String(form?.get("code") ?? "");
  const next = safeNext(form?.get("next"));
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const back = (error: string) => redirect(`/login?error=${error}&next=${encodeURIComponent(next)}`);
  if (blocked(ip, MAX_TRIES) || blocked(ALL, MAX_TRIES_ALL)) return back("wait");
  if (accessCode() && !checkCode(code)) {
    count(ip);
    count(ALL);
    return back("wrong");
  }
  tries.delete(ip);
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const cookie = (name: string, value: string) => [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${30 * 86400}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
  const cookies = [cookie(ACCESS_COOKIE, accessToken(code.trim()))];
  if (multiUser()) {
    const resume = String(form?.get("workspace") ?? "").trim().toLowerCase();
    cookies.push(cookie(WORKSPACE_COOKIE, isWorkspaceId(resume) ? resume : newWorkspaceId()));
  }
  return redirect(next, cookies);
}
