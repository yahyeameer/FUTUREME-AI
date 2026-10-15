import crypto from "node:crypto";
import { z } from "zod";
import { runAgent } from "./agents";
import type { Db } from "./db";
import { completeTask, getProfile, type OnDelta, type ToolResult } from "./futureme";
import type { ChatMessage } from "./llm";
import { getTwinSetting, isTwinPaused, ownerName, setTwinSetting } from "./twin";
import { writeNote } from "./vault";
import { activeVoice, ElevenLabsError, type Conversation, type ElevenLabs } from "./voice";

// Talking to your twin (Phase 2). ElevenLabs runs the voice (speech-to-text, the cloned voice, turn-taking, the phone
// line) and calls back into this app for every reply, as a custom LLM. The reply comes from the twin_voice agent in
// agents/futureme.yaml, so the future self on a call is the same agent team as in the app.
//
//   Browser call   /twin asks for a conversation token and talks over WebRTC.
//   Phone calls    only to the user's own number, after they verify it with a code read out on a call.
//                  Call From 2036 (a topic) and Promise Keeper (one open task) can be scheduled or started now.
//   Transcripts    every finished call is filed in the vault's Calls folder.
//
// Each call has a call_ref ("<id>.<random token>") that the agent's prompt carries back to the custom LLM, so a
// request can only speak as a call this app started, and only while that call is live.

export type CallMode = "web" | "future_call" | "promise_check" | "verify_phone";
export type CallStatus = "connecting" | "scheduled" | "dialing" | "in_progress" | "done" | "missed" | "failed" | "cancelled";

export interface CallRow {
  id: number;
  direction: "outbound" | "inbound" | "self" | "web";
  mode: CallMode | "contact";
  contact_id: number | null;
  to_number: string | null;
  purpose: string | null;
  topic: string | null;
  task_id: number | null;
  status: CallStatus | "approved";
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
  created_at: string;
}

/** Calls the twin may place to the user's own phone per day, verification calls included. */
export const SELF_CALLS_PER_DAY = 6;
const VERIFY_CALLS_PER_DAY = 3;
const CODE_TTL_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;
const MAX_CALL_SECONDS = 600;
const VOICE_TTS_MODEL = "eleven_flash_v2_5";
export const SECRET_HEADER = "x-futureme-twin-secret";
const LIVE: CallStatus[] = ["connecting", "dialing", "in_progress"];
const PHONE = /^\+[1-9]\d{6,14}$/;

export const horizonYear = () => new Date().getFullYear() + 10;
const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const getCall = (db: Db, id: number) => db.prepare("SELECT * FROM calls WHERE id = ?").get(id) as CallRow | undefined;
const callRef = (c: CallRow) => `${c.id}.${c.ref_token}`;

export function callsConfig() {
  return {
    publicUrl: process.env.TWIN_PUBLIC_URL?.trim().replace(/\/+$/, "") || null,
    phoneNumberId: process.env.ELEVENLABS_PHONE_NUMBER_ID?.trim() || null,
  };
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

function agentConfig(db: Db, voiceId: string, publicUrl: string) {
  return {
    name: `${ownerName(db)}: FutureMe twin`,
    conversation_config: {
      agent: {
        // Both come from this app per call, as dynamic variables. The model never writes the opening line.
        first_message: "{{opening_line}}",
        language: "en",
        prompt: {
          prompt: "futureme-call:{{call_ref}}",
          llm: "custom-llm",
          custom_llm: {
            url: `${publicUrl}/api/twin/llm/v1`,
            model_id: "futureme-twin",
            request_headers: { [SECRET_HEADER]: llmSecret(db) },
            api_type: "chat_completions",
          },
        },
      },
      tts: { voice_id: voiceId, model_id: VOICE_TTS_MODEL },
      conversation: { max_duration_seconds: MAX_CALL_SECONDS },
    },
    // Only this app can start a conversation: the browser needs a token from the server.
    platform_settings: { auth: { enable_auth: true } },
  };
}

/** Creates the twin's ElevenLabs agent, or updates it when the voice, the public URL or the secret changed. */
export async function ensureTwinAgent(db: Db, api: ElevenLabs): Promise<string> {
  const voice = activeVoice(db);
  if (!voice || voice.status !== "ready") throw new Error("Clone your voice first.");
  const { publicUrl } = callsConfig();
  if (!publicUrl) throw new Error("Set TWIN_PUBLIC_URL to this app's public https address so ElevenLabs can reach your future self.");
  const config = agentConfig(db, voice.voice_id, publicUrl);
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
      return `${hi}, this is FutureMe, an AI assistant, checking this number${name ? ` for ${name}` : ""}. Your code is ${spokenCode(code)}. Once more: ${spokenCode(code)}. Type it into FutureMe to finish. Goodbye.`;
    }
    case "future_call":
      return `${hi}, it's you, calling from ${year}. Well, an AI version of your future self. This call is recorded for your notes. I wanted to talk about ${call.topic}. Got a minute?`;
    case "promise_check": {
      const task = taskInfo(db, call.task_id);
      const promise = task ? (/^[A-Z][a-z]/.test(task.title) ? task.title[0].toLowerCase() + task.title.slice(1) : task.title) : "do something";
      return `${hi}, it's FutureMe, your AI future self. This call is recorded for your notes. You told me you'd ${promise.replace(/\.$/, "")}. Did you do it?`;
    }
    default:
      return `Hey${name ? ` ${name}` : ""}. It's you, from ${year}. Not a recording: an AI version of your future self, in your own voice. What's on your mind?`;
  }
}

/** The per-call system prompt, added before the twin_voice agent's own instruction. */
function callPrompt(db: Db, call: CallRow): string {
  const profile = getProfile(db);
  const lines = [
    profile
      ? `You are ${profile.name}'s future self, speaking from ${horizonYear()}, having reached this dream: ${profile.dream}`
      : `You are the user's future self, speaking from ${horizonYear()}.`,
    "You are an AI. If they ask, say so plainly.",
  ];
  switch (call.mode) {
    case "verify_phone":
      lines.push(`This call only reads out a verification code: ${spokenCode(getTwinSetting(db, "phone_code") ?? "")}. Repeat it if asked, then say goodbye. Talk about nothing else.`);
      break;
    case "future_call":
      lines.push(`You called them about: ${call.topic}. Share what you learned about it from where you are now, then ask what they'll do this week.`);
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

function insertCall(db: Db, c: { direction: "self" | "web"; mode: CallMode; status: CallStatus; topic?: string | null; taskId?: number | null; to?: string | null; scheduledFor?: string | null }): CallRow {
  const token = crypto.randomBytes(18).toString("base64url");
  const info = db
    .prepare("INSERT INTO calls (direction, mode, topic, task_id, to_number, status, ref_token, scheduled_for) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(c.direction, c.mode, c.topic ?? null, c.taskId ?? null, c.to ?? null, c.status, token, c.scheduledFor ?? null);
  return getCall(db, Number(info.lastInsertRowid))!;
}

const setCall = (db: Db, id: number, fields: Partial<Omit<CallRow, "id">>) => {
  const keys = Object.keys(fields);
  db.prepare(`UPDATE calls SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`).run(...keys.map((k) => fields[k as keyof typeof fields] ?? null), id);
};

/** Starts a browser call: returns what the page passes to the ElevenLabs SDK. */
export async function startWebCall(db: Db, api: ElevenLabs, topic?: string) {
  if (isTwinPaused(db)) throw new Error("The twin is paused. Resume it to talk.");
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
  if (!callsConfig().phoneNumberId) throw new Error("Phone calls need ELEVENLABS_PHONE_NUMBER_ID, a Twilio number imported into ElevenLabs.");
  if (callsToday(db, "verify_phone") >= VERIFY_CALLS_PER_DAY) throw new Error(`You can ask for ${VERIFY_CALLS_PER_DAY} codes a day. Try again tomorrow.`);
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
  if (!s.at && !api) throw new Error("Phone calls need ELEVENLABS_API_KEY on the server.");
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
  const { phoneNumberId } = callsConfig();
  if (!phoneNumberId) return fail("ELEVENLABS_PHONE_NUMBER_ID isn't set.");
  if (isTwinPaused(db)) return fail("The twin was paused.");
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

// ---------- Transcripts ----------

const MODE_LABEL: Record<CallMode, string> = {
  web: "Call with my future self",
  future_call: "Call From the Future",
  promise_check: "Promise Keeper call",
  verify_phone: "Phone verification",
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
  }
  return finished;
}

function finishCall(db: Db, call: CallRow, conv: Conversation) {
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
  if (spoke && call.mode !== "verify_phone" && call.mode !== "contact") {
    const mode = call.mode;
    const task = taskInfo(db, call.task_id);
    const when = new Date(`${call.started_at ?? call.created_at}Z`);
    const note = writeNote({
      folder: "Calls",
      title: `${MODE_LABEL[mode]} ${when.toISOString().slice(0, 10)} #${call.id}`,
      tags: ["call", mode.replace("_", "-")],
      links: task ? [task.title] : [],
      evidence: "verified",
      body: [
        [
          `**When:** ${when.toISOString().slice(0, 16).replace("T", " ")} UTC`,
          duration !== null && `**Length:** ${Math.max(1, Math.round(duration / 60))} min`,
          call.direction === "self" ? "**Where:** your phone" : "**Where:** in the browser",
          call.topic && `**About:** ${call.topic}`,
          task && `**Promise:** ${task.title} (${task.status === "done" ? "kept" : "still open"})`,
        ]
          .filter(Boolean)
          .map((line) => `- ${line}`)
          .join("\n"),
        summary && `## Summary\n\n_Written by AI from the transcript._\n\n${summary}`,
        `## Transcript\n\n${turns.map((t) => `**${t.role === "user" ? "You" : "Future you (AI)"}:** ${t.message!.trim()}`).join("\n\n")}`,
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
  const { reply } = await runAgent(db, "twin_voice", [{ role: "system", content: callPrompt(db, call) }, ...turns], { onDelta });
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

// ---------- Snapshot for the Twin page ----------

export function callsSnapshot(db: Db) {
  const { publicUrl, phoneNumberId } = callsConfig();
  const calls = db.prepare("SELECT * FROM calls WHERE direction IN ('self', 'web') AND status != 'cancelled' ORDER BY COALESCE(scheduled_for, created_at) DESC, id DESC LIMIT 20").all() as CallRow[];
  const openTasks = db
    .prepare("SELECT t.id, t.title, g.title AS goal FROM tasks t JOIN goals g ON g.id = t.goal_id WHERE t.status != 'done' ORDER BY t.due_date IS NULL, t.due_date, t.id LIMIT 50")
    .all() as { id: number; title: string; goal: string }[];
  return {
    ready: { publicUrl: !!publicUrl, phone: !!phoneNumberId },
    phone: ownerPhone(db),
    selfCallsToday: callsToday(db),
    selfCallLimit: SELF_CALLS_PER_DAY,
    horizonYear: horizonYear(),
    openTasks,
    calls: calls.map((c) => ({
      id: c.id,
      direction: c.direction as "self" | "web",
      mode: c.mode as CallMode,
      label: MODE_LABEL[c.mode as CallMode] ?? "Call",
      topic: c.topic,
      task: taskInfo(db, c.task_id)?.title ?? null,
      status: c.status as CallStatus,
      scheduledFor: c.scheduled_for,
      startedAt: c.started_at,
      createdAt: c.created_at,
      durationSecs: c.duration_secs,
      summary: c.summary,
      notePath: c.note_path,
      outcome: c.outcome,
      error: c.error,
    })),
  };
}
