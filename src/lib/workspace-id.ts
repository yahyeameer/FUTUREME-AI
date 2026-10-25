// Workspace ids for the multi-user mode (FUTUREME_MULTI_USER=1): every visitor who enters the access code gets a
// private workspace of their own, with its own database and vault. The id is a random 128-bit value kept in a cookie;
// holding it is what proves it's your workspace, so it's never shown to anyone else. Pure helpers only (no Node
// imports) so the proxy, the login route and the server can all share them.

export const WORKSPACE_COOKIE = "futureme_ws";

const ID = /^[a-f0-9]{32}$/;

export const multiUser = () => process.env.FUTUREME_MULTI_USER === "1";

/** Only 32 hex characters: the id becomes a folder name, so nothing else may get through. */
export const isWorkspaceId = (value: unknown): value is string => typeof value === "string" && ID.test(value);

export function newWorkspaceId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** One cookie's value from a raw Cookie header, or null. */
export function cookieValue(header: string | undefined | null, name: string): string | null {
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
