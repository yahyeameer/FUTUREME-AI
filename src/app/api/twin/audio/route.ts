import { db } from "@/lib/server-db";
import { sealCapsule } from "@/lib/twin-calls";
import { createInstantClone, getTranscriber, getVoiceApi, MAX_SAMPLES, verifyConsent, verifyProfessional, type AudioInput } from "@/lib/voice";
import { errorResponse, twinState } from "../state";

// Recordings from the Twin page, as multipart form data:
//   action=consent  consentId=<id>  audio=<file>      the consent phrase, read aloud
//   action=clone    samples=<file>...                 extra samples for the instant clone (up to five)
//   action=captcha  audio=<file>                      ElevenLabs' CAPTCHA for the professional clone, read aloud
//   action=capsule  audio=<file>  at=<ISO date>       a time capsule message, read back on a call on that date

async function toAudio(value: FormDataEntryValue | null): Promise<AudioInput> {
  if (!(value instanceof File)) throw new Error("Attach a recording.");
  return { data: new Uint8Array(await value.arrayBuffer()), filename: value.name || "recording.webm", type: value.type };
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const d = db();
    const elevenlabs = () => {
      const api = getVoiceApi(d);
      if (!api) throw new Error("This needs an ElevenLabs key. Add one under Voice engine.");
      return api;
    };
    switch (form.get("action")) {
      case "consent": {
        const stt = getTranscriber(d);
        if (!stt) throw new Error("Checking your consent phrase needs an ElevenLabs or OpenRouter key. Add one under Voice engine.");
        const result = await verifyConsent(d, stt, Number(form.get("consentId")), await toAudio(form.get("audio")));
        return Response.json({ ...twinState(d), result });
      }
      case "clone": {
        const samples = form.getAll("samples");
        if (samples.length > MAX_SAMPLES) throw new Error(`Add at most ${MAX_SAMPLES} samples.`);
        await createInstantClone(d, await Promise.all(samples.map(toAudio)));
        return Response.json(twinState(d));
      }
      case "captcha":
        await verifyProfessional(d, elevenlabs(), await toAudio(form.get("audio")));
        return Response.json(twinState(d));
      case "capsule":
        await sealCapsule(d, elevenlabs(), await toAudio(form.get("audio")), new Date(String(form.get("at"))));
        return Response.json(twinState(d));
      default:
        throw new Error("Unknown action.");
    }
  } catch (err) {
    return errorResponse(err);
  }
}
