import { after } from "next/server";
import { draftReply, receiveEmail, verifySvix } from "@/lib/mail";
import { db } from "@/lib/server-db";
import { raiseFlag } from "@/lib/twin-guard";

// AgentMail's webhook for the twin's inbox. Point a message.received webhook at /api/twin/email and set
// AGENTMAIL_WEBHOOK_SECRET to its signing secret (whsec_...). Unsigned or badly signed requests are refused.

export async function POST(request: Request) {
  const secret = process.env.AGENTMAIL_WEBHOOK_SECRET;
  if (!secret) return Response.json({ error: "AGENTMAIL_WEBHOOK_SECRET isn't set." }, { status: 503 });
  const raw = await request.text();
  const d = db();
  if (!verifySvix(secret, request.headers, raw)) {
    raiseFlag(d, "bad_secret", "Someone sent mail events to /api/twin/email without AgentMail's signature. They were refused.", "email webhook");
    return Response.json({ error: "Bad signature." }, { status: 401 });
  }
  let filed: ReturnType<typeof receiveEmail>;
  try {
    filed = receiveEmail(d, JSON.parse(raw));
  } catch {
    return Response.json({ error: "Invalid event." }, { status: 400 });
  }
  // Drafting runs the twin agent, so it happens after AgentMail gets its answer.
  if (filed?.draft) after(() => draftReply(d, filed.emailId).catch((err) => console.error("Twin draft failed:", err)));
  return Response.json({ ok: true });
}
