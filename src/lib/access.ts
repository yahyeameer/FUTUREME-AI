import crypto from "node:crypto";

// The access lock (Phase 4). Once the twin is public (TWIN_PUBLIC_URL), anyone who finds the address could open the
// app, approve calls and read your notes. Set FUTUREME_ACCESS_CODE and every page and API asks for that code first;
// only the webhooks ElevenLabs and AgentMail call, which carry their own secrets, stay open. src/proxy.ts enforces it.

export const ACCESS_COOKIE = "futureme_access";

export const accessCode = () => process.env.FUTUREME_ACCESS_CODE?.trim() || null;

/** The cookie value: derived from the code, so changing the code signs everyone out. */
export const accessToken = (code: string) => crypto.createHmac("sha256", code).update("futureme-access-v1").digest("base64url");

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function hasAccess(cookie: string | undefined): boolean {
  const code = accessCode();
  return !code || (!!cookie && same(cookie, accessToken(code)));
}

export const checkCode = (attempt: string) => {
  const code = accessCode();
  return !!code && same(accessToken(attempt.trim()), accessToken(code));
};

/**
 * Paths that answer without the cookie: the sign-in itself, webhooks that check their own secret or signature, and the
 * public brand surface (the landing page, icons, manifest and share image), none of which carry workspace data.
 */
export const OPEN_PATHS = [
  "/login",
  "/api/login",
  "/api/twin/llm",
  "/api/twin/inbound",
  "/api/twin/email",
  "/welcome",
  "/icon.svg",
  "/apple-icon",
  "/manifest.webmanifest",
  "/opengraph-image",
];
export const isOpenPath = (pathname: string) => OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
