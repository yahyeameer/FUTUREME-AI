import { connection } from "next/server";
import { z } from "zod";
import { db } from "@/lib/server-db";
import { addContact, decideTwinApproval, removeContact, setTwinPaused } from "@/lib/twin";
import { ensureInbox, getMailApi, sendApprovedEmail, setOwnerEmail } from "@/lib/mail";
import {
  cancelCall,
  confirmOwnerPhone,
  dialApprovedCall,
  removeOwnerPhone,
  scheduleSelfCall,
  setBlocked,
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
  z.object({ action: z.literal("dialApproved"), callId: z.number().int() }),
  z.object({ action: z.literal("sendApproved"), emailId: z.number().int() }),
  z.object({ action: z.literal("setBlocked"), number: z.string().max(40), blocked: z.boolean() }),
  z.object({ action: z.literal("setOwnerEmail"), email: z.string().max(200) }),
  z.object({ action: z.literal("setupInbox") }),
]);

const needsMail = () => {
  const api = getMailApi();
  if (!api) throw new Error("The twin's email needs AGENTMAIL_API_KEY on the server.");
  return api;
};

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
      case "decide": {
        // Approving is the user's go: an approved call is dialled and an approved email sent right away. If that
        // can't happen (not set up, or it fails), the approval stands and the card offers to try again.
        const { callId, emailId } = decideTwinApproval(d, a.id, a.decision === "approve");
        try {
          const voice = getVoiceApi();
          const mail = getMailApi();
          if (callId && voice) await dialApprovedCall(d, voice, callId);
          if (emailId && mail) await sendApprovedEmail(d, mail, emailId);
        } catch (err) {
          extra = { warning: err instanceof Error ? err.message : "Approved, but it couldn't go out yet." };
        }
        break;
      }
      case "dialApproved":
        await dialApprovedCall(d, needsKey(), a.callId);
        break;
      case "sendApproved":
        await sendApprovedEmail(d, needsMail(), a.emailId);
        break;
      case "setBlocked":
        setBlocked(d, a.number, a.blocked);
        break;
      case "setOwnerEmail":
        setOwnerEmail(d, a.email);
        break;
      case "setupInbox":
        await ensureInbox(d, needsMail());
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
