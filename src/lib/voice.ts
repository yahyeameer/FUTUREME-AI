import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "./db";
import { getTwinSetting, ownerName, setTwinSetting } from "./twin";

// The voice twin's voice (Phase 1). Only the signed-in user's own voice is cloned:
//   1. They read a consent phrase with three random code words aloud, live. ElevenLabs speech-to-text must hear all
//      three, so a pre-recorded clip of someone else can't pass.
//   2. That same recording is the first sample of the clone, so the voice that consented is the voice that is cloned.
//   3. An instant clone comes first. The professional clone adds ElevenLabs' own voice CAPTCHA before training.
//   4. Revoking deletes every voice and the call agent at ElevenLabs, and every recording here.

export interface AudioInput {
  data: Uint8Array;
  filename: string;
  type: string;
}

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_SAMPLES = 5;
/** A consent phrase has to be read within this many minutes of being shown. */
const CONSENT_TTL_MINUTES = 10;
const TTS_MODEL = "eleven_multilingual_v2";

export class ElevenLabsError extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`ElevenLabs answered ${status}: ${detail}`);
  }
}

/** A thin ElevenLabs REST client. `fetchImpl` is swapped out in tests. */
export class ElevenLabs {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly base = process.env.ELEVENLABS_BASE_URL ?? "https://api.elevenlabs.io",
  ) {}

  private async call(pathname: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetchImpl(`${this.base}${pathname}`, { ...init, headers: { "xi-api-key": this.apiKey, ...(init.headers ?? {}) } });
    if (!res.ok) throw new ElevenLabsError(res.status, (await res.text().catch(() => "")).slice(0, 300) || res.statusText);
    return res;
  }

  private json = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  async transcribe(audio: AudioInput): Promise<string> {
    const form = new FormData();
    form.append("model_id", process.env.ELEVENLABS_STT_MODEL ?? "scribe_v2");
    form.append("file", toBlob(audio), audio.filename);
    const out = (await (await this.call("/v1/speech-to-text", { method: "POST", body: form })).json()) as { text?: string };
    return out.text ?? "";
  }

  async createInstantVoice(name: string, files: AudioInput[]): Promise<string> {
    const form = new FormData();
    form.append("name", name);
    form.append("remove_background_noise", "true");
    form.append("description", "The account holder's own voice, cloned with their recorded consent in FutureMe.");
    for (const f of files) form.append("files", toBlob(f), f.filename);
    return ((await (await this.call("/v1/voices/add", { method: "POST", body: form })).json()) as { voice_id: string }).voice_id;
  }

  async createProfessionalVoice(name: string, language: string): Promise<string> {
    return ((await (await this.call("/v1/voices/pvc", this.json({ name, language }))).json()) as { voice_id: string }).voice_id;
  }

  async addProfessionalSamples(voiceId: string, files: AudioInput[]): Promise<void> {
    const form = new FormData();
    for (const f of files) form.append("files", toBlob(f), f.filename);
    await this.call(`/v1/voices/pvc/${encodeURIComponent(voiceId)}/samples`, { method: "POST", body: form });
  }

  /** The CAPTCHA the voice owner reads aloud. Returned as an image data URL, or as text if that's what comes back. */
  async getCaptcha(voiceId: string): Promise<{ image?: string; text?: string }> {
    const res = await this.call(`/v1/voices/pvc/${encodeURIComponent(voiceId)}/captcha`);
    const type = res.headers.get("content-type") ?? "";
    if (type.startsWith("image/")) return { image: `data:${type.split(";")[0]};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}` };
    const body = await res.text();
    try {
      const json = JSON.parse(body) as unknown;
      // The response format isn't documented; accept a bare base64 string or the first long string field.
      const value = typeof json === "string" ? json : Object.values(json as Record<string, unknown>).find((v): v is string => typeof v === "string" && v.length > 0);
      if (value && /^[A-Za-z0-9+/=\s]{200,}$/.test(value)) return { image: `data:image/png;base64,${value.replace(/\s/g, "")}` };
      if (value?.startsWith("data:image/")) return { image: value };
      return { text: value ?? body };
    } catch {
      return { text: body };
    }
  }

  async verifyCaptcha(voiceId: string, recording: AudioInput): Promise<void> {
    const form = new FormData();
    form.append("recording", toBlob(recording), recording.filename);
    await this.call(`/v1/voices/pvc/${encodeURIComponent(voiceId)}/captcha`, { method: "POST", body: form });
  }

  async trainProfessional(voiceId: string): Promise<void> {
    await this.call(`/v1/voices/pvc/${encodeURIComponent(voiceId)}/train`, this.json({ model_id: TTS_MODEL }));
  }

  /** "ready", "failed" or "training", from the voice's fine-tuning state. */
  async trainingState(voiceId: string): Promise<"ready" | "failed" | "training"> {
    const voice = (await (await this.call(`/v1/voices/${encodeURIComponent(voiceId)}`)).json()) as { fine_tuning?: { state?: unknown } };
    const state = voice.fine_tuning?.state;
    const states = typeof state === "string" ? [state] : state && typeof state === "object" ? Object.values(state) : [];
    if (states.includes("fine_tuned")) return "ready";
    if (states.includes("failed")) return "failed";
    return "training";
  }

  async deleteVoice(voiceId: string): Promise<void> {
    try {
      await this.call(`/v1/voices/${encodeURIComponent(voiceId)}`, { method: "DELETE" });
    } catch (err) {
      if (!(err instanceof ElevenLabsError && err.status === 404)) throw err;
    }
  }

  async speak(voiceId: string, text: string): Promise<ArrayBuffer> {
    return (await this.call(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, this.json({ text, model_id: TTS_MODEL }))).arrayBuffer();
  }

  // ---------- Conversational agent (Phase 2) ----------

  async createAgent(config: unknown): Promise<string> {
    return ((await (await this.call("/v1/convai/agents/create", this.json(config))).json()) as { agent_id: string }).agent_id;
  }

  async updateAgent(agentId: string, config: unknown): Promise<void> {
    await this.call(`/v1/convai/agents/${encodeURIComponent(agentId)}`, { ...this.json(config), method: "PATCH" });
  }

  async deleteAgent(agentId: string): Promise<void> {
    try {
      await this.call(`/v1/convai/agents/${encodeURIComponent(agentId)}`, { method: "DELETE" });
    } catch (err) {
      if (!(err instanceof ElevenLabsError && err.status === 404)) throw err;
    }
  }

  /** A short-lived token the browser uses to join a WebRTC conversation with an agent that requires auth. */
  async conversationToken(agentId: string): Promise<string> {
    return ((await (await this.call(`/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`)).json()) as { token: string }).token;
  }

  /** Dials a phone number from the Twilio number imported into ElevenLabs. */
  async outboundCall(input: { agentId: string; phoneNumberId: string; to: string; dynamicVariables: Record<string, string> }): Promise<{ conversationId: string | null }> {
    const out = (await (
      await this.call(
        "/v1/convai/twilio/outbound-call",
        this.json({
          agent_id: input.agentId,
          agent_phone_number_id: input.phoneNumberId,
          to_number: input.to,
          conversation_initiation_client_data: { dynamic_variables: input.dynamicVariables },
        }),
      )
    ).json()) as { success?: boolean; message?: string; conversation_id?: string | null };
    if (out.success === false) throw new ElevenLabsError(200, out.message ?? "the call could not be placed");
    return { conversationId: out.conversation_id ?? null };
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    return (await (await this.call(`/v1/convai/conversations/${encodeURIComponent(conversationId)}`)).json()) as Conversation;
  }
}

export interface Conversation {
  status: "initiated" | "in-progress" | "processing" | "done" | "failed";
  transcript?: { role: "user" | "agent"; message: string | null; time_in_call_secs?: number }[];
  analysis?: { transcript_summary?: string | null } | null;
  metadata?: { call_duration_secs?: number; start_time_unix_secs?: number } | null;
}

function toBlob(a: AudioInput): Blob {
  return new Blob([new Uint8Array(a.data)], { type: a.type || "application/octet-stream" });
}

export function getVoiceApi(): ElevenLabs | null {
  const key = process.env.ELEVENLABS_API_KEY;
  return key ? new ElevenLabs(key) : null;
}

// ---------- Storage ----------

export function voiceDir(): string {
  const dbFile = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "futureme.db");
  // The folder is chosen at runtime, so keep Turbopack from tracing the whole project for it.
  return path.resolve(/* turbopackIgnore: true */ process.env.TWIN_DATA_DIR ?? path.join(path.dirname(path.resolve(/* turbopackIgnore: true */ dbFile)), "voice"));
}

const EXT: Record<string, string> = { "audio/webm": "webm", "audio/ogg": "ogg", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav" };

function checkAudio(a: AudioInput) {
  if (!a.data.byteLength) throw new Error("The recording is empty.");
  if (a.data.byteLength > MAX_AUDIO_BYTES) throw new Error("Each recording must be 10 MB or smaller.");
  if (!a.type.startsWith("audio/") && !a.type.startsWith("video/webm")) throw new Error("That file isn't audio.");
}

function saveAudio(a: AudioInput, stem: string): string {
  checkAudio(a);
  fs.mkdirSync(voiceDir(), { recursive: true });
  const file = path.join(voiceDir(), `${stem}-${crypto.randomUUID()}.${EXT[a.type.split(";")[0]] ?? "webm"}`);
  fs.writeFileSync(file, a.data);
  return file;
}

function loadAudio(file: string): AudioInput {
  const ext = path.extname(file).slice(1);
  const type = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "audio/webm";
  return { data: fs.readFileSync(file), filename: path.basename(file), type };
}

// ---------- Consent ----------

const CODE_WORDS = [
  "amber", "anchor", "bamboo", "canyon", "cedar", "comet", "coral", "desert", "ember", "falcon", "forest", "garden",
  "glacier", "harbor", "island", "jasmine", "lantern", "maple", "meadow", "mountain", "nectar", "ocean", "orchid",
  "pepper", "planet", "quartz", "river", "saffron", "silver", "summit", "thunder", "tiger", "valley", "velvet", "willow",
] as const;

interface ConsentRow {
  id: number;
  phrase: string;
  code: string;
  recording_path: string | null;
  transcript: string | null;
  status: "pending" | "verified" | "failed" | "expired" | "revoked";
  created_at: string;
  verified_at: string | null;
}

export function startConsent(db: Db): { id: number; phrase: string } {
  const words = new Set<string>();
  while (words.size < 3) words.add(CODE_WORDS[crypto.randomInt(CODE_WORDS.length)]);
  const code = [...words];
  const owner = ownerName(db);
  const who = owner === "the user" ? "" : ` My name is ${owner}.`;
  const phrase = `This is my own voice.${who} I agree to FutureMe making an AI twin of my voice, and I can delete it at any time. My code words are ${code.join(", ")}.`;
  db.prepare("UPDATE consents SET status = 'expired' WHERE status = 'pending'").run();
  const info = db.prepare("INSERT INTO consents (phrase, code) VALUES (?, ?)").run(phrase, code.join(" "));
  return { id: Number(info.lastInsertRowid), phrase };
}

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);

/** Transcribes the recording and checks the code words and "agree" were spoken. */
export async function verifyConsent(db: Db, api: ElevenLabs, consentId: number, audio: AudioInput) {
  const row = db.prepare("SELECT * FROM consents WHERE id = ?").get(consentId) as ConsentRow | undefined;
  if (!row || row.status !== "pending") throw new Error("Start a new consent recording.");
  const age = db.prepare("SELECT (julianday('now') - julianday(?)) * 1440 AS minutes").get(row.created_at) as { minutes: number };
  if (age.minutes > CONSENT_TTL_MINUTES) {
    db.prepare("UPDATE consents SET status = 'expired' WHERE id = ?").run(consentId);
    throw new Error("That phrase expired. Start again and read the new one.");
  }
  checkAudio(audio);
  const transcript = await api.transcribe(audio);
  const heard = new Set(words(transcript));
  const missing = [...row.code.split(" "), "agree"].filter((w) => !heard.has(w));
  const verified = missing.length === 0;
  const file = saveAudio(audio, `consent-${consentId}`);
  db.prepare("UPDATE consents SET recording_path = ?, transcript = ?, status = ?, verified_at = CASE WHEN ? THEN datetime('now') END WHERE id = ?").run(
    file,
    transcript,
    verified ? "verified" : "failed",
    verified ? 1 : 0,
    consentId,
  );
  return { verified, transcript, missing };
}

function verifiedConsent(db: Db): ConsentRow | undefined {
  return db.prepare("SELECT * FROM consents WHERE status = 'verified' AND revoked_at IS NULL ORDER BY id DESC LIMIT 1").get() as ConsentRow | undefined;
}

// ---------- Voices ----------

interface VoiceRow {
  id: number;
  voice_id: string;
  kind: "instant" | "professional";
  status: "ready" | "needs_captcha" | "training" | "failed";
  consent_id: number;
  samples: string;
  created_at: string;
  updated_at: string;
}

const voices = (db: Db) => db.prepare("SELECT * FROM voice_profiles ORDER BY id").all() as VoiceRow[];
const voiceOf = (db: Db, kind: VoiceRow["kind"]) => voices(db).find((v) => v.kind === kind);
const setStatus = (db: Db, id: number, status: VoiceRow["status"]) => db.prepare("UPDATE voice_profiles SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, id);

/** The voice the twin speaks with: the professional clone once trained, otherwise the instant clone. */
export function activeVoice(db: Db): VoiceRow | undefined {
  const pro = voiceOf(db, "professional");
  return pro?.status === "ready" ? pro : voiceOf(db, "instant");
}

/** Clones the voice from the consent recording plus up to five extra samples the user records. */
export async function createInstantClone(db: Db, api: ElevenLabs, samples: AudioInput[]) {
  const consent = verifiedConsent(db);
  if (!consent?.recording_path) throw new Error("Record your consent phrase first.");
  if (voices(db).length) throw new Error("You already have a voice. Delete it first to start over.");
  if (samples.length > MAX_SAMPLES) throw new Error(`Add at most ${MAX_SAMPLES} samples.`);
  samples.forEach(checkAudio);
  const files = [consent.recording_path, ...samples.map((s, i) => saveAudio(s, `sample-${i + 1}`))];
  const voiceId = await api.createInstantVoice(`${ownerName(db)} (FutureMe twin)`, files.map(loadAudio));
  db.prepare("INSERT INTO voice_profiles (voice_id, kind, status, consent_id, samples) VALUES (?, 'instant', 'ready', ?, ?)").run(voiceId, consent.id, JSON.stringify(files));
  return voiceId;
}

/** Starts a professional clone from the same recordings. ElevenLabs then asks the owner to read a CAPTCHA. */
export async function startProfessionalClone(db: Db, api: ElevenLabs, language = "en") {
  const instant = voiceOf(db, "instant");
  if (!instant) throw new Error("Create your instant voice first.");
  if (voiceOf(db, "professional")) throw new Error("A professional voice is already in progress.");
  const voiceId = await api.createProfessionalVoice(`${ownerName(db)} (FutureMe twin)`, language);
  const files = JSON.parse(instant.samples) as string[];
  try {
    await api.addProfessionalSamples(voiceId, files.map(loadAudio));
  } catch (err) {
    await api.deleteVoice(voiceId).catch(() => undefined);
    throw err;
  }
  db.prepare("INSERT INTO voice_profiles (voice_id, kind, status, consent_id, samples) VALUES (?, 'professional', 'needs_captcha', ?, ?)").run(voiceId, instant.consent_id, instant.samples);
  return voiceId;
}

export async function professionalCaptcha(db: Db, api: ElevenLabs) {
  const pro = voiceOf(db, "professional");
  if (pro?.status !== "needs_captcha") throw new Error("There's no professional voice waiting for verification.");
  return api.getCaptcha(pro.voice_id);
}

/** Sends the CAPTCHA reading to ElevenLabs; once it passes, training starts. */
export async function verifyProfessional(db: Db, api: ElevenLabs, recording: AudioInput) {
  const pro = voiceOf(db, "professional");
  if (pro?.status !== "needs_captcha") throw new Error("There's no professional voice waiting for verification.");
  checkAudio(recording);
  await api.verifyCaptcha(pro.voice_id, recording);
  await api.trainProfessional(pro.voice_id);
  setStatus(db, pro.id, "training");
}

/** Checks training. When the professional voice is ready, the instant clone is deleted so only one voice remains. */
export async function refreshProfessional(db: Db, api: ElevenLabs) {
  const pro = voiceOf(db, "professional");
  if (pro?.status !== "training") return pro?.status ?? null;
  const state = await api.trainingState(pro.voice_id);
  if (state === "training") return state;
  setStatus(db, pro.id, state);
  const instant = voiceOf(db, "instant");
  if (state === "ready" && instant) {
    await api.deleteVoice(instant.voice_id);
    db.prepare("DELETE FROM voice_profiles WHERE id = ?").run(instant.id);
  }
  return state;
}

/** Deletes every voice at ElevenLabs, every recording on disk, and marks the consent revoked. */
export async function revokeVoice(db: Db, api: ElevenLabs | null) {
  const rows = voices(db);
  const agentId = getTwinSetting(db, "agent_id");
  if ((rows.length || agentId) && !api) throw new Error("ELEVENLABS_API_KEY is needed to delete the voice at ElevenLabs.");
  // The phone and browser agent speaks with this voice, so it goes too.
  if (agentId) {
    await api!.deleteAgent(agentId);
    setTwinSetting(db, "agent_id", null);
    setTwinSetting(db, "agent_hash", null);
  }
  for (const v of rows) {
    await api!.deleteVoice(v.voice_id);
    db.prepare("DELETE FROM voice_profiles WHERE id = ?").run(v.id);
  }
  const files = (db.prepare("SELECT recording_path FROM consents WHERE recording_path IS NOT NULL").all() as { recording_path: string }[]).map((r) => r.recording_path);
  for (const v of rows) files.push(...(JSON.parse(v.samples) as string[]));
  for (const f of new Set(files)) fs.rmSync(f, { force: true });
  db.prepare(
    "UPDATE consents SET status = CASE WHEN status = 'verified' THEN 'revoked' ELSE status END, revoked_at = datetime('now'), recording_path = NULL WHERE revoked_at IS NULL",
  ).run();
}

export async function previewVoice(db: Db, api: ElevenLabs, text?: string): Promise<ArrayBuffer> {
  const voice = activeVoice(db);
  if (!voice || voice.status !== "ready") throw new Error("You don't have a voice yet.");
  const line = text?.trim() || "Hey, it's me. You, a few years from now. I still remember the day you decided to build this.";
  return api.speak(voice.voice_id, line.slice(0, 300));
}

// ---------- Snapshot for the Twin page ----------

export function voiceSnapshot(db: Db) {
  const consent = db.prepare("SELECT id, phrase, transcript, status, created_at, verified_at FROM consents ORDER BY id DESC LIMIT 1").get() as
    | Omit<ConsentRow, "code" | "recording_path">
    | undefined;
  const active = activeVoice(db);
  return {
    configured: !!process.env.ELEVENLABS_API_KEY,
    consent: consent ?? null,
    voices: voices(db).map((v) => ({ id: v.id, kind: v.kind, status: v.status, samples: (JSON.parse(v.samples) as string[]).length, createdAt: v.created_at })),
    active: active ? { kind: active.kind, status: active.status } : null,
  };
}
