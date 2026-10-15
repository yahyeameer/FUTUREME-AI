import { db } from "@/lib/server-db";
import { getVoiceApi, previewVoice } from "@/lib/voice";
import { errorResponse } from "../state";

// Speaks a short line in the user's cloned voice, so they can hear their twin.
export async function POST(request: Request) {
  try {
    const api = getVoiceApi();
    if (!api) throw new Error("Voice cloning needs ELEVENLABS_API_KEY on the server.");
    const { text } = (await request.json().catch(() => ({}))) as { text?: unknown };
    const audio = await previewVoice(db(), api, typeof text === "string" ? text : undefined);
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
