import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProvider, ToolDefinition } from "../src/lib/llm";

// One switchable provider, so a test can script what the twin proposes.
const provider: { current: LlmProvider | null; seenTools: string[][] } = { current: null, seenTools: [] };
vi.mock("../src/lib/llm", async (orig) => {
  const mod = await orig<typeof import("../src/lib/llm")>();
  const wrap = (p: LlmProvider): LlmProvider => ({
    name: p.name,
    complete: (messages, tools?: ToolDefinition[]) => {
      provider.seenTools.push((tools ?? []).map((t) => t.function.name));
      return p.complete(messages, tools);
    },
  });
  return { ...mod, getProvider: () => wrap(provider.current ?? mod.getProvider()) };
});

const { openDb } = await import("../src/lib/db");
const { runTool, saveProfile } = await import("../src/lib/futureme");
const { addContact, decideTwinApproval, getTwinSetting, setTwinPaused, setTwinSetting, twinApprovals } = await import("../src/lib/twin");
const { answerInbound, dialApprovedCall, replyOnCall, sealCapsule, setBlocked, syncCalls, callsSnapshot } = await import("../src/lib/twin-calls");
const { AgentMail, draftReply, receiveEmail, sendApprovedEmail, verifySvix, mailSnapshot } = await import("../src/lib/mail");
const { ElevenLabs } = await import("../src/lib/voice");
const { readNote } = await import("../src/lib/vault");

type Db = ReturnType<typeof openDb>;
let dir: string;
let db: Db;
const requests: { method: string; url: string; body: unknown }[] = [];
let conversations: Record<string, unknown> = {};
let transcript = "";
let n = 0;

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const fakeFetch: typeof fetch = async (input, init) => {
  const url = String(input);
  const method = init?.method ?? "GET";
  const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
  requests.push({ method, url, body });
  // ElevenLabs
  if (url.endsWith("/v1/convai/agents/create")) return json({ agent_id: "agent-1" });
  if (url.endsWith("/v1/convai/agents/agent-1")) return json({});
  if (url.endsWith("/v1/convai/twilio/outbound-call")) return json({ success: true, conversation_id: `conv-${++n}` });
  if (url.endsWith("/v1/speech-to-text")) return json({ text: transcript });
  const conv = url.match(/\/v1\/convai\/conversations\/(.+)$/);
  if (conv) return conversations[conv[1]] ? json(conversations[conv[1]]) : json({}, 404);
  // AgentMail
  if (url.endsWith("/v0/inboxes") && method === "POST") return json({ inbox_id: "twin@agentmail.to", email: "twin@agentmail.to" });
  if (url.endsWith("/messages/send")) return json({ message_id: "out-1", thread_id: "th-1" });
  if (url.endsWith("/reply")) return json({ message_id: "out-2", thread_id: "th-in" });
  return new Response("not found", { status: 404 });
};
const voice = new ElevenLabs("k", fakeFetch, "https://el.test");
const mail = new AgentMail("k", fakeFetch, "https://am.test");
const outbound = () => requests.filter((r) => r.url.endsWith("/outbound-call"));
const opening = (r: { body: unknown }) => (r.body as { conversation_initiation_client_data: { dynamic_variables: { opening_line: string; call_ref: string } } }).conversation_initiation_client_data.dynamic_variables;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-reach-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  process.env.LLM_PROVIDER = "mock";
  process.env.TWIN_PUBLIC_URL = "https://futureme.example.com";
  process.env.ELEVENLABS_PHONE_NUMBER_ID = "phnum-1";
  // Calling hours are tested in twin-guard.test.ts; here a contact can be called at any time.
  process.env.TWIN_CALL_HOURS = "0-24";
  delete process.env.DOCKER_AGENT_URL;
  delete process.env.AGENTMAIL_INBOX_ID;
  requests.length = 0;
  conversations = {};
  provider.current = null;
  provider.seenTools = [];
  db = openDb(":memory:");
  saveProfile(db, { name: "Amina", dream: "Lead an AI research lab", style: "direct" });
  addContact(db, { name: "Hodan", phone: "+252634000000", email: "hodan@example.com" });
  db.prepare("INSERT INTO consents (phrase, code, status) VALUES ('p', 'a b c', 'verified')").run();
  db.prepare("INSERT INTO voice_profiles (voice_id, kind, status, consent_id) VALUES ('ivc-1', 'instant', 'ready', 1)").run();
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function approvedCall() {
  const out = await runTool(db, "propose_call", JSON.stringify({ contact: "Hodan", purpose: "Ask if Thursday's demo is still on", talking_points: ["Demo at 3pm"] }));
  return decideTwinApproval(db, out.approvalId!, true).callId!;
}

describe("calls to contacts", () => {
  it("dials an approved call once, to the approved number, with the fixed AI opener", async () => {
    const callId = await approvedCall();
    await dialApprovedCall(db, voice, callId);
    const [dial] = outbound();
    expect(dial.body).toMatchObject({ to_number: "+252634000000" });
    expect(opening(dial).opening_line).toMatch(/^Hi, this is Amina's AI twin, an AI assistant calling for Amina\. This call may be recorded.*I'm calling about Ask if Thursday's demo is still on\. Is now a good time\?$/);
    await expect(dialApprovedCall(db, voice, callId)).rejects.toThrow(/already placed/);
    expect(outbound()).toHaveLength(1);
  });

  it("won't dial if the contact's number changed or the twin is paused", async () => {
    const callId = await approvedCall();
    setTwinPaused(db, true);
    await expect(dialApprovedCall(db, voice, callId)).rejects.toThrow(/paused/);
    setTwinPaused(db, false);
    db.prepare("UPDATE contacts SET phone = '+252634999999'").run();
    await expect(dialApprovedCall(db, voice, callId)).rejects.toThrow(/number changed/);
    expect(outbound()).toHaveLength(0);
  });

  it("speaks with an agent that can't search your memory, and files the call under Calls/", async () => {
    const callId = await approvedCall();
    await dialApprovedCall(db, voice, callId);
    const reply = await replyOnCall(db, [{ role: "system", content: `futureme-call:${opening(outbound()[0]).call_ref}` }, { role: "user", content: "Who is this?" }]);
    expect(reply.length).toBeGreaterThan(0);
    expect(provider.seenTools.at(-1)).toEqual(["propose_commitment", "stop_recording"]);

    conversations["conv-" + n] = {
      status: "done",
      transcript: [
        { role: "agent", message: "Hi, this is Amina's AI twin." },
        { role: "user", message: "Yes, the demo is still on." },
      ],
      analysis: { transcript_summary: "Hodan confirmed the demo." },
    };
    await syncCalls(db, voice);
    const row = db.prepare("SELECT status, note_path FROM calls WHERE id = ?").get(callId) as { status: string; note_path: string };
    expect(row.status).toBe("done");
    const note = readNote(row.note_path);
    expect(note.title).toMatch(/^Call with Hodan/);
    expect(note.body).toContain("**Hodan:** Yes, the demo is still on.");
    expect(note.body).toContain("**Your AI twin:** Hi, this is Amina's AI twin.");
  });
});

describe("calls to the twin's number", () => {
  it("answers with the fixed AI line, knows saved contacts, and refuses blocked numbers", () => {
    const known = answerInbound(db, { caller_id: "+252634000000", called_number: "+15550001111", conversation_id: "conv-in-1" });
    expect(known.type).toBe("conversation_initiation_client_data");
    expect(known.dynamic_variables.opening_line).toBe("Hi Hodan, you've reached Amina's AI twin, an AI assistant that answers Amina's calls. This call is recorded and transcribed. What can I pass on?");

    const stranger = answerInbound(db, { caller_id: "+14155550123" });
    expect(stranger.dynamic_variables.opening_line).toMatch(/Who's calling, and what's it about\?$/);

    setBlocked(db, "+14155550123", true);
    expect(answerInbound(db, { caller_id: "+14155550123" }).dynamic_variables.opening_line).toBe("Hi, Amina isn't taking calls from this number. Goodbye.");

    setTwinPaused(db, true);
    expect(answerInbound(db, { caller_id: "+252634000000" }).dynamic_variables.opening_line).toMatch(/isn't answering right now/);
  });

  it("lets the screening agent speak only for that live call", async () => {
    const { dynamic_variables: v } = answerInbound(db, { caller_id: "+14155550123", conversation_id: "conv-in-2" });
    const reply = await replyOnCall(db, [{ role: "system", content: `futureme-call:${v.call_ref}` }, { role: "user", content: "Hi, it's about your car warranty." }]);
    expect(reply).not.toMatch(/can't continue/);
    expect(provider.seenTools.at(-1)).toEqual(["propose_commitment", "stop_recording"]);
    const snap = callsSnapshot(db);
    expect(snap.calls[0]).toMatchObject({ direction: "inbound", label: "Call from +14155550123", fromNumber: "+14155550123" });
  });
});

describe("time capsule", () => {
  it("keeps only the words, hides them until the call, then reads them back", async () => {
    await expect(sealCapsule(db, voice, { data: new Uint8Array([1]), filename: "c.webm", type: "audio/webm" }, new Date(Date.now() + 86_400_000))).rejects.toThrow(/Verify your phone/);
    setTwinSetting(db, "owner_phone", "+252634000001");
    setTwinSetting(db, "owner_phone_verified", "+252634000001");
    transcript = "I hope the lab has its first three researchers by now.";
    const at = new Date(Date.now() + 365 * 86_400_000);
    const call = await sealCapsule(db, voice, { data: new Uint8Array([1, 2, 3]), filename: "c.webm", type: "audio/webm" }, at);
    expect(call).toMatchObject({ mode: "capsule", status: "scheduled", topic: transcript });
    expect(callsSnapshot(db).calls[0].topic).toBeNull();

    const { dialDueCalls } = await import("../src/lib/twin-calls");
    await dialDueCalls(db, voice, new Date(at.getTime() + 60_000));
    expect(opening(outbound().at(-1)!).opening_line).toContain(`Here's what you said: "${transcript}"`);
  });
});

describe("the twin's email", () => {
  it("sends an approved email from its own inbox with you cc'd, and checks the address first", async () => {
    setTwinSetting(db, "owner_email", "amina@example.com");
    const out = await runTool(db, "propose_email", JSON.stringify({ contact: "Hodan", subject: "Thursday", body: "Is the demo still on?" }));
    const { emailId } = decideTwinApproval(db, out.approvalId!, true);
    await sendApprovedEmail(db, mail, emailId!);
    const send = requests.find((r) => r.url.endsWith("/messages/send"))!;
    expect(send.url).toBe("https://am.test/v0/inboxes/twin%40agentmail.to/messages/send");
    expect(send.body).toMatchObject({ to: "hodan@example.com", cc: "amina@example.com", subject: "Thursday" });
    expect((send.body as { text: string }).text).toMatch(/^This email was written by Amina's AI twin/);
    expect(mailSnapshot(db).byApproval[out.approvalId!]).toMatchObject({ status: "sent" });
    await expect(sendApprovedEmail(db, mail, emailId!)).rejects.toThrow(/already sent/);

    const second = await runTool(db, "propose_email", JSON.stringify({ contact: "Hodan", subject: "Again", body: "Hi" }));
    const { emailId: id2 } = decideTwinApproval(db, second.approvalId!, true);
    db.prepare("UPDATE contacts SET email = 'other@example.com'").run();
    await expect(sendApprovedEmail(db, mail, id2!)).rejects.toThrow(/email changed/);
  });

  it("checks Svix signatures", () => {
    const secret = `whsec_${Buffer.from("test-secret-key").toString("base64")}`;
    const body = '{"event_type":"message.received"}';
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = crypto.createHmac("sha256", Buffer.from("test-secret-key")).update(`msg_1.${ts}.${body}`).digest("base64");
    const headers = (s: string, t = ts) => new Headers({ "svix-id": "msg_1", "svix-timestamp": t, "svix-signature": s });
    expect(verifySvix(secret, headers(`v1,bad v1,${sig}`), body)).toBe(true);
    expect(verifySvix(secret, headers(`v1,${sig}`), body + " ")).toBe(false);
    expect(verifySvix(secret, headers(`v1,${sig}`, String(Number(ts) - 600)), body)).toBe(false);
  });

  it("files mail from a contact under Inbox/ and drafts a reply that waits for approval, in the same thread", async () => {
    setTwinSetting(db, "inbox_id", "twin@agentmail.to");
    setTwinSetting(db, "inbox_email", "twin@agentmail.to");
    const event = {
      type: "event",
      event_type: "message.received",
      message: { inbox_id: "twin@agentmail.to", message_id: "in-1", thread_id: "th-in", from: "Hodan <Hodan@example.com>", to: ["twin@agentmail.to"], subject: "Lunch?", text: "Free for lunch Friday?" },
    };
    const filed = receiveEmail(db, event)!;
    expect(filed.draft).toBe(true);
    expect(receiveEmail(db, event)).toBeNull();
    expect(receiveEmail(db, { ...event, message: { ...event.message, message_id: "in-2", inbox_id: "someone-else" } })).toBeNull();
    const inbox = mailSnapshot(db).inbox[0];
    expect(inbox).toMatchObject({ from: "hodan@example.com", subject: "Lunch?" });
    expect(readNote(inbox.notePath!).body).toContain("Free for lunch Friday?");

    let step = 0;
    provider.current = {
      name: "scripted",
      complete: async () =>
        step++ === 0
          ? { content: null, toolCalls: [{ id: "c1", name: "propose_email", arguments: JSON.stringify({ contact: "Hodan", subject: "Re: Lunch?", body: "Friday works." }) }] }
          : { content: "Drafted.", toolCalls: [] },
    };
    const drafts = await draftReply(db, filed.emailId);
    expect(drafts).toHaveLength(1);
    const [a] = twinApprovals(db);
    expect(a).toMatchObject({ kind: "send_email", status: "pending" });
    expect((a.payload as { in_reply_to?: string }).in_reply_to).toBe("in-1");
    expect(requests.some((r) => r.url.includes("/messages/"))).toBe(false);

    const { emailId } = decideTwinApproval(db, a.id, true);
    await sendApprovedEmail(db, mail, emailId!);
    expect(requests.at(-1)!.url).toBe("https://am.test/v0/inboxes/twin%40agentmail.to/messages/in-1/reply");
    expect(getTwinSetting(db, "inbox_email")).toBe("twin@agentmail.to");
  });

  it("files mail from strangers without drafting anything", () => {
    setTwinSetting(db, "inbox_id", "twin@agentmail.to");
    const filed = receiveEmail(db, { event_type: "message.received", message: { inbox_id: "twin@agentmail.to", message_id: "x", from: "promo@shop.example", subject: "Sale", html: "<p>50% off</p>" } });
    expect(filed?.draft).toBe(false);
    expect(readNote(mailSnapshot(db).inbox[0].notePath!).body).toContain("50% off");
  });
});
