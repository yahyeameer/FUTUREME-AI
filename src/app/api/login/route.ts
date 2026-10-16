import { ACCESS_COOKIE, accessToken, checkCode } from "@/lib/access";

// Signs in with FUTUREME_ACCESS_CODE and sets the access cookie. A few wrong codes in a row from one address are slowed.

const MAX_TRIES = 5;
const WINDOW_MS = 15 * 60_000;
const tries = new Map<string, { n: number; since: number }>();

/** Only a path on this site: "//host" and "/\host" would leave it. */
const safeNext = (next: unknown) => (typeof next === "string" && /^\/(?![\/\\])/.test(next) && !next.includes("\\") ? next : "/");

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const code = String(form?.get("code") ?? "");
  const next = safeNext(form?.get("next"));
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const t = tries.get(ip);
  const fresh = !t || Date.now() - t.since > WINDOW_MS;
  const back = (error: string) => Response.redirect(new URL(`/login?error=${error}&next=${encodeURIComponent(next)}`, request.url), 303);
  if (!fresh && t.n >= MAX_TRIES) return back("wait");
  if (!checkCode(code)) {
    tries.set(ip, fresh ? { n: 1, since: Date.now() } : { n: t.n + 1, since: t.since });
    return back("wrong");
  }
  tries.delete(ip);
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
  const cookie = [`${ACCESS_COOKIE}=${accessToken(code.trim())}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${30 * 86400}`, secure ? "Secure" : ""].filter(Boolean).join("; ");
  return new Response(null, { status: 303, headers: { Location: new URL(next, request.url).toString(), "Set-Cookie": cookie } });
}
