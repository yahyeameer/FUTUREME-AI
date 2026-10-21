import type { Db } from "./db";
import { seal, unseal } from "./secret-box";
import { getTwinSetting, setTwinSetting } from "./twin";
import type { AudioInput } from "./voice";

// Voice engines: who clones and speaks the twin's voice. The user adds a key for each in the app (or the server sets it
// in the environment, which wins). Keys are encrypted in twin_settings and never sent back to the browser.
//   elevenlabs  clones your voice and runs the phone and browser calls. Calls only work with this engine.
//   openrouter  one key for many speech models. Some (Fish Audio, Seed Audio) clone from your consented recordings on
//               every request, so nothing is enrolled anywhere; the others speak with preset voices.
//   qwen        Qwen3 TTS on Alibaba Cloud Model Studio. Your consent recording is enrolled as a Qwen voice.
//   openai      any server with an OpenAI-style /audio/speech endpoint: an open model you host on Nebius, vLLM or your
//               own machine (Qwen3-TTS, Kokoro, Orpheus...). Preset voices only.

export const ENGINE_IDS = ["elevenlabs", "openrouter", "qwen", "openai"] as const;
export type EngineId = (typeof ENGINE_IDS)[number];

export interface EngineInfo {
  label: string;
  blurb: string;
  /** Can clone the user's voice. */
  clones: boolean;
  /** Can run the twin's phone and browser calls. */
  calls: boolean;
  /** Can check the consent phrase (speech to text). */
  transcribes: boolean;
  keyRequired: boolean;
  keyUrl: string | null;
  env: string | null;
  fields: ("model" | "voice" | "baseUrl")[];
  defaults: { model: string; voice: string; baseUrl: string };
  hints: { model?: string; voice?: string; baseUrl?: string };
}

const QWEN_BASE = "https://dashscope-intl.aliyuncs.com/api/v1";
/** The Qwen model a cloned voice is made for. A voice works only with the model it was enrolled for. */
export const QWEN_CLONE_MODEL = "qwen3-tts-vc-2026-01-22";

export const ENGINES: Record<EngineId, EngineInfo> = {
  elevenlabs: {
    label: "ElevenLabs",
    blurb: "Clones your voice and runs your twin's phone and browser calls.",
    clones: true,
    calls: true,
    transcribes: true,
    keyRequired: true,
    keyUrl: "https://elevenlabs.io/app/settings/api-keys",
    env: "ELEVENLABS_API_KEY",
    fields: [],
    defaults: { model: "", voice: "", baseUrl: "" },
    hints: {},
  },
  openrouter: {
    label: "OpenRouter",
    blurb: "One key for many speech models. Fish Audio and Seed Audio clone from your recordings; others have preset voices.",
    clones: true,
    calls: false,
    transcribes: true,
    keyRequired: true,
    keyUrl: "https://openrouter.ai/settings/keys",
    env: "OPENROUTER_API_KEY",
    fields: ["model", "voice"],
    defaults: { model: "fish-audio/s2.1-pro", voice: "", baseUrl: "" },
    hints: { model: "A speech model slug, such as fish-audio/s2.1-pro or mistralai/voxtral-mini-tts-2603.", voice: "A preset voice for the test. Leave it empty to use your own voice." },
  },
  qwen: {
    label: "Qwen TTS",
    blurb: "Qwen3 TTS on Alibaba Cloud Model Studio. Clones your voice from your consent recording.",
    clones: true,
    calls: false,
    transcribes: false,
    keyRequired: true,
    keyUrl: "https://modelstudio.console.alibabacloud.com/?tab=playground#/api-key",
    env: "DASHSCOPE_API_KEY",
    fields: ["model", "voice", "baseUrl"],
    defaults: { model: "qwen3-tts-flash", voice: "Cherry", baseUrl: QWEN_BASE },
    hints: { model: "For preset voices. Your cloned voice uses qwen3-tts-vc.", voice: "A preset voice, such as Cherry, Ethan or Serena.", baseUrl: "Change it for the Beijing region." },
  },
  openai: {
    label: "Self-hosted",
    blurb: "An open model you run, on Nebius, vLLM or your own machine, behind an OpenAI-style /audio/speech endpoint.",
    clones: false,
    calls: false,
    transcribes: false,
    keyRequired: false,
    keyUrl: null,
    env: null,
    fields: ["baseUrl", "model", "voice"],
    defaults: { model: "", voice: "", baseUrl: "" },
    hints: { baseUrl: "Up to /v1, such as https://your-endpoint.nebius.cloud/v1.", model: "The model name your server expects.", voice: "A voice your model has." },
  },
};

export const isEngine = (s: unknown): s is EngineId => typeof s === "string" && (ENGINE_IDS as readonly string[]).includes(s);

// ---------- Stored configuration ----------

export interface EngineConfig {
  key: string | null;
  keySource: "env" | "app" | null;
  /** The last four characters, for "saved key ending in…". */
  keyHint: string | null;
  /** A key is saved but can't be decrypted, because the server's secret changed. */
  keyLost: boolean;
  model: string;
  voice: string;
  baseUrl: string;
}

const KEY = (id: EngineId) => `engine_key:${id}`;
const CFG = (id: EngineId) => `engine_cfg:${id}`;
/** Twin settings that hold provider keys and engine choices. They're kept when the twin's data is deleted. */
export const isEngineSetting = (key: string) => key === "voice_engine" || key.startsWith("engine_key:") || key.startsWith("engine_cfg:");

export function engineConfig(db: Db, id: EngineId): EngineConfig {
  const info = ENGINES[id];
  const cfg = JSON.parse(getTwinSetting(db, CFG(id)) ?? "{}") as Partial<Record<"model" | "voice" | "baseUrl", string>>;
  const envKey = info.env ? process.env[info.env]?.trim() : undefined;
  const sealed = getTwinSetting(db, KEY(id));
  const appKey = sealed ? unseal(sealed) : null;
  const key = envKey || appKey || null;
  return {
    key,
    keySource: envKey ? "env" : appKey ? "app" : null,
    keyHint: key ? key.slice(-4) : null,
    keyLost: !envKey && !!sealed && !appKey,
    model: cfg.model || info.defaults.model,
    voice: cfg.voice ?? info.defaults.voice,
    baseUrl: (cfg.baseUrl || info.defaults.baseUrl).replace(/\/+$/, ""),
  };
}

export interface EngineInput {
  engine: EngineId;
  key?: string;
  model?: string;
  voice?: string;
  baseUrl?: string;
}

const clean = (s: string | undefined, max: number) => (s ?? "").trim().slice(0, max);

function checkBaseUrl(url: string) {
  if (!url) return;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("The base URL isn't a web address.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("The base URL must start with https://.");
  if (u.username || u.password) throw new Error("Put the key in the key field, not in the URL.");
}

/** The settings to use for a test: what's typed in the form, falling back to what's saved. */
export function mergedConfig(db: Db, input: EngineInput): EngineConfig {
  const saved = engineConfig(db, input.engine);
  const key = clean(input.key, 500);
  const baseUrl = input.baseUrl === undefined ? saved.baseUrl : clean(input.baseUrl, 300).replace(/\/+$/, "") || ENGINES[input.engine].defaults.baseUrl;
  checkBaseUrl(baseUrl);
  return {
    ...saved,
    key: key || saved.key,
    model: input.model === undefined ? saved.model : clean(input.model, 120) || ENGINES[input.engine].defaults.model,
    voice: input.voice === undefined ? saved.voice : clean(input.voice, 120),
    baseUrl,
  };
}

/** Saves an engine's key (when one is typed) and its model, voice and base URL. */
export function saveEngine(db: Db, input: EngineInput) {
  const info = ENGINES[input.engine];
  const key = clean(input.key, 500);
  if (key && /\s/.test(key)) throw new Error("That key has spaces in it. Paste it again.");
  const baseUrl = clean(input.baseUrl, 300).replace(/\/+$/, "");
  checkBaseUrl(baseUrl);
  if (input.engine === "openai" && !baseUrl) throw new Error("Add your server's base URL.");
  if (key) setTwinSetting(db, KEY(input.engine), seal(key));
  const cfg: Record<string, string> = {};
  if (info.fields.includes("model")) cfg.model = clean(input.model, 120);
  if (info.fields.includes("voice")) cfg.voice = clean(input.voice, 120);
  if (info.fields.includes("baseUrl")) cfg.baseUrl = baseUrl;
  setTwinSetting(db, CFG(input.engine), JSON.stringify(cfg));
}

export function forgetEngineKey(db: Db, id: EngineId) {
  setTwinSetting(db, KEY(id), null);
}

/** The engine that clones and speaks the twin's voice. Defaults to ElevenLabs. */
export function chosenEngine(db: Db): EngineId {
  const id = getTwinSetting(db, "voice_engine");
  return isEngine(id) ? id : "elevenlabs";
}

export function engineReady(db: Db, id: EngineId): boolean {
  const c = engineConfig(db, id);
  return id === "openai" ? !!c.baseUrl && !!c.model : !!c.key;
}

export function chooseEngine(db: Db, id: EngineId, voiceEngine: EngineId | null) {
  if (voiceEngine && voiceEngine !== id) throw new Error(`Your voice is cloned with ${ENGINES[voiceEngine].label}. Delete your voice first to clone it with ${ENGINES[id].label}.`);
  if (!engineReady(db, id)) throw new Error(id === "openai" ? "Save your server's base URL and model first." : `Save a ${ENGINES[id].label} key first.`);
  setTwinSetting(db, "voice_engine", id);
}

export function enginesSnapshot(db: Db) {
  return {
    chosen: chosenEngine(db),
    engines: ENGINE_IDS.map((id) => {
      const { key: _key, ...c } = engineConfig(db, id);
      void _key;
      const info = ENGINES[id];
      return { id, ...info, ...c, ready: engineReady(db, id) };
    }),
  };
}

// ---------- Clients ----------

export class EngineError extends Error {}

async function failure(res: Response, who: string): Promise<never> {
  let detail = (await res.text().catch(() => "")).slice(0, 400);
  try {
    const j = JSON.parse(detail) as { error?: { message?: string } | string; message?: string };
    detail = (typeof j.error === "string" ? j.error : j.error?.message) ?? j.message ?? detail;
  } catch {
    // Not JSON; keep the text.
  }
  if (res.status === 401 || res.status === 403) throw new EngineError(`${who} didn't accept that key (${res.status}). ${detail}`.trim());
  throw new EngineError(`${who} answered ${res.status}: ${detail || res.statusText}`);
}

export interface Speech {
  audio: ArrayBuffer;
  type: string;
}

export const dataUri = (a: AudioInput) => `data:${a.type.split(";")[0] || "audio/wav"};base64,${Buffer.from(a.data).toString("base64")}`;

const FORMATS: Record<string, string> = { "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/webm": "webm" };

/** OpenRouter's speech and transcription endpoints. */
export class OpenRouterVoice {
  constructor(
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly base = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  ) {}

  private headers = () => ({ Authorization: `Bearer ${this.key}`, "Content-Type": "application/json", "X-Title": "FutureMe" });

  /** Speaks with a preset voice, or clones from reference clips (with their transcript) when given. */
  async speak(text: string, opts: { model: string; voice?: string; references?: { audio: AudioInput; transcript?: string }[] }): Promise<Speech> {
    const body: Record<string, unknown> = { model: opts.model, input: text, response_format: "mp3" };
    if (opts.references?.length) {
      body.input_references = opts.references.flatMap((r) => [
        { type: "input_audio", input_audio: { data: dataUri(r.audio) } },
        ...(r.transcript ? [{ type: "text", text: r.transcript }] : []),
      ]);
    } else if (opts.voice) body.voice = opts.voice;
    const res = await this.fetchImpl(`${this.base}/audio/speech`, { method: "POST", headers: this.headers(), body: JSON.stringify(body) });
    if (!res.ok) await failure(res, "OpenRouter");
    return { audio: await res.arrayBuffer(), type: res.headers.get("content-type")?.split(";")[0] || "audio/mpeg" };
  }

  async transcribe(audio: AudioInput, model = "openai/whisper-large-v3"): Promise<string> {
    const format = FORMATS[audio.type.split(";")[0]] ?? "webm";
    const res = await this.fetchImpl(`${this.base}/audio/transcriptions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model, input_audio: { data: Buffer.from(audio.data).toString("base64"), format } }),
    });
    if (!res.ok) await failure(res, "OpenRouter");
    return ((await res.json()) as { text?: string }).text ?? "";
  }
}

/** Qwen3 TTS on Alibaba Cloud Model Studio (DashScope): speech, and enrolling a cloned voice. */
export class QwenVoice {
  constructor(
    private readonly key: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly base = QWEN_BASE,
  ) {}

  private async call(pathname: string, body: unknown) {
    const res = await this.fetchImpl(`${this.base}${pathname}`, { method: "POST", headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) await failure(res, "Qwen");
    return res.json() as Promise<{ output?: { audio?: { url?: string; data?: string }; voice?: string } }>;
  }

  /** The answer holds a link to the audio, valid for a day; it's fetched right away. */
  async speak(text: string, opts: { model: string; voice: string }): Promise<Speech> {
    const out = await this.call("/services/aigc/multimodal-generation/generation", { model: opts.model, input: { text, voice: opts.voice } });
    const audio = out.output?.audio;
    if (audio?.data) return { audio: new Uint8Array(Buffer.from(audio.data, "base64")).buffer, type: "audio/wav" };
    if (!audio?.url) throw new EngineError("Qwen didn't return any audio.");
    const res = await this.fetchImpl(audio.url);
    if (!res.ok) throw new EngineError(`Couldn't download Qwen's audio (${res.status}).`);
    return { audio: await res.arrayBuffer(), type: res.headers.get("content-type")?.split(";")[0] || "audio/wav" };
  }

  async enroll(audio: AudioInput, name: string): Promise<string> {
    const out = await this.call("/services/audio/tts/customization", {
      model: "qwen-voice-enrollment",
      input: { action: "create", target_model: QWEN_CLONE_MODEL, preferred_name: name, audio: { data: dataUri(audio) } },
    });
    if (!out.output?.voice) throw new EngineError("Qwen didn't return a voice.");
    return out.output.voice;
  }

  async deleteVoice(voice: string): Promise<void> {
    try {
      await this.call("/services/audio/tts/customization", { model: "qwen-voice-enrollment", input: { action: "delete", voice } });
    } catch (err) {
      // Already gone is fine.
      if (!(err instanceof EngineError && / 404:/.test(err.message))) throw err;
    }
  }
}

/** Any OpenAI-style speech endpoint (POST {base}/audio/speech). */
export class OpenAISpeech {
  constructor(
    private readonly base: string,
    private readonly key: string | null,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async speak(text: string, opts: { model: string; voice?: string }): Promise<Speech> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.key) headers.Authorization = `Bearer ${this.key}`;
    const body: Record<string, unknown> = { model: opts.model, input: text, response_format: "mp3" };
    if (opts.voice) body.voice = opts.voice;
    const res = await this.fetchImpl(`${this.base}/audio/speech`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) await failure(res, "Your server");
    const type = res.headers.get("content-type")?.split(";")[0] || "audio/mpeg";
    if (!type.startsWith("audio/")) throw new EngineError(`Your server answered with ${type}, not audio. Check the base URL ends in /v1.`);
    return { audio: await res.arrayBuffer(), type };
  }
}
