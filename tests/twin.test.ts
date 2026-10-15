import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import { decideApproval, pendingApprovals, runTool, saveProfile } from "../src/lib/futureme";
import { addContact, decideTwinApproval, DAILY_LIMITS, removeContact, setTwinPaused, twinApprovals } from "../src/lib/twin";
import { listNotes, readNote } from "../src/lib/vault";

let dir: string;
let db: Db;
const call = (args: object) => runTool(db, "propose_call", JSON.stringify(args));
const email = (args: object) => runTool(db, "propose_email", JSON.stringify(args));

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-twin-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  db = openDb(":memory:");
  saveProfile(db, { name: "Amina", dream: "Lead an AI research lab", style: "direct" });
  addContact(db, { name: "Hodan", phone: "+252634000000", email: "hodan@example.com" });
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("voice twin guardrails", () => {
  it("only reaches contacts the user added", async () => {
    const out = await call({ contact: "Stranger", purpose: "Say hello" });
    expect(out.output).toMatch(/not one of the user's contacts/);
    expect(out.approvalId).toBeUndefined();
    expect(twinApprovals(db)).toHaveLength(0);
  });

  it("turns a call into a pending approval with the fixed AI disclosure", async () => {
    const out = await call({ contact: "hodan", purpose: "Ask about Thursday's demo" });
    expect(out.approvalId).toBeDefined();
    const [a] = twinApprovals(db);
    expect(a).toMatchObject({ kind: "outbound_call", status: "pending" });
    expect((a.payload as { opener: string }).opener).toMatch(/^Hi, this is Amina's AI twin, an AI assistant/);
    expect(db.prepare("SELECT COUNT(*) AS n FROM calls").get()).toEqual({ n: 0 });

    decideTwinApproval(db, a.id, true);
    expect(db.prepare("SELECT direction, status, purpose FROM calls").get()).toEqual({ direction: "outbound", status: "approved", purpose: "Ask about Thursday's demo" });
  });

  it("adds the disclosure and signature to every email", async () => {
    await email({ contact: "Hodan", subject: "Thursday", body: "Are we still on for Thursday?" });
    const [a] = twinApprovals(db);
    const body = (a.payload as { body: string }).body;
    expect(body.startsWith("This email was written by Amina's AI twin")).toBe(true);
    expect(body.endsWith("Amina's AI twin (FutureMe)")).toBe(true);
  });

  it("stops everything while paused", async () => {
    await call({ contact: "Hodan", purpose: "Check in" });
    setTwinPaused(db, true);
    expect((await email({ contact: "Hodan", subject: "Hi", body: "Hi" })).output).toMatch(/paused/);
    expect(() => decideTwinApproval(db, twinApprovals(db)[0].id, true)).toThrow(/paused/);
    decideTwinApproval(db, twinApprovals(db)[0].id, false);
    expect(twinApprovals(db)[0].status).toBe("rejected");
  });

  it("enforces the daily call limit", async () => {
    for (let i = 0; i < DAILY_LIMITS.outbound_call; i++) expect((await call({ contact: "Hodan", purpose: `Call ${i}` })).approvalId).toBeDefined();
    expect((await call({ contact: "Hodan", purpose: "One more" })).output).toMatch(/daily limit/);
  });

  it("files an approved commitment in the vault and never auto-agrees", async () => {
    const out = await runTool(db, "propose_commitment", JSON.stringify({ what: "Meet Hodan for coffee", contact: "Hodan", when: "Thursday 3pm" }));
    expect(out.output).toMatch(/never agree/);
    decideTwinApproval(db, out.approvalId!, true);
    const note = listNotes().map((p) => readNote(p)).find((n) => n.title === "Commitment: Meet Hodan for coffee");
    expect(note?.tags).toContain("commitment");
  });

  it("rejects pending proposals when their contact is removed", async () => {
    await call({ contact: "Hodan", purpose: "Check in" });
    removeContact(db, 1);
    expect(twinApprovals(db)[0].status).toBe("rejected");
  });

  it("keeps twin approvals out of the plan and memory queue", async () => {
    await call({ contact: "Hodan", purpose: "Check in" });
    expect(pendingApprovals(db)).toHaveLength(0);
    expect(() => decideApproval(db, twinApprovals(db)[0].id, true)).toThrow();
  });

  it("requires a phone number or email for a contact", () => {
    expect(() => addContact(db, { name: "Nobody" })).toThrow();
    expect(() => addContact(db, { name: "Bad", phone: "0634000000" })).toThrow();
  });
});
