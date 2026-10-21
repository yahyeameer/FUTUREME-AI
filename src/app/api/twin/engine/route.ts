import { z } from "zod";
import { db } from "@/lib/server-db";
import { testEngine } from "@/lib/voice";
import { ENGINE_IDS } from "@/lib/voice-engines";
import { errorResponse } from "../state";

// Tests a voice engine from the Twin page: checks the key (typed in the form, or saved) by speaking a short line, and
// returns the audio. X-Own-Voice says whether it spoke in the user's cloned voice. The key never comes back.

const Test = z.object({
  engine: z.enum(ENGINE_IDS),
  key: z.string().max(500).optional(),
  model: z.string().max(120).optional(),
  voice: z.string().max(120).optional(),
  baseUrl: z.string().max(300).optional(),
  text: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const parsed = Test.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  try {
    const speech = await testEngine(db(), parsed.data);
    return new Response(speech.audio, { headers: { "Content-Type": speech.type, "Cache-Control": "no-store", "X-Own-Voice": speech.ownVoice ? "1" : "0" } });
  } catch (err) {
    return errorResponse(err);
  }
}
