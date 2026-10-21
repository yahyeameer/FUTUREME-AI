import { db } from "@/lib/server-db";
import { previewVoice } from "@/lib/voice";
import { errorResponse } from "../state";

// Speaks a short line in the user's cloned voice, so they can hear their twin.
export async function POST(request: Request) {
  try {
    const { text } = (await request.json().catch(() => ({}))) as { text?: unknown };
    const speech = await previewVoice(db(), typeof text === "string" ? text : undefined);
    return new Response(speech.audio, { headers: { "Content-Type": speech.type, "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
