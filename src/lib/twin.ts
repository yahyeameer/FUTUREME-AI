import { z } from "zod";
import type { Db } from "./db";
import type { ToolDefinition } from "./llm";
import { writeNote } from "./vault";

// The voice twin's guardrails (Phase 0). The twin can only propose: a call, an email or a promise becomes a pending
// approval, and nothing reaches another person until the user approves it. It may only reach contacts the user added,
// every call and email opens with a fixed AI disclosure, there are daily limits, and a kill switch stops everything.

export const TWIN_TOOLS = ["propose_call", "propose_email", "propose_commitment"] as const;
export type TwinTool = (typeof TWIN_TOOLS)[number];
export const isTwinTool = (name: string): name is TwinTool => (TWIN_TOOLS as readonly string[]).includes(name);

export const TWIN_APPROVAL_KINDS = ["outbound_call", "send_email", "commitment"] as const;
export type TwinApprovalKind = (typeof TWIN_APPROVAL_KINDS)[number];
const isTwinKind = (kind: string): kind is TwinApprovalKind => (TWIN_APPROVAL_KINDS as readonly string[]).includes(kind);

/** Proposals per day, counted when the twin proposes (so a rejected proposal still counts). */
export const DAILY_LIMITS: Record<Exclude<TwinApprovalKind, "commitment">, number> = { outbound_call: 10, send_email: 50 };

/** Tool schemas for the in-process agent loop. The MCP server registers the same tools for Docker Agent. */
export const TWIN_TOOL_DEFS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "propose_call",
      description: "Propose a phone call by the user's AI twin to one of their saved contacts. The user must approve it; no call is made until then.",
      parameters: {
        type: "object",
        properties: { contact: { type: "string" }, purpose: { type: "string" }, talking_points: { type: "array", items: { type: "string" } } },
        required: ["contact", "purpose"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_email",
      description: "Draft an email from the user's AI twin to one of their saved contacts. The user must approve it; nothing is sent until then.",
      parameters: { type: "object", properties: { contact: { type: "string" }, subject: { type: "string" }, body: { type: "string" } }, required: ["contact", "subject", "body"] },
    },
  },
  {
    type: "function",
    function: {
      name: "propose_commitment",
      description: "Record something someone wants the user to agree to. The twin never agrees itself; the user decides in the app.",
      parameters: {
        type: "object",
        properties: { what: { type: "string" }, contact: { type: "string" }, when: { type: "string" }, context: { type: "string" } },
        required: ["what"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "confirm_task_done",
      description:
        "On a Promise Keeper call only: mark the task this call is about as done, after the user clearly says they did it. Pass the call_ref from your instructions.",
      parameters: { type: "object", properties: { call_ref: { type: "string" } }, required: ["call_ref"] },
    },
  },
];

// ---------- Settings and kill switch ----------

export function getTwinSetting(db: Db, key: string): string | null {
  return (db.prepare("SELECT value FROM twin_settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function setTwinSetting(db: Db, key: string, value: string | null) {
  if (value === null) db.prepare("DELETE FROM twin_settings WHERE key = ?").run(key);
  else db.prepare("INSERT INTO twin_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function isTwinPaused(db: Db): boolean {
  return getTwinSetting(db, "paused") === "1";
}

export function setTwinPaused(db: Db, paused: boolean) {
  setTwinSetting(db, "paused", paused ? "1" : "0");
}

// ---------- Contacts ----------

export const ContactInput = z
  .object({
    name: z.string().trim().min(1).max(80),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{6,14}$/, "Use international format, like +14155550123.")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    email: z.string().trim().email().max(200).optional().or(z.literal("").transform(() => undefined)),
    relationship: z.string().trim().max(60).optional(),
  })
  .refine((c) => c.phone || c.email, { message: "Add a phone number or an email address." });

export interface Contact {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string | null;
  created_at: string;
}

export function addContact(db: Db, input: unknown): Contact {
  const c = ContactInput.parse(input);
  const info = db.prepare("INSERT INTO contacts (name, phone, email, relationship) VALUES (?, ?, ?, ?)").run(c.name, c.phone ?? null, c.email ?? null, c.relationship ?? null);
  return db.prepare("SELECT * FROM contacts WHERE id = ?").get(info.lastInsertRowid) as Contact;
}

export function listContacts(db: Db): Contact[] {
  return db.prepare("SELECT * FROM contacts ORDER BY name COLLATE NOCASE").all() as Contact[];
}

/** Removes a contact and rejects anything still waiting to reach them. */
export function removeContact(db: Db, id: number) {
  db.transaction(() => {
    for (const a of twinApprovals(db).filter((a) => a.status === "pending" && a.payload.contact_id === id)) {
      db.prepare("UPDATE approvals SET status = 'rejected', decided_at = datetime('now') WHERE id = ?").run(a.id);
    }
    db.prepare("UPDATE calls SET contact_id = NULL WHERE contact_id = ?").run(id);
    db.prepare("UPDATE email_threads SET contact_id = NULL WHERE contact_id = ?").run(id);
    db.prepare("DELETE FROM contacts WHERE id = ?").run(id);
  })();
}

function findContact(db: Db, ref: string): Contact | undefined {
  const r = ref.trim();
  if (/^\d+$/.test(r)) return db.prepare("SELECT * FROM contacts WHERE id = ?").get(Number(r)) as Contact | undefined;
  return db.prepare("SELECT * FROM contacts WHERE name = ? COLLATE NOCASE").get(r) as Contact | undefined;
}

// ---------- Disclosure ----------

export function ownerName(db: Db): string {
  const row = db.prepare("SELECT data FROM profile WHERE id = 1").get() as { data: string } | undefined;
  const name = row ? (JSON.parse(row.data) as { name?: unknown }).name : undefined;
  return typeof name === "string" && name.trim() ? name.trim() : "the user";
}

/** Said first on every call to someone else. Fixed here, never written by the model. */
export const callOpener = (name: string) =>
  `Hi, this is ${name}'s AI twin, an AI assistant calling for ${name}. This call may be recorded and transcribed. You can ask to speak with ${name} directly at any time.`;

/** First line of every email to someone else. */
export const emailDisclosure = (name: string) => `This email was written by ${name}'s AI twin, an AI assistant, and approved by ${name} before it was sent.`;
export const emailSignature = (name: string) => `${name}'s AI twin (FutureMe)`;

// ---------- Proposals ----------

const ContactRef = z.string().trim().min(1).max(80);
const CallArgs = z.object({
  contact: ContactRef,
  purpose: z.string().trim().min(1).max(300),
  talking_points: z.array(z.string().trim().min(1).max(200)).max(5).optional(),
});
const EmailArgs = z.object({
  contact: ContactRef,
  subject: z.string().trim().min(1).max(150),
  body: z.string().trim().min(1).max(4000),
});
const CommitmentArgs = z.object({
  what: z.string().trim().min(1).max(300),
  contact: ContactRef.optional(),
  when: z.string().trim().max(80).optional(),
  context: z.string().trim().max(1000).optional(),
});

export interface CallProposal {
  contact_id: number;
  contact_name: string;
  phone: string;
  purpose: string;
  talking_points: string[];
  opener: string;
}
export interface EmailProposal {
  contact_id: number;
  contact_name: string;
  email: string;
  subject: string;
  body: string;
}
export interface CommitmentProposal {
  contact_id?: number;
  contact_name?: string;
  what: string;
  when?: string;
  context?: string;
}
type TwinPayload = CallProposal | EmailProposal | CommitmentProposal;

export interface TwinApproval {
  id: number;
  kind: TwinApprovalKind;
  payload: TwinPayload & { contact_id?: number };
  status: "pending" | "approved" | "rejected";
  created_at: string;
  decided_at: string | null;
}

export interface TwinToolResult {
  output: string;
  citations: string[];
  approvalId?: number;
}

const fail = (output: string): TwinToolResult => ({ output: `Error: ${output}`, citations: [] });

function proposedToday(db: Db, kind: TwinApprovalKind): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM approvals WHERE kind = ? AND date(created_at) = date('now')").get(kind) as { n: number }).n;
}

function propose(db: Db, kind: TwinApprovalKind, payload: TwinPayload): number {
  return Number(db.prepare("INSERT INTO approvals (kind, payload) VALUES (?, ?)").run(kind, JSON.stringify(payload)).lastInsertRowid);
}

const unknownContact = (ref: string) =>
  fail(`"${ref}" is not one of the user's contacts. The twin can only reach people the user added on the Twin page; ask them to add this person first.`);

/** Runs one twin tool. Called through runTool, which logs every call. */
export function runTwinTool(db: Db, name: TwinTool, json: unknown): TwinToolResult {
  if (isTwinPaused(db)) return fail("the user has paused the twin. Nothing was proposed.");
  const invalid = (e: z.ZodError) => fail(`invalid arguments for ${name}: ${e.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  const owner = ownerName(db);

  switch (name) {
    case "propose_call": {
      const args = CallArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      const contact = findContact(db, args.data.contact);
      if (!contact) return unknownContact(args.data.contact);
      if (!contact.phone) return fail(`${contact.name} has no phone number saved.`);
      if (proposedToday(db, "outbound_call") >= DAILY_LIMITS.outbound_call) return fail(`the daily limit of ${DAILY_LIMITS.outbound_call} proposed calls is reached.`);
      const id = propose(db, "outbound_call", {
        contact_id: contact.id,
        contact_name: contact.name,
        phone: contact.phone,
        purpose: args.data.purpose,
        talking_points: args.data.talking_points ?? [],
        opener: callOpener(owner),
      });
      return { output: `Call proposal #${id} to ${contact.name} is waiting for the user's approval. No call has been made.`, citations: [], approvalId: id };
    }
    case "propose_email": {
      const args = EmailArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      const contact = findContact(db, args.data.contact);
      if (!contact) return unknownContact(args.data.contact);
      if (!contact.email) return fail(`${contact.name} has no email address saved.`);
      if (proposedToday(db, "send_email") >= DAILY_LIMITS.send_email) return fail(`the daily limit of ${DAILY_LIMITS.send_email} proposed emails is reached.`);
      const id = propose(db, "send_email", {
        contact_id: contact.id,
        contact_name: contact.name,
        email: contact.email,
        subject: args.data.subject,
        body: `${emailDisclosure(owner)}\n\n${args.data.body}\n\n${emailSignature(owner)}`,
      });
      return { output: `Email proposal #${id} to ${contact.name} is waiting for the user's approval. Nothing has been sent.`, citations: [], approvalId: id };
    }
    case "propose_commitment": {
      const args = CommitmentArgs.safeParse(json);
      if (!args.success) return invalid(args.error);
      let contact: Contact | undefined;
      if (args.data.contact) {
        contact = findContact(db, args.data.contact);
        if (!contact) return unknownContact(args.data.contact);
      }
      const id = propose(db, "commitment", {
        contact_id: contact?.id,
        contact_name: contact?.name,
        what: args.data.what,
        when: args.data.when,
        context: args.data.context,
      });
      return {
        output: `Commitment #${id} is waiting for the user's approval. Until then, tell the other person ${owner} will confirm; never agree on their behalf.`,
        citations: [],
        approvalId: id,
      };
    }
  }
}

// ---------- Deciding ----------

export function twinApprovals(db: Db, limit = 100): TwinApproval[] {
  const rows = db
    .prepare(`SELECT * FROM approvals WHERE kind IN (${TWIN_APPROVAL_KINDS.map(() => "?").join(", ")}) ORDER BY id DESC LIMIT ?`)
    .all(...TWIN_APPROVAL_KINDS, limit) as (Omit<TwinApproval, "payload"> & { payload: string })[];
  return rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) }));
}

/**
 * Approving a call or email records it as allowed; the dialler and sender arrive in a later phase and act only on
 * approved rows. Approving a commitment files it in the vault.
 */
export function decideTwinApproval(db: Db, id: number, approve: boolean) {
  const row = db.prepare("SELECT kind, payload FROM approvals WHERE id = ? AND status = 'pending'").get(id) as { kind: string; payload: string } | undefined;
  if (!row || !isTwinKind(row.kind)) throw new Error(`No pending twin approval #${id}.`);
  if (approve && isTwinPaused(db)) throw new Error("The twin is paused. Resume it before approving anything.");
  const payload = JSON.parse(row.payload) as TwinPayload & { contact_id?: number };
  if (approve && payload.contact_id !== undefined && !db.prepare("SELECT 1 FROM contacts WHERE id = ?").get(payload.contact_id)) {
    throw new Error("That contact was removed, so this can't be approved.");
  }

  db.transaction(() => {
    db.prepare("UPDATE approvals SET status = ?, decided_at = datetime('now') WHERE id = ?").run(approve ? "approved" : "rejected", id);
    if (!approve) return;
    if (row.kind === "outbound_call") {
      const p = payload as CallProposal;
      db.prepare("INSERT INTO calls (direction, contact_id, purpose, opener, status, approval_id) VALUES ('outbound', ?, ?, ?, 'approved', ?)").run(p.contact_id, p.purpose, p.opener, id);
    } else if (row.kind === "send_email") {
      const p = payload as EmailProposal;
      db.prepare("INSERT INTO email_threads (contact_id, subject, body, status, approval_id) VALUES (?, ?, ?, 'approved', ?)").run(p.contact_id, p.subject, p.body, id);
    } else {
      const p = payload as CommitmentProposal;
      writeNote({
        folder: "Plans",
        title: `Commitment: ${p.what}`.slice(0, 120),
        tags: ["commitment", "twin"],
        evidence: "user-stated",
        body: [`**What:** ${p.what}`, p.contact_name && `**With:** ${p.contact_name}`, p.when && `**When:** ${p.when}`, p.context && `## Context\n\n${p.context}`, "Proposed by the AI twin and approved by you."]
          .filter(Boolean)
          .join("\n\n"),
      });
    }
  })();
}

// ---------- Snapshot for the Twin page ----------

export function twinSnapshot(db: Db) {
  return {
    paused: isTwinPaused(db),
    owner: ownerName(db),
    contacts: listContacts(db),
    approvals: twinApprovals(db, 50),
    usedToday: { outbound_call: proposedToday(db, "outbound_call"), send_email: proposedToday(db, "send_email") },
    limits: DAILY_LIMITS,
  };
}
