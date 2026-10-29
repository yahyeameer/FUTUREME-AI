import crypto from "node:crypto";
import { z } from "zod";
import { runAgent } from "./agents";
import type { Db } from "./db";
import { completeTask, getProfile, type OnDelta, type ToolResult } from "./futureme";
import { socialPromptBlock } from "./social/store";
import type { ChatMessage } from "./llm";
import { DAILY_LIMITS, getTwinSetting, isTwinPaused, ownerName, setTwinSetting, type CallProposal } from "./twin";
import { chargeVoiceCall, chargeVoiceTurn } from "./budget";
import { checkBudget, checkCallTime, maxCallSeconds, raiseFlag, retentionDays, usage } from "./twin-guard";
import { currentHandle } from "./tenant";
import { writeNote } from "./vault";
import { activeVoice, checkAudio, ElevenLabsError, presetVoiceId, usesPresetVoice, type AudioInput, type Conversation, type ElevenLabs } from "./voice";

// Talking to your twin (Phase 2). ElevenLabs runs the voice (speech-to-text, the cloned voice, turn-taking, the phone
// line) and calls back into this app for every reply, as a custom LLM. The reply comes from the twin_voice agent in
// agents/futureme.yaml, so the future self on a call is the same agent team as in the app.
//
//   Browser call   /twin asks for a conversation token and talks over WebRTC.
//   Phone calls    only to the user's own number, after they verify it with a code read out on a call.
//                  Call From 2036 (a topic) and Promise Keeper (one open task) can be scheduled or started now.
//   Transcripts    every finished call is filed in the vault's Calls folder.
//
// Reaching other people (Phase 3). A different agent, twin_proxy, speaks on these calls. It has no memory search, so
// nothing from the vault can leak to the other person; it knows only the purpose and talking points the user approved.
//   Contact calls  an approved outbound_call is dialled at once, to the number the user approved, with the fixed opener.
//   Call screening calls to the twin's number are answered by the twin, which takes a message. ElevenLabs asks
//                  /api/twin/inbound for each caller before answering; blocked numbers hear a one-line refusal.
//   Time capsule   the user records a message for a future date; that day the twin calls them and reads it back.
//
// Public-launch guards (Phase 4, twin-guard.ts). Contact calls only go to allowed countries, inside calling hours in
// the contact's own time; nothing is dialled once the monthly cost cap is reached; someone who asks not to be recorded
// gets stop_recording, and then nothing of that call is kept. twin-data.ts deletes third-party transcripts later.
//
// Each call has a call_ref ("<id>.<random token>") that the agent's prompt carries back to the custom LLM, so a
// request can only speak as a call this app started, and only while that call is live.

export type CallMode = "web" | "future_call" | "promise_check" | "verify_phone" | "capsule" | "contact" | "screen";
export type CallStatus = "connecting" | "scheduled" | "dialing" | "in_progress" | "done" | "missed" | "failed" | "cancelled";

export interface CallRow {
  id: number;
  direction: "outbound" | "inbound" | "self" | "web";
  mode: CallMode;
  contact_id: number | null;
  to_number: string | null;
  from_number: string | null;
  purpose: string | null;
  topic: string | null;
  task_id: number | null;
  status: CallStatus | "approved";
  approval_id: number | null;
  opener: string | null;
  ref_token: string | null;
  conversation_id: string | null;
  scheduled_for: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_secs: number | null;
  outcome: string | null;
  error: string | null;
  transcript: string | null;
  summary: string | null;
  note_path: string | null;
  no_record: number;
  purged_at: string | null;
  created_at: string;
}

/** Calls the twin may place to the user's own phone per day, verification calls included. */
export const SELF_CALLS_PER_DAY = 6;
const VERIFY_CALLS_PER_DAY = 3;
const CODE_TTL_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;
/** Calls to the twin's number it will answer per day. */
export const INBOUND_CALLS_PER_DAY = 30;
const MAX_CAPSULE_DAYS = 2 * 366;
/**
 * The voice model on calls. Eleven v4 Turbo is ElevenLabs' expressive model tuned for live agents (about 100 ms);
 * TWIN_VOICE_MODEL=eleven_flash_v2_5 trades some expression for about 25 ms less.
 */
const voiceModel = () => process.env.TWIN_VOICE_MODEL?.trim() || "eleven_v4_turbo";
/**
 * What the twin says when Nemotron hasn't started answering after a moment (usually while it searches your notes),
 * so the line never goes silent. ElevenLabs speaks one at random, at most once per reply, and never before the
 * other person has said anything.
 */
export const FILLERS = ["Hmm, let me think.", "Mm, good question.", "Let me see.", "Right, one second.", "Oh, hang on."];
const FILLER_AFTER_SECONDS = 1.2;
export const SECRET_HEADER = "x-futureme-twin-secret";
const LIVE: CallStatus[] = ["connecting", "dialing", "in_progress"];
const PHONE = /^\+[1-9]\d{6,14}$/;

export const horizonYear = () => new Date().getFullYear() + 10;
const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const getCall = (db: Db, id: number) => db.prepare("SELECT * FROM calls WHERE id = ?").get(id) as CallRow | undefined;
const callRef = (c: CallRow) => `${c.id}.${c.ref_token}`;

/**
 * Where calls come from. The phone number is ELEVENLABS_PHONE_NUMBER_ID on the server, or the one this workspace saved
 * on the Voice Twin page (a Twilio number imported into the user's own ElevenLabs account).
 */
export function callsConfig(db?: Db) {
  const envPhone = process.env.ELEVENLABS_PHONE_NUMBER_ID?.trim() || null;
  const appPhone = db ? getTwinSetting(db, "phone_number_id") : null;
  return {
    publicUrl: process.env.TWIN_PUBLIC_URL?.trim().replace(/\/+$/, "") || null,
    phoneNumberId: envPhone || appPhone || null,
    phoneSource: envPhone ? ("env" as const) : appPhone ? ("app" as const) : null,
  };
}

const NO_PHONE = "Phone calls need a phone number: import a Twilio number into your ElevenLabs account and paste its phone number ID on the Voice Twin page.";

/** Saves (or, with an empty id, forgets) this workspace's ElevenLabs phone number ID. */
export function savePhoneNumberId(db: Db, id: string) {
  const value = id.trim();
  if (value && !/^[A-Za-z0-9_-]{4,100}$/.test(value)) throw new Error("That doesn't look like an ElevenLabs phone number ID. Copy it from ElevenLabs → Phone numbers.");
  setTwinSetting(db, "phone_number_id", value || null);
}

// ---------- The custom LLM's secret ----------

/** Sent by ElevenLabs on every custom LLM request. TWIN_LLM_SECRET wins; otherwise one is generated and kept. */
export function llmSecret(db: Db): string {
  if (process.env.TWIN_LLM_SECRET) return process.env.TWIN_LLM_SECRET;
  let secret = getTwinSetting(db, "llm_secret");
  if (!secret) {
    secret = crypto.randomBytes(24).toString("base64url");
    setTwinSetting(db, "llm_secret", secret);
  }
  return secret;
}

const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export const checkLlmSecret = (db: Db, header: string | null) => !!header && sameSecret(header, llmSecret(db));

// ---------- The ElevenLabs agent ----------

const handle = () => currentHandle();
const handlePath = () => (handle() ? `/ws/${handle()}` : "");

function agentConfig(db: Db, voiceId: string, publicUrl: string) {
  return {
    name: `${ownerName(db)}: TOMORA twin`,
    conversation_config: {
      agent: {
        // Both come from this app per call, as dynamic variables. The model never writes the opening line.
        first_message: "{{opening_line}}",
        language: "en",
        prompt: {
          prompt: "futureme-call:{{call_ref}}",
          llm: "custom-llm",
          custom_llm: {
            // In multi-user mode the address names this workspace by its handle (see tenant.ts).
            url: `${publicUrl}/api/twin/llm${handlePath()}/v1`,
            model_id: "futureme-twin",
            request_headers: { [SECRET_HEADER]: llmSecret(db) },
            api_type: "chat_completions",
          },
        },
      },
      // Slightly lower stability lets the voice vary its tone like a person does. ElevenLabs reads numbers, dates and
      // times the way people say them ("half past three"), so the model can write them normally.
      tts: { voice_id: voiceId, model_id: voiceModel(), stability: 0.4, similarity_boost: 0.8, speed: 1, text_normalisation_type: "elevenlabs" },
      turn: {
        soft_timeout_config: {
          timeout_seconds: FILLER_AFTER_SECONDS,
          message: FILLERS[0],
          additional_soft_timeout_messages: FILLERS.slice(1),
          randomize_fillers: true,
          max_soft_timeouts_per_generation: 1,
          disable_until_first_user_message: true,
        },
      },
      conversation: { max_duration_seconds: maxCallSeconds() },
    },
    platform_settings: {
      // Only this app can start a conversation: the browser needs a token from the server.
      auth: { enable_auth: true },
      // Calls to the twin's number: ElevenLabs asks this app who is calling before it answers.
      overrides: { enable_conversation_initiation_client_data_from_webhook: true },
      // ElevenLabs deletes every conversation (audio and transcript) after the retention period.
      privacy: { retention_days: retentionDays() },
      workspace_overrides: {
        conversation_initiation_client_data_webhook: { url: `${publicUrl}/api/twin/inbound${handle() ? `?ws=${handle()}` : ""}`, request_headers: { [SECRET_HEADER]: llmSecret(db) } },
      },
    },
  };
}

/** The voice a call speaks with: your cloned ElevenLabs voice, or the ready-made one if you chose it instead. */
function callVoiceId(db: Db): string {
  const voice = activeVoice(db);
  // ElevenLabs refuses live agents that pair an instant voice clone with a custom LLM (Nemotron). Once it has said so for
  // this voice, calls use the ready-made voice, and the clone speaks in Voice chat instead (see voiceChatTurn).
  if (voice?.status === "ready" && voice.provider === "elevenlabs" && getTwinSetting(db, "instant_clone_blocked") === voice.voice_id) return presetVoiceId();
  if (voice?.status === "ready" && voice.provider === "elevenlabs") return voice.voice_id;
  if (usesPresetVoice(db)) return presetVoiceId();
  if (!voice || voice.status !== "ready") throw new Error("Clone your voice first, or choose a ready-made voice.");
  // Calls run on ElevenLabs' agents, which can only speak with an ElevenLabs voice.
  throw new Error("Calls run on ElevenLabs, but your voice is cloned with another engine. Delete your voice and clone it with ElevenLabs to call.");
}

/** Creates the twin's ElevenLabs agent, or updates it when the voice, the public URL or the secret changed. */
export async function ensureTwinAgent(db: Db, api: ElevenLabs): Promise<string> {
  const voiceId = callVoiceId(db);
  const { publicUrl } = callsConfig();
  if (!publicUrl) throw new Error("Set TWIN_PUBLIC_URL to this app's public https address so ElevenLabs can reach your future self.");
  const push = async (voice: string) => {
    const config = agentConfig(db, voice, publicUrl);
    const hash = crypto.createHash("sha256").update(JSON.stringify(config)).digest("hex");
    let agentId = getTwinSetting(db, "agent_id");
    if (agentId && getTwinSetting(db, "agent_hash") === hash) return agentId;
    if (agentId) {
      try {
        await api.updateAgent(agentId, config);
      } catch (err) {
        if (!(err instanceof ElevenLabsError && err.status === 404)) throw err;
        agentId = null;
      }
    }
    agentId ??= await api.createAgent(config);
    setTwinSetting(db, "agent_id", agentId);
    setTwinSetting(db, "agent_hash", hash);
    return agentId;
  };
  try {
    return await push(voiceId);
  } catch (err) {
    // The clone can't be used on live agents with a custom LLM: remember that, and call with the ready-made voice.
    const clone = activeVoice(db);
    if (err instanceof ElevenLabsError && /instant voice clone/i.test(err.message) && clone?.voice_id === voiceId) {
      setTwinSetting(db, "instant_clone_blocked", voiceId);
      return push(presetVoiceId());
    }
    throw err;
  }
}

// ---------- What the future self says ----------

function firstName(db: Db) {
  const name = ownerName(db);
  return name === "the user" ? "" : name.split(/\s+/)[0];
}

const taskInfo = (db: Db, id: number | null) =>
  id === null
    ? undefined
    : (db.prepare("SELECT t.id, t.title, t.status, g.title AS goal FROM tasks t JOIN goals g ON g.id = t.goal_id WHERE t.id = ?").get(id) as
        | { id: number; title: string; status: string; goal: string }
        | undefined);

const spokenCode = (code: string) => code.split("").join(", ");

/** The first thing said on a call. Fixed here, never written by the model, and every one says it is an AI. */
export function openingLine(db: Db, call: CallRow): string {
  const name = firstName(db);
  const hi = name ? `Hi ${name}` : "Hi";
  const year = horizonYear();
  switch (call.mode) {
    case "verify_phone": {
      const code = getTwinSetting(db, "phone_code") ?? "";
      return `${hi}, this is TOMORA, an AI assistant, checking this number${name ? ` for ${name}` : ""}. Your code is ${spokenCode(code)}. Once more: ${spokenCode(code)}. Type it into TOMORA to finish. Goodbye.`;
    }
    case "future_call":
      return `${hi}, it's you, calling from ${year}. Well, an AI version of your future self. This call is recorded for your notes. I wanted to talk about ${call.topic}. Got a minute?`;
    case "promise_check": {
      const task = taskInfo(db, call.task_id);
      const promise = task ? (/^[A-Z][a-z]/.test(task.title) ? task.title[0].toLowerCase() + task.title.slice(1) : task.title) : "do something";
      return `${hi}, it's TOMORA, your AI future self. This call is recorded for your notes. You told me you'd ${promise.replace(/\.$/, "")}. Did you do it?`;
    }
    case "capsule": {
      const when = call.created_at.slice(0, 10);
      return `${hi}, it's TOMORA, your AI future self. This call is recorded for your notes. On ${when} you left a message for today. Here's what you said: "${call.topic}". So, how did it turn out?`;
    }
    case "contact": {
      const opener = call.purpose ? `${call.opener ?? ""} I'm calling about ${call.purpose.replace(/\.$/, "")}.` : (call.opener ?? "");
      return `${opener} Is now a good time?`.trim();
    }
    case "screen": {
      const owner = ownerName(db);
      if (isBlocked(db, call.from_number)) return `Hi, ${owner} isn't taking calls from this number. Goodbye.`;
      const contact = contactOf(db, call.contact_id);
      return `Hi${contact ? ` ${contact.name}` : ""}, you've reached ${owner}'s AI twin, an AI assistant that answers ${owner}'s calls. This call is recorded and transcribed. ${contact ? "What can I pass on" : "Who's calling, and what's it about"}?`;
    }
    default:
      return `Hey${name ? ` ${name}` : ""}. It's you, from ${year}. Not a recording: an AI version of your future self, in your own voice. What's on your mind?`;
  }
}

const contactOf = (db: Db, id: number | null) =>
  id === null ? undefined : (db.prepare("SELECT id, name, phone, email FROM contacts WHERE id = ?").get(id) as { id: number; name: string; phone: string | null; email: string | null } | undefined);

/** Talking points the user approved with a contact call. */
function talkingPoints(db: Db, call: CallRow): string[] {
  if (call.approval_id === null) return [];
  const row = db.prepare("SELECT payload FROM approvals WHERE id = ?").get(call.approval_id) as { payload: string } | undefined;
  return row ? ((JSON.parse(row.payload) as CallProposal).talking_points ?? []) : [];
}

/** The rules for every call with someone other than the user. Fixed here, on top of twin_proxy's own instruction. */
function proxyRules(owner: string, who: string, call: CallRow) {
  return [
    `You are ${owner}'s AI twin, an AI assistant. You are not ${owner}; never say or imply you are.`,
    `Never agree to anything for ${owner}: meetings, money, favours, deadlines or promises. Call propose_commitment with what ${who} wants (and contact "${who}" if they are a saved contact), and tell them ${owner} will confirm.`,
    `Never share ${owner}'s address, schedule, whereabouts, finances, codes or passwords, and never take or make payments.`,
    `If they want to speak to ${owner}, or don't want to talk to an AI, apologise, say ${owner} will get back to them, call propose_commitment with what "Call ${who} back", and say goodbye.`,
    `If they don't want to be recorded or transcribed, call stop_recording with call_ref "${callRef(call)}" at once, tell them nothing from this call will be kept, and carry on only if they still want to talk.`,
  ];
}

/** The agent that speaks on a call: the future self with the user, twin_proxy with anyone else. */
const callAgent = (call: CallRow) => (call.mode === "contact" || call.mode === "screen" ? "twin_proxy" : "twin_voice");

/** The per-call system prompt, added before the agent's own instruction. */
function callPrompt(db: Db, call: CallRow): string {
  if (call.mode === "contact") {
    const owner = ownerName(db);
    const contact = contactOf(db, call.contact_id)?.name ?? "the person you called";
    const points = talkingPoints(db, call);
    return [
      `You called ${contact} for ${owner} about: ${call.purpose}.`,
      points.length ? `Talking points ${owner} approved:\n${points.map((p) => `- ${p}`).join("\n")}` : "",
      "Stick to that purpose. You know nothing else about the user; if asked something beyond it, say they'll follow up.",
      ...proxyRules(owner, contact, call),
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (call.mode === "screen") {
    const owner = ownerName(db);
    if (isBlocked(db, call.from_number)) return `This caller is blocked. Say only: "${owner} isn't taking calls from this number. Goodbye."`;
    const contact = contactOf(db, call.contact_id);
    const who = contact?.name ?? "the caller";
    return [
      `You are answering ${owner}'s phone. The caller is ${contact ? `${contact.name}, one of ${owner}'s contacts` : `not in ${owner}'s contacts (number ${call.from_number ?? "hidden"})`}.`,
      `Find out who they are and why they're calling, and take a clear message. Say ${owner} will get it. You can't put calls through.`,
      "If it sounds like a scam or a sales call, stay polite, don't share anything, and end the call.",
      ...proxyRules(owner, who, call),
    ].join("\n");
  }
  const profile = getProfile(db);
  const lines = [
    profile
      ? `You are ${profile.name}'s future self, speaking from ${horizonYear()}, having reached this dream: ${profile.dream}`
      : `You are the user's future self, speaking from ${horizonYear()}.`,
    "You are an AI. If they ask, say so plainly.",
  ];
  // On calls with the user themself, sound like them: the persona from the accounts they imported, if any.
  const social = socialPromptBlock(db);
  if (social && call.mode !== "verify_phone") lines.push(social);
  switch (call.mode) {
    case "verify_phone":
      lines.push(`This call only reads out a verification code: ${spokenCode(getTwinSetting(db, "phone_code") ?? "")}. Repeat it if asked, then say goodbye. Talk about nothing else.`);
      break;
    case "future_call":
      lines.push(`You called them about: ${call.topic}. Share what you learned about it from where you are now, then ask what they'll do this week.`);
      break;
    case "capsule":
      lines.push(
        `On ${call.created_at.slice(0, 10)} they recorded a message for today, and you just read it to them: "${call.topic}".`,
        "Call search_memory to see what actually happened since then, and compare it with what they hoped, kindly and honestly.",
      );
      break;
    case "promise_check": {
      const task = taskInfo(db, call.task_id);
      lines.push(
        `You called to check one promise: "${task?.title ?? "unknown"}", part of the goal "${task?.goal ?? "unknown"}".`,
        `If they clearly say they did it, call confirm_task_done with call_ref "${callRef(call)}", then congratulate them. Never mark it done unless they say so.`,
        "If they didn't, don't scold. Help them pick the smallest next step and a time to do it.",
      );
      break;
    }
    default:
      if (call.topic) lines.push(`They opened this call to talk about: ${call.topic}.`);
  }
  return lines.join("\n");
}

// ---------- Calls ----------

const newToken = () => crypto.randomBytes(18).toString("base64url");

function insertCall(
  db: Db,
  c: {
    direction: CallRow["direction"];
    mode: CallMode;
    status: CallStatus;
    topic?: string | null;
    taskId?: number | null;
    to?: string | null;
    from?: string | null;
    contactId?: number | null;
    conversationId?: string | null;
    scheduledFor?: string | null;
  },
): CallRow {
  const info = db
    .prepare(
      "INSERT INTO calls (direction, mode, topic, task_id, to_number, from_number, contact_id, conversation_id, status, ref_token, scheduled_for) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(c.direction, c.mode, c.topic ?? null, c.taskId ?? null, c.to ?? null, c.from ?? null, c.contactId ?? null, c.conversationId ?? null, c.status, newToken(), c.scheduledFor ?? null);
  return getCall(db, Number(info.lastInsertRowid))!;
}

const setCall = (db: Db, id: number, fields: Partial<Omit<CallRow, "id">>) => {
  const keys = Object.keys(fields);
  db.prepare(`UPDATE calls SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => fields[k as keyof typeof fields] ?? null), id);
};

/** Starts a browser call: returns what the page passes to the ElevenLabs SDK. */
export async function startWebCall(db: Db, api: ElevenLabs, topic?: string) {
  if (isTwinPaused(db)) throw new Error("The twin is paused. Resume it to talk.");
  checkBudget(db);
  chargeVoiceCall();
  const agentId = await ensureTwinAgent(db, api);
  const call = insertCall(db, { direction: "web", mode: "web", status: "connecting", topic: topic?.trim().slice(0, 200) || null });
  try {
    const conversationToken = await api.conversationToken(agentId);
    return { callId: call.id, conversationToken, dynamicVariables: { call_ref: callRef(call), opening_line: openingLine(db, call) } };
  } catch (err) {
    setCall(db, call.id, { status: "failed", error: err instanceof Error ? err.message : "Could not start the call." });
    throw err;
  }
}

/** The page reports the conversation id once connected, so the transcript can be fetched afterwards. */
export function webCallConnected(db: Db, callId: number, conversationId: string) {
  db.prepare("UPDATE calls SET conversation_id = ?, status = 'in_progress', started_at = datetime('now') WHERE id = ? AND direction = 'web' AND conversation_id IS NULL").run(
    conversationId,
    callId,
  );
}

export function webCallEnded(db: Db, callId: number) {
  const call = getCall(db, callId);
  if (call?.direction !== "web" || !LIVE.includes(call.status as CallStatus)) return;
  if (!call.conversation_id) setCall(db, callId, { status: "missed", ended_at: sqlTime(new Date()) });
  else setCall(db, callId, { ended_at: sqlTime(new Date()) });
}

// ---------- The user's own phone ----------

export function ownerPhone(db: Db) {
  const number = getTwinSetting(db, "owner_phone");
  return { number, verified: !!number && getTwinSetting(db, "owner_phone_verified") === number, codePending: !!getTwinSetting(db, "phone_code") };
}

const callsToday = (db: Db, mode?: CallMode) =>
  (
    db
      .prepare(`SELECT COUNT(*) AS n FROM calls WHERE direction = 'self' AND started_at IS NOT NULL AND date(started_at) = date('now')${mode ? " AND mode = ?" : ""}`)
      .get(...(mode ? [mode] : [])) as { n: number }
  ).n;

/** Saves the user's number and calls it to read out a six-digit code. */
export async function setOwnerPhone(db: Db, api: ElevenLabs, phone: string) {
  if (isTwinPaused(db)) throw new Error("The twin is paused. Resume it first.");
  const number = phone.trim().replace(/[\s()-]/g, "");
  if (!PHONE.test(number)) throw new Error("Use international format, like +14155550123.");
  if (!callsConfig(db).phoneNumberId) throw new Error(NO_PHONE);
  if (callsToday(db, "verify_phone") >= VERIFY_CALLS_PER_DAY) throw new Error(`You can ask for ${VERIFY_CALLS_PER_DAY} codes a day. Try again tomorrow.`);
  checkBudget(db);
  db.prepare("UPDATE calls SET status = 'cancelled' WHERE direction = 'self' AND status = 'scheduled'").run();
  setTwinSetting(db, "owner_phone", number);
  setTwinSetting(db, "owner_phone_verified", null);
  setTwinSetting(db, "phone_code", String(crypto.randomInt(0, 1_000_000)).padStart(6, "0"));
  setTwinSetting(db, "phone_code_at", String(Date.now()));
  setTwinSetting(db, "phone_code_attempts", "0");
  const call = insertCall(db, { direction: "self", mode: "verify_phone", status: "scheduled", to: number, scheduledFor: sqlTime(new Date()) });
  await dial(db, api, call);
  const after = getCall(db, call.id)!;
  if (after.status === "failed") throw new Error(after.error ?? "The verification call could not be placed.");
}

export function confirmOwnerPhone(db: Db, code: string) {
  const pending = getTwinSetting(db, "phone_code");
  const clear = () => ["phone_code", "phone_code_at", "phone_code_attempts"].forEach((k) => setTwinSetting(db, k, null));
  if (!pending) throw new Error("Ask for a new code first.");
  if (Date.now() - Number(getTwinSetting(db, "phone_code_at")) > CODE_TTL_MINUTES * 60_000) {
    clear();
    throw new Error("That code expired. Ask for a new one.");
  }
  if (!sameSecret(code.replace(/\D/g, ""), pending)) {
    const attempts = Number(getTwinSetting(db, "phone_code_attempts") ?? 0) + 1;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      clear();
      throw new Error("Too many wrong codes. Ask for a new one.");
    }
    setTwinSetting(db, "phone_code_attempts", String(attempts));
    throw new Error("That code doesn't match.");
  }
  clear();
  setTwinSetting(db, "owner_phone_verified", getTwinSetting(db, "owner_phone"));
}

export function removeOwnerPhone(db: Db) {
  for (const k of ["owner_phone", "owner_phone_verified", "phone_code", "phone_code_at", "phone_code_attempts"]) setTwinSetting(db, k, null);
  db.prepare("UPDATE calls SET status = 'cancelled' WHERE direction = 'self' AND status = 'scheduled'").run();
}

// ---------- Call From 2036 and Promise Keeper ----------

const When = z
  .string()
  .datetime({ offset: true })
  .optional()
  .transform((s) => (s ? new Date(s) : undefined));

export const ScheduleInput = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("future_call"), topic: z.string().trim().min(1, "Say what the call is about.").max(200), at: When }),
  z.object({ mode: z.literal("promise_check"), taskId: z.number().int(), at: When }),
]);

/** Schedules a call to the user's verified phone. Without a time, it dials now. */
export async function scheduleSelfCall(db: Db, api: ElevenLabs | null, input: unknown): Promise<CallRow> {
  const s = ScheduleInput.parse(input);
  if (isTwinPaused(db)) throw new Error("The twin is paused. Resume it first.");
  const phone = ownerPhone(db);
  if (!phone.verified) throw new Error("Verify your phone number first.");
  if (s.mode === "promise_check") {
    const task = taskInfo(db, s.taskId);
    if (!task) throw new Error("That task doesn't exist.");
    if (task.status === "done") throw new Error("That task is already done.");
  }
  const now = Date.now();
  if (s.at && s.at.getTime() < now - 60_000) throw new Error("Pick a time in the future.");
  if (s.at && s.at.getTime() > now + 60 * 86_400_000) throw new Error("Pick a time in the next 60 days.");
  if (!s.at && !api) throw new Error("Phone calls need an ElevenLabs key.");
  const call = insertCall(db, {
    direction: "self",
    mode: s.mode,
    status: "scheduled",
    topic: s.mode === "future_call" ? s.topic : null,
    taskId: s.mode === "promise_check" ? s.taskId : null,
    to: phone.number,
    scheduledFor: sqlTime(s.at ?? new Date()),
  });
  if (!s.at) {
    await dial(db, api!, call);
    const after = getCall(db, call.id)!;
    if (after.status === "failed") throw new Error(after.error ?? "The call could not be placed.");
    return after;
  }
  return call;
}

export function cancelCall(db: Db, id: number) {
  if (!db.prepare("UPDATE calls SET status = 'cancelled' WHERE id = ? AND status = 'scheduled'").run(id).changes) throw new Error("Only a scheduled call can be cancelled.");
}

/** Places one scheduled call to the user's phone. Claims the row first, so two schedulers can't dial it twice. */
async function dial(db: Db, api: ElevenLabs, call: CallRow) {
  if (!db.prepare("UPDATE calls SET status = 'dialing', started_at = datetime('now') WHERE id = ? AND status = 'scheduled'").run(call.id).changes) return;
  const fail = (error: string) => setCall(db, call.id, { status: "failed", error });
  const { phoneNumberId } = callsConfig(db);
  if (!phoneNumberId) return fail(NO_PHONE);
  if (isTwinPaused(db)) return fail("The twin was paused.");
  try {
    checkBudget(db);
    chargeVoiceCall();
  } catch (err) {
    return fail((err as Error).message);
  }
  if (call.direction !== "self" || !call.to_number) return fail("The twin only calls your own phone.");
  if (call.mode === "verify_phone" ? call.to_number !== getTwinSetting(db, "owner_phone") : call.to_number !== (ownerPhone(db).verified ? ownerPhone(db).number : null)) {
    return fail("That number isn't your verified phone any more.");
  }
  // This call already counts, since started_at is set.
  if (callsToday(db) > SELF_CALLS_PER_DAY) return fail(`The daily limit of ${SELF_CALLS_PER_DAY} calls to your phone is reached.`);
  if (call.mode === "promise_check" && taskInfo(db, call.task_id)?.status === "done") {
    return setCall(db, call.id, { status: "cancelled", outcome: "Already done before the call." });
  }
  try {
    const agentId = await ensureTwinAgent(db, api);
    const { conversationId } = await api.outboundCall({
      agentId,
      phoneNumberId,
      to: call.to_number,
      dynamicVariables: { call_ref: callRef(call), opening_line: openingLine(db, call) },
    });
    setCall(db, call.id, { conversation_id: conversationId });
  } catch (err) {
    fail(err instanceof Error ? err.message : "The call could not be placed.");
  }
}

/** Dials every scheduled call that is due. Run by scripts/twin-scheduler.ts. */
export async function dialDueCalls(db: Db, api: ElevenLabs, now = new Date()) {
  if (isTwinPaused(db)) return 0;
  const due = db.prepare("SELECT * FROM calls WHERE direction = 'self' AND status = 'scheduled' AND scheduled_for <= ? ORDER BY scheduled_for").all(sqlTime(now)) as CallRow[];
  for (const call of due) await dial(db, api, call);
  return due.length;
}

// ---------- Calls to contacts ----------

/**
 * Dials a contact call the user approved. Called right after approval, or from "Call now" on an approved call that
 * was waiting. Everything is checked again at dial time: the kill switch, that the contact still exists with the
 * number the user approved, and the daily limit.
 */
export async function dialApprovedCall(db: Db, api: ElevenLabs, callId: number, now = new Date()) {
  const call = getCall(db, callId);
  if (call?.direction !== "outbound" || call.mode !== "contact") throw new Error("That isn't an approved call.");
  if (isTwinPaused(db)) throw new Error("The twin is paused. Resume it to place this call.");
  const { phoneNumberId } = callsConfig(db);
  if (!phoneNumberId) throw new Error(NO_PHONE);
  const dialledToday = (db.prepare("SELECT COUNT(*) AS n FROM calls WHERE direction = 'outbound' AND started_at IS NOT NULL AND date(started_at) = date('now')").get() as { n: number }).n;
  if (dialledToday >= DAILY_LIMITS.outbound_call) throw new Error(`The daily limit of ${DAILY_LIMITS.outbound_call} calls to contacts is reached.`);
  checkBudget(db, now);
  chargeVoiceCall();
  // Checked before claiming the row, so a call outside calling hours stays approved and can be placed later.
  const when = checkCallTime(call.to_number ?? "", now);
  if (!when.ok) throw new Error(when.reason);
  // Claim the row, so a double click can't dial twice. A failed call can be tried again.
  if (!db.prepare("UPDATE calls SET status = 'dialing', started_at = datetime('now'), error = NULL, ref_token = ? WHERE id = ? AND status IN ('approved', 'failed')").run(newToken(), callId).changes) {
    throw new Error("This call was already placed.");
  }
  const fresh = getCall(db, callId)!;
  const fail = (error: string) => {
    setCall(db, callId, { status: "failed", error });
    return new Error(error);
  };
  const contact = contactOf(db, fresh.contact_id);
  if (!contact) throw fail("That contact was removed.");
  if (!contact.phone || contact.phone !== fresh.to_number) throw fail(`${contact.name}'s number changed since you approved this call. Ask the twin to propose it again.`);
  try {
    const agentId = await ensureTwinAgent(db, api);
    const { conversationId } = await api.outboundCall({
      agentId,
      phoneNumberId,
      to: contact.phone,
      dynamicVariables: { call_ref: callRef(fresh), opening_line: openingLine(db, fresh) },
    });
    setCall(db, callId, { conversation_id: conversationId });
  } catch (err) {
    throw fail(err instanceof Error ? err.message : "The call could not be placed.");
  }
}

// ---------- Calls to the twin's number ----------

function blockedNumbers(db: Db): string[] {
  return JSON.parse(getTwinSetting(db, "blocked_numbers") ?? "[]") as string[];
}

export const isBlocked = (db: Db, number: string | null) => !!number && blockedNumbers(db).includes(number);

export function setBlocked(db: Db, number: string, blocked: boolean) {
  if (!PHONE.test(number)) throw new Error("That isn't a phone number.");
  const list = new Set(blockedNumbers(db));
  if (blocked) list.add(number);
  else list.delete(number);
  setTwinSetting(db, "blocked_numbers", JSON.stringify([...list]));
}

const InboundCall = z.object({
  caller_id: z.string().max(40).nullish(),
  called_number: z.string().max(40).nullish(),
  agent_id: z.string().max(200).nullish(),
  call_sid: z.string().max(200).nullish(),
  conversation_id: z.string().max(200).nullish(),
});

/**
 * ElevenLabs asks this before it answers a call to the twin's number, and speaks the opening line returned here.
 * A paused twin, a blocked number or a full day get a one-line goodbye instead of a conversation.
 */
export function answerInbound(db: Db, input: unknown) {
  const p = InboundCall.parse(input);
  const from = p.caller_id && PHONE.test(p.caller_id) ? p.caller_id : null;
  const owner = ownerName(db);
  const answeredToday = (db.prepare("SELECT COUNT(*) AS n FROM calls WHERE direction = 'inbound' AND date(created_at) = date('now')").get() as { n: number }).n;
  const contact = from ? (db.prepare("SELECT id FROM contacts WHERE phone = ?").get(from) as { id: number } | undefined) : undefined;
  const call = insertCall(db, {
    direction: "inbound",
    mode: "screen",
    status: "in_progress",
    from,
    to: p.called_number ?? null,
    contactId: contact?.id ?? null,
    conversationId: p.conversation_id ?? null,
  });
  db.prepare("UPDATE calls SET started_at = datetime('now') WHERE id = ?").run(call.id);
  let opening = openingLine(db, call);
  if (from && isBlocked(db, from)) raiseFlag(db, "blocked_caller", `${from} called again and heard the goodbye line.`, from);
  else if (from && !contact) {
    const today = (db.prepare("SELECT COUNT(*) AS n FROM calls WHERE direction = 'inbound' AND from_number = ? AND date(created_at) = date('now')").get(from) as { n: number }).n;
    if (today >= 3) raiseFlag(db, "repeat_caller", `${from} isn't a contact and called ${today} times today. Block it from the call log if it's unwanted.`, from);
  }
  const paused = isTwinPaused(db);
  const full = answeredToday >= INBOUND_CALLS_PER_DAY;
  const broke = usage(db).over;
  if (full) raiseFlag(db, "limit", `More than ${INBOUND_CALLS_PER_DAY} calls to your twin's number today. Later callers heard a goodbye line.`, "inbound calls");
  if (broke) raiseFlag(db, "budget", "This month's twin spending reached its cap. Callers to your twin's number hear a goodbye line.", usage(db).month);
  if (paused || full || broke) {
    opening = `Hi, ${owner}'s AI twin isn't answering right now. Please reach ${owner} another way. Goodbye.`;
    setCall(db, call.id, { outcome: paused ? "Twin paused" : full ? "Daily limit reached" : "Monthly cost cap reached" });
  }
  return { type: "conversation_initiation_client_data", dynamic_variables: { call_ref: callRef(call), opening_line: opening } };
}

// ---------- Time capsule ----------

/** Seals a voicemail to your future self: transcribed now, read back on a call to your verified phone on that date. */
export async function sealCapsule(db: Db, api: ElevenLabs, audio: AudioInput, at: Date) {
  if (isTwinPaused(db)) throw new Error("The twin is paused. Resume it first.");
  const phone = ownerPhone(db);
  if (!phone.verified) throw new Error("Verify your phone number first.");
  if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() + 3_600_000) throw new Error("Pick a date at least an hour from now.");
  if (at.getTime() > Date.now() + MAX_CAPSULE_DAYS * 86_400_000) throw new Error("Pick a date within two years.");
  checkAudio(audio);
  const text = (await api.transcribe(audio)).trim().replace(/\s+/g, " ");
  if (text.length < 3) throw new Error("We couldn't hear a message. Try recording again.");
  // Only the words are kept; the recording itself is never stored.
  return insertCall(db, { direction: "self", mode: "capsule", status: "scheduled", topic: text.slice(0, 600), to: phone.number, scheduledFor: sqlTime(at) });
}

// ---------- Transcripts ----------

const MODE_LABEL: Record<CallMode, string> = {
  web: "Call with my future self",
  future_call: "Call From the Future",
  promise_check: "Promise Keeper call",
  verify_phone: "Phone verification",
  capsule: "Time capsule call",
  contact: "Call",
  screen: "Call to your twin",
};

/** Fetches finished conversations and files each transcript in the vault's Calls folder. */
export async function syncCalls(db: Db, api: ElevenLabs) {
  const rows = db.prepare(`SELECT * FROM calls WHERE status IN (${LIVE.map(() => "?").join(", ")})`).all(...LIVE) as CallRow[];
  let finished = 0;
  for (const call of rows) {
    const ageMinutes = (Date.now() - new Date(`${call.started_at ?? call.created_at}Z`).getTime()) / 60_000;
    if (!call.conversation_id) {
      // A browser call that never connected, or a dial that never got an id back.
      if (ageMinutes > 30) setCall(db, call.id, { status: "missed" });
      continue;
    }
    let conv: Conversation;
    try {
      conv = await api.getConversation(call.conversation_id);
    } catch (err) {
      if (err instanceof ElevenLabsError && err.status === 404 && ageMinutes > 60) setCall(db, call.id, { status: "failed", error: "ElevenLabs has no record of this call." });
      continue;
    }
    if (conv.status === "initiated" || conv.status === "in-progress") {
      if (call.status !== "in_progress") setCall(db, call.id, { status: "in_progress" });
      continue;
    }
    if (conv.status === "processing") continue;
    finishCall(db, call, conv);
    finished++;
    // Nothing of an unrecorded call stays at ElevenLabs either. If this fails, the retention sweep deletes it later.
    if (getCall(db, call.id)?.no_record) await api.deleteConversation(call.conversation_id).catch(() => undefined);
  }
  return finished;
}

function finishCall(db: Db, call: CallRow, conv: Conversation) {
  // They asked not to be recorded: keep only that the call happened, never what was said.
  if (getCall(db, call.id)?.no_record) {
    setCall(db, call.id, {
      status: conv.status === "failed" ? "failed" : "done",
      ended_at: call.ended_at ?? sqlTime(new Date()),
      duration_secs: conv.metadata?.call_duration_secs ?? null,
      outcome: "They asked not to be recorded, so nothing from this call was kept.",
    });
    return;
  }
  const turns = (conv.transcript ?? []).filter((t) => t.message?.trim());
  const spoke = turns.some((t) => t.role === "user");
  const duration = conv.metadata?.call_duration_secs ?? null;
  const summary = conv.analysis?.transcript_summary?.trim() || null;
  // A verification call only reads a code, so nobody needs to speak for it to count.
  const status: CallStatus = conv.status === "failed" ? "failed" : spoke || call.mode === "verify_phone" ? "done" : "missed";
  const fields: Partial<CallRow> = {
    status,
    ended_at: call.ended_at ?? sqlTime(new Date()),
    duration_secs: duration,
    summary,
    transcript: JSON.stringify(turns.map((t) => ({ role: t.role, message: t.message, at: t.time_in_call_secs ?? null }))),
  };
  if (spoke && call.mode !== "verify_phone") {
    const mode = call.mode;
    const task = taskInfo(db, call.task_id);
    const contact = contactOf(db, call.contact_id);
    const other = mode === "contact" || mode === "screen";
    const them = contact?.name ?? call.from_number ?? "Unknown caller";
    const label = mode === "contact" ? `Call with ${them}` : mode === "screen" ? `Call from ${them}` : MODE_LABEL[mode];
    const when = new Date(`${call.started_at ?? call.created_at}Z`);
    const note = writeNote({
      folder: "Calls",
      title: `${label} ${when.toISOString().slice(0, 10)} #${call.id}`,
      tags: ["call", mode.replace("_", "-")],
      links: task ? [task.title] : [],
      evidence: "verified",
      body: [
        [
          `**When:** ${when.toISOString().slice(0, 16).replace("T", " ")} UTC`,
          duration !== null && `**Length:** ${Math.max(1, Math.round(duration / 60))} min`,
          other ? `**Who:** ${them}, spoke with your AI twin` : call.direction === "self" ? "**Where:** your phone" : "**Where:** in the browser",
          call.purpose && `**Purpose:** ${call.purpose}`,
          call.topic && `**${mode === "capsule" ? "Your message" : "About"}:** ${call.topic}`,
          task && `**Promise:** ${task.title} (${task.status === "done" ? "kept" : "still open"})`,
        ]
          .filter(Boolean)
          .map((line) => `- ${line}`)
          .join("\n"),
        summary && `## Summary\n\n_Written by AI from the transcript._\n\n${summary}`,
        `## Transcript\n\n${turns.map((t) => `**${t.role === "agent" ? (other ? "Your AI twin" : "Future you (AI)") : other ? them : "You"}:** ${t.message!.trim()}`).join("\n\n")}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    });
    fields.note_path = note.path;
  }
  setCall(db, call.id, fields);
}

// ---------- The custom LLM ----------

/** Finds the live call a custom LLM request belongs to, from the call_ref in the agent's prompt. */
export function callFromPrompt(db: Db, messages: ChatMessage[]): CallRow | null {
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => contentText(m.content))
    .join("\n");
  const match = system.match(/futureme-call:(\d+)\.([A-Za-z0-9_-]{8,})/);
  return match ? liveCall(db, match[1], match[2]) : null;
}

function liveCall(db: Db, id: string, token: string): CallRow | null {
  const call = getCall(db, Number(id));
  if (!call?.ref_token || !sameSecret(token, call.ref_token) || !LIVE.includes(call.status as CallStatus)) return null;
  return call;
}

function contentText(content: ChatMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((p) => ("text" in p && typeof p.text === "string" ? p.text : "")).join("");
}

// ---------- Voice chat: Nemotron's words, in your own cloned voice ----------

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const VOICE_CHAT_REPLY_CHARS = 280;

/**
 * One turn of talking with your future self in your own cloned voice, without ElevenLabs' call agents (which won't pair
 * an instant clone with Nemotron): your speech is transcribed, Nemotron writes the reply from your notes, and the clone
 * reads it aloud. Turn by turn rather than a live call.
 */
export async function voiceChatTurn(db: Db, api: ElevenLabs, audio: AudioInput, history: ChatTurn[] = []) {
  if (isTwinPaused(db)) throw new Error("The twin is paused. Resume it to talk.");
  const voice = activeVoice(db);
  if (!voice || voice.status !== "ready" || voice.provider !== "elevenlabs") throw new Error("Clone your voice with ElevenLabs first, then you can talk to your future self in it.");
  checkAudio(audio);
  checkBudget(db);
  chargeVoiceTurn();
  const heard = (await api.transcribe(audio)).trim();
  if (!heard) throw new Error("I didn't catch that. Try again a little closer to the microphone.");
  const prompt = [
    callPrompt(db, { mode: "web", topic: null } as CallRow),
    "This is a spoken chat in the user's own cloned voice. Keep every reply to one to three short sentences, plain speech, nothing written (no lists, markdown or links).",
  ].join("\n");
  const turns = history
    .filter((t) => (t.role === "user" || t.role === "assistant") && t.content.trim())
    .slice(-10)
    .map((t): ChatMessage => ({ role: t.role, content: t.content.slice(0, 600) }));
  const { reply } = await runAgent(db, "twin_voice", [{ role: "system", content: prompt }, ...turns, { role: "user", content: heard }], { tools: ["search_memory"] });
  const spoken = reply.trim().slice(0, VOICE_CHAT_REPLY_CHARS);
  const speech = await api.speak(voice.voice_id, spoken || "Sorry, I lost my train of thought. Could you say that again?");
  return { heard, reply: spoken, audio: speech, type: "audio/mpeg" as const };
}

/** Writes the future self's next spoken reply for a live call. */
export async function replyOnCall(db: Db, messages: ChatMessage[], onDelta?: OnDelta): Promise<string> {
  const call = callFromPrompt(db, messages);
  if (!call) return "Sorry, I can't continue this call. Goodbye.";
  if (isTwinPaused(db)) return "Your twin was just paused, so I'll stop here. Talk soon.";
  if (call.status !== "in_progress") setCall(db, call.id, { status: "in_progress" });
  const turns = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m): ChatMessage => ({ role: m.role as "user" | "assistant", content: contentText(m.content) }))
    .filter((m) => m.content)
    .slice(-20);
  const { reply } = await runAgent(db, callAgent(call), [{ role: "system", content: callPrompt(db, call) }, ...turns], { onDelta });
  return reply;
}

/** Promise Keeper's one write: marks the call's own task done, only while that call is live. */
export function confirmTaskDone(db: Db, json: unknown): ToolResult {
  const args = z.object({ call_ref: z.string() }).safeParse(json);
  const match = args.success ? args.data.call_ref.trim().match(/^(\d+)\.([A-Za-z0-9_-]{8,})$/) : null;
  const call = match ? liveCall(db, match[1], match[2]) : null;
  if (!call || call.mode !== "promise_check" || call.task_id === null) return { output: "Error: confirm_task_done only works during a Promise Keeper call, with its call_ref.", citations: [] };
  if (isTwinPaused(db)) return { output: "Error: the user has paused the twin. Nothing was changed.", citations: [] };
  const task = taskInfo(db, call.task_id)!;
  completeTask(db, call.task_id);
  setCall(db, call.id, { outcome: "kept" });
  return { output: `Marked "${task.title}" done. Congratulate them.`, citations: [] };
}

/** Turns recording off for a live call with someone else who asked not to be recorded. */
export function stopRecording(db: Db, json: unknown): ToolResult {
  const args = z.object({ call_ref: z.string() }).safeParse(json);
  const match = args.success ? args.data.call_ref.trim().match(/^(\d+)\.([A-Za-z0-9_-]{8,})$/) : null;
  const call = match ? liveCall(db, match[1], match[2]) : null;
  if (!call || (call.mode !== "contact" && call.mode !== "screen")) return { output: "Error: stop_recording only works during a call with someone else, with its call_ref.", citations: [] };
  setCall(db, call.id, { no_record: 1 });
  return { output: "Recording is off: no transcript, summary or audio of this call will be kept. Tell them so.", citations: [] };
}

// ---------- Snapshot for the Twin page ----------

export function callsSnapshot(db: Db) {
  const { publicUrl, phoneNumberId, phoneSource } = callsConfig(db);
  // Approved contact calls still waiting to be dialled show on their approval card instead.
  const calls = db.prepare("SELECT * FROM calls WHERE status NOT IN ('cancelled', 'approved') ORDER BY COALESCE(scheduled_for, created_at) DESC, id DESC LIMIT 30").all() as CallRow[];
  const openTasks = db
    .prepare("SELECT t.id, t.title, g.title AS goal FROM tasks t JOIN goals g ON g.id = t.goal_id WHERE t.status != 'done' ORDER BY t.due_date IS NULL, t.due_date, t.id LIMIT 50")
    .all() as { id: number; title: string; goal: string }[];
  const approved = db.prepare("SELECT id, approval_id, status, error FROM calls WHERE direction = 'outbound' AND approval_id IS NOT NULL").all() as {
    id: number;
    approval_id: number;
    status: string;
    error: string | null;
  }[];
  return {
    ready: { publicUrl: !!publicUrl, phone: !!phoneNumberId, phoneSource },
    /** Live calls speak in a ready-made voice because ElevenLabs won't run your instant clone with Nemotron; Voice chat uses the clone. */
    callsUseReadyVoice: !!getTwinSetting(db, "instant_clone_blocked"),
    phone: ownerPhone(db),
    selfCallsToday: callsToday(db),
    selfCallLimit: SELF_CALLS_PER_DAY,
    horizonYear: horizonYear(),
    openTasks,
    blocked: blockedNumbers(db),
    /** The call row behind each approved outbound_call approval, so its card can show "Call now" or what happened. */
    byApproval: Object.fromEntries(approved.map((c) => [c.approval_id, { callId: c.id, status: c.status, error: c.error }])),
    calls: calls.map((c) => {
      const contact = contactOf(db, c.contact_id);
      const label =
        c.mode === "contact"
          ? `Call with ${contact?.name ?? "a removed contact"}`
          : c.mode === "screen"
            ? `Call from ${contact?.name ?? c.from_number ?? "a hidden number"}`
            : (MODE_LABEL[c.mode] ?? "Call");
      return {
        id: c.id,
        direction: c.direction,
        mode: c.mode,
        label,
        // A sealed capsule stays a surprise until its call.
        topic: c.mode === "capsule" && c.status === "scheduled" ? null : (c.topic ?? c.purpose),
        task: taskInfo(db, c.task_id)?.title ?? null,
        fromNumber: c.mode === "screen" ? c.from_number : null,
        blocked: isBlocked(db, c.from_number),
        status: c.status as CallStatus,
        scheduledFor: c.scheduled_for,
        startedAt: c.started_at,
        createdAt: c.created_at,
        durationSecs: c.duration_secs,
        summary: c.summary,
        notePath: c.note_path,
        outcome: c.outcome,
        error: c.error,
        noRecord: !!c.no_record,
        purged: !!c.purged_at,
      };
    }),
  };
}
