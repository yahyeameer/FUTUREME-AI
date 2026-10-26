import { db } from "@/lib/server-db";
import { endVoiceChat, startVoiceChat, voiceChatTurn } from "@/lib/twin-calls";
import { getTranscriber, type AudioInput } from "@/lib/voice";
import { errorResponse, twinState } from "../state";

// Voice messages with the future self, as multipart form data (see "Voice messages in the browser" in twin-calls.ts):
//   action=start  topic=<text>                        the opening line, spoken
//   action=turn   callId=<id>  audio=<file> | text=<text>   what you said in, the future self's spoken answer out
//   action=end    callId=<id>                         files the conversation in the vault
// Spoken lines come back as base64 audio with their type.

async function toAudio(value: FormDataEntryValue | null): Promise<AudioInput | undefined> {
  if (!(value instanceof File)) return undefined;
  return { data: new Uint8Array(await value.arrayBuffer()), filename: value.name || "message.webm", type: value.type };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const d = db();
    const callId = Number(form.get("callId"));
    switch (form.get("action")) {
      case "start":
        return Response.json(await startVoiceChat(d, String(form.get("topic") ?? "")));
      case "turn": {
        const text = form.get("text");
        return Response.json(await voiceChatTurn(d, getTranscriber(d), callId, { audio: await toAudio(form.get("audio")), text: typeof text === "string" ? text : undefined }));
      }
      case "end":
        endVoiceChat(d, callId);
        return Response.json(twinState(d));
      default:
        throw new Error("Unknown action.");
    }
  } catch (err) {
    return errorResponse(err);
  }
}
