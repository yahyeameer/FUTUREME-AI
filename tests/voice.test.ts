import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import {
  activeVoice,
  createInstantClone,
  ElevenLabs,
  refreshProfessional,
  revokeVoice,
  startConsent,
  startProfessionalClone,
  verifyConsent,
  verifyProfessional,
  voiceSnapshot,
} from "../src/lib/voice";

let dir: string;
let db: Db;
let transcript = "";
let trainingState = "fine_tuned";
const requests: { method: string; url: string }[] = [];

// A stand-in for the ElevenLabs API that records what was called.
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  requests.push({ method, url });
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  if (url.endsWith("/v1/speech-to-text")) return json({ text: transcript });
  if (url.endsWith("/v1/voices/add")) return json({ voice_id: "ivc-1", requires_verification: false });
  if (url.endsWith("/v1/voices/pvc")) return json({ voice_id: "pvc-1" });
  if (url.endsWith("/v1/voices/pvc/pvc-1/samples")) return json([]);
  if (url.endsWith("/v1/voices/pvc/pvc-1/captcha") && method === "GET") return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  if (url.endsWith("/v1/voices/pvc/pvc-1/captcha")) return json({ status: "ok" });
  if (url.endsWith("/v1/voices/pvc/pvc-1/train")) return json({ status: "ok" });
  if (url.endsWith("/v1/voices/pvc-1") && method === "GET") return json({ fine_tuning: { state: { eleven_multilingual_v2: trainingState } } });
  if (method === "DELETE") return json({ status: "ok" });
  return new Response("not found", { status: 404 });
};
const api = new ElevenLabs("test-key", fakeFetch, "https://el.test");
const audio = (name = "consent.webm") => ({ data: new Uint8Array([1, 2, 3, 4]), filename: name, type: "audio/webm" });

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-voice-"));
  process.env.TWIN_DATA_DIR = path.join(dir, "voice");
  db = openDb(":memory:");
  requests.length = 0;
  trainingState = "fine_tuned";
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function consent() {
  const { id, phrase } = startConsent(db);
  transcript = phrase; // the user read it correctly
  return verifyConsent(db, api, id, audio());
}

describe("voice cloning with consent", () => {
  it("passes only when every code word and 'agree' are heard", async () => {
    const { id, phrase } = startConsent(db);
    const code = phrase.match(/code words are (.+)\.$/)![1].split(", ");
    transcript = `This is my own voice. My code words are ${code[0]}, ${code[1]}.`;
    const result = await verifyConsent(db, api, id, audio());
    expect(result.verified).toBe(false);
    expect(result.missing).toEqual(expect.arrayContaining([code[2], "agree"]));
    await expect(createInstantClone(db, api, [])).rejects.toThrow(/consent/);
  });

  it("clones from the consent recording itself, then upgrades to a professional voice", async () => {
    expect((await consent()).verified).toBe(true);
    await createInstantClone(db, api, [audio("sample.webm")]);
    expect(activeVoice(db)).toMatchObject({ kind: "instant", voice_id: "ivc-1" });
    await expect(createInstantClone(db, api, [])).rejects.toThrow(/already/);

    await startProfessionalClone(db, api);
    await verifyProfessional(db, api, audio("captcha.webm"));
    expect(requests.map((r) => `${r.method} ${r.url.replace("https://el.test", "")}`)).toEqual(
      expect.arrayContaining(["POST /v1/voices/pvc/pvc-1/captcha", "POST /v1/voices/pvc/pvc-1/train"]),
    );
    expect(await refreshProfessional(db, api)).toBe("ready");
    expect(activeVoice(db)).toMatchObject({ kind: "professional", voice_id: "pvc-1" });
    // Only one voice remains: the instant clone was deleted at ElevenLabs.
    expect(requests).toContainEqual({ method: "DELETE", url: "https://el.test/v1/voices/ivc-1" });
    expect(voiceSnapshot(db).voices).toHaveLength(1);
  });

  it("revoking deletes the voice at ElevenLabs and every recording", async () => {
    await consent();
    await createInstantClone(db, api, [audio("sample.webm")]);
    expect(fs.readdirSync(process.env.TWIN_DATA_DIR!)).toHaveLength(2);
    await revokeVoice(db, api);
    expect(requests).toContainEqual({ method: "DELETE", url: "https://el.test/v1/voices/ivc-1" });
    expect(fs.readdirSync(process.env.TWIN_DATA_DIR!)).toHaveLength(0);
    expect(voiceSnapshot(db)).toMatchObject({ voices: [], active: null, consent: { status: "revoked" } });
  });

  it("rejects files that aren't audio", async () => {
    const { id } = startConsent(db);
    await expect(verifyConsent(db, api, id, { data: new Uint8Array([1]), filename: "x.txt", type: "text/plain" })).rejects.toThrow(/audio/);
  });
});
