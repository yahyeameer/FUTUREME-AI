import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server-db";
import { addContact, decideTwinApproval, removeContact, setTwinPaused } from "@/lib/twin";
import {
  cancelCall,
  confirmOwnerPhone,
  removeOwnerPhone,
  scheduleSelfCall,
  setOwnerPhone,
  startWebCall,
  syncCalls,
  webCallConnected,
  webCallEnded,
} from "@/lib/twin-calls";
import { getVoiceApi, professionalCaptcha, refreshProfessional, revokeVoice, startConsent, startProfessionalClone } from "@/lib/voice";
import { errorResponse, twinState } from "./state";

// The Twin page's endpoint. GET returns the twin's state; POST runs one action and returns the new state.
// Recordings go through POST /api/twin/audio, the voice preview through POST /api/twin/preview, and ElevenLabs reaches
// the future self during a call through /api/twin/llm.

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
  z.object({ action: z.literal("startWebCall"), topic: z.string().max(200).optional() }),
  z.object({ action: z.literal("webCallConnected"), callId: z.number().int(), conversationId: z.string().min(1).max(200) }),
  z.object({ action: z.literal("webCallEnded"), callId: z.number().int() }),
  z.object({ action: z.literal("syncCalls") }),
  z.object({ action: z.literal("setPhone"), phone: z.string().max(40) }),
  z.object({ action: z.literal("confirmPhone"), code: z.string().max(20) }),
  z.object({ action: z.literal("removePhone") }),
  z.object({ action: z.literal("scheduleCall"), call: z.unknown() }),
  z.object({ action: z.literal("cancelCall"), id: z.number().int() }),
]);

const needsKey = () => {
  const api = getVoiceApi();
  if (!api) throw new Error("The voice twin needs ELEVENLABS_API_KEY on the server.");
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
      case "startWebCall":
        extra = { webCall: await startWebCall(d, needsKey(), a.topic) };
        break;
      case "webCallConnected":
        webCallConnected(d, a.callId, a.conversationId);
        break;
      case "webCallEnded":
        webCallEnded(d, a.callId);
        break;
      case "syncCalls":
        await syncCalls(d, needsKey());
        break;
      case "setPhone":
        await setOwnerPhone(d, needsKey(), a.phone);
        break;
      case "confirmPhone":
        confirmOwnerPhone(d, a.code);
        break;
      case "removePhone":
        removeOwnerPhone(d);
        break;
      case "scheduleCall":
        await scheduleSelfCall(d, getVoiceApi(), a.call);
        break;
      case "cancelCall":
        cancelCall(d, a.id);
        break;
    }
    return Response.json({ ...twinState(d), ...extra });
  } catch (err) {
    return errorResponse(err);
  }
}
