import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server-db";
import { addContact, decideTwinApproval, removeContact, setTwinPaused } from "@/lib/twin";
import { getVoiceApi, professionalCaptcha, refreshProfessional, revokeVoice, startConsent, startProfessionalClone } from "@/lib/voice";
import { errorResponse, twinState } from "./state";

// The Twin page's endpoint. GET returns the twin's state; POST runs one action and returns the new state.
// Recordings go through POST /api/twin/audio, and the voice preview through POST /api/twin/preview.

export async function GET() {
  await connection();
  return Response.json(twinState(db()), { headers: { "Cache-Control": "no-store" } });
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addContact"), contact: z.unknown() }),
  z.object({ action: z.literal("removeContact"), id: z.number().int() }),
  z.object({ action: z.literal("setPaused"), paused: z.boolean() }),
  z.object({ action: z.literal("decide"), id: z.number().int(), decision: z.enum(["approve", "reject"]) }),
  z.object({ action: z.literal("startConsent") }),
  z.object({ action: z.literal("startProfessional"), language: z.string().regex(/^[a-z]{2}$/).optional() }),
  z.object({ action: z.literal("captcha") }),
  z.object({ action: z.literal("refreshVoice") }),
  z.object({ action: z.literal("revokeVoice") }),
]);

const needsKey = () => {
  const api = getVoiceApi();
  if (!api) throw new Error("Voice cloning needs ELEVENLABS_API_KEY on the server.");
  return api;
};

export async function POST(request: Request) {
  const parsed = Action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const a = parsed.data;
  const d = db();
  try {
    let extra: Record<string, unknown> = {};
    switch (a.action) {
      case "addContact":
        addContact(d, a.contact);
        break;
      case "removeContact":
        removeContact(d, a.id);
        break;
      case "setPaused":
        setTwinPaused(d, a.paused);
        break;
      case "decide":
        decideTwinApproval(d, a.id, a.decision === "approve");
        break;
      case "startConsent":
        needsKey();
        extra = { consent: startConsent(d) };
        break;
      case "startProfessional":
        await startProfessionalClone(d, needsKey(), a.language);
        break;
      case "captcha":
        extra = { captcha: await professionalCaptcha(d, needsKey()) };
        break;
      case "refreshVoice":
        await refreshProfessional(d, needsKey());
        break;
      case "revokeVoice":
        await revokeVoice(d, getVoiceApi());
        break;
    }
    return Response.json({ ...twinState(d), ...extra });
  } catch (err) {
    return errorResponse(err);
  }
}
