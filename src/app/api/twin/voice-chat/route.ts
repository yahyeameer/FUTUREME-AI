import { db } from "@/lib/server-db";
import { voiceChatTurn, type ChatTurn } from "@/lib/twin-calls";
import { getVoiceApi } from "@/lib/voice";
import { errorResponse } from "../state";

// One turn of talking with your future self in your own cloned voice: the page sends what you said (audio) and the
// conversation so far, and gets back what was heard, Nemotron's reply as text, and the reply spoken in your voice.

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof File) || !file.size) return Response.json({ error: "Record something first." }, { status: 400 });
  let history: ChatTurn[] = [];
  try {
    const parsed = JSON.parse(String(form?.get("history") ?? "[]")) as unknown;
    if (Array.isArray(parsed)) history = parsed.filter((t): t is ChatTurn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string");
  } catch {
    // A bad history just means a fresh conversation.
  }
  const d = db();
  try {
    const api = getVoiceApi(d);
    if (!api) throw new Error("This needs an ElevenLabs key. Add one under Voice engine.");
    const out = await voiceChatTurn(d, api, { data: new Uint8Array(await file.arrayBuffer()), filename: file.name || "speech.wav", type: file.type || "audio/wav" }, history);
    return Response.json({ heard: out.heard, reply: out.reply, audio: Buffer.from(out.audio).toString("base64"), type: out.type }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
