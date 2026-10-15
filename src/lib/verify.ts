import { parseJsonReply, runAgent } from "./agents";
import type { Db } from "./db";
import { VERIFY_MARKER } from "./mock-llm";
import { listNotes, readNote } from "./vault";

// The fact checker: a second agent reads a future-self reply against the user's notes and marks each claim.
// The app then re-checks the checker: a claim is only "supported" if the note it cites exists in the vault.

export type ClaimStatus = "supported" | "unverified" | "opinion";

export interface Verification {
  verdict: "grounded" | "check" | "no_claims";
  claims: { text: string; status: ClaimStatus; source: string | null }[];
  checkedAt: string;
  backend: string;
}

export async function verifyMessage(db: Db, messageId: number): Promise<Verification> {
  const msg = db.prepare("SELECT id, role, content, citations FROM messages WHERE id = ?").get(messageId) as
    | { id: number; role: string; content: string; citations: string | null }
    | undefined;
  if (!msg || msg.role !== "assistant") throw new Error(`No reply #${messageId} to check.`);

  const vault = new Set(listNotes().map((p) => p.split("\\").join("/")));
  const cited = (msg.citations ? (JSON.parse(msg.citations) as string[]) : []).filter((p) => vault.has(p));
  const notes = cited.slice(0, 6).map((p) => {
    const n = readNote(p);
    return { path: n.path, title: n.title, excerpt: n.body.replace(/^\s*# .*\n+/, "").slice(0, 900) };
  });

  const run = await runAgent(db, "verifier", [{ role: "user", content: `${VERIFY_MARKER} ${JSON.stringify({ reply: msg.content, notes })}` }]);
  const parsed = parseJsonReply<{ claims?: { text?: unknown; status?: unknown; source?: unknown }[] }>(run.reply);
  if (!parsed?.claims) throw new Error("The fact checker didn't return a readable result.");

  const claims = parsed.claims
    .filter((c) => typeof c.text === "string" && c.text.trim())
    .slice(0, 12)
    .map((c) => {
      const source = typeof c.source === "string" && vault.has(c.source) ? c.source : null;
      const said = c.status === "supported" || c.status === "opinion" ? c.status : "unverified";
      // A "supported" claim must point at a real note; otherwise it's unverified, whatever the checker said.
      const status: ClaimStatus = said === "supported" && !source ? "unverified" : said;
      return { text: (c.text as string).trim(), status, source: status === "supported" ? source : null };
    });
  const factual = claims.filter((c) => c.status !== "opinion");
  const verification: Verification = {
    verdict: !factual.length ? "no_claims" : factual.every((c) => c.status === "supported") ? "grounded" : "check",
    claims,
    checkedAt: new Date().toISOString(),
    backend: run.backend,
  };
  db.prepare("UPDATE messages SET verification = ? WHERE id = ?").run(JSON.stringify(verification), messageId);
  return verification;
}
