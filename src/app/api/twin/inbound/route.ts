import { db } from "@/lib/server-db";
import { answerInbound, checkLlmSecret, SECRET_HEADER } from "@/lib/twin-calls";

// ElevenLabs' conversation initiation webhook: called before the twin answers a call to its Twilio number.
// The twin's agent config points here and sends the same secret header as the custom LLM requests.

export async function POST(request: Request) {
  const d = db();
  if (!checkLlmSecret(d, request.headers.get(SECRET_HEADER))) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const type = request.headers.get("content-type") ?? "";
  const body = type.includes("application/x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(await request.text())) : await request.json().catch(() => null);
  try {
    return Response.json(answerInbound(d, body ?? {}));
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
}
