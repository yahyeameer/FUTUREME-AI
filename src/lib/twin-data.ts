import type { Db } from "./db";
import type { AgentMail } from "./mail";
import { getTwinSetting, TWIN_APPROVAL_KINDS } from "./twin";
import { retentionDays, usage } from "./twin-guard";
import { deleteNote } from "./vault";
import { revokeVoice, type ElevenLabs } from "./voice";

// The twin's data rights (Phase 4).
//   Retention  what other people said (calls with contacts and callers, mail the twin received) is deleted after
//              TWIN_RETENTION_DAYS, here and at ElevenLabs and AgentMail. Your own calls with your future self stay.
//   Export     everything the twin holds about you and your contacts, as one JSON file.
//   Delete     everything, here and at ElevenLabs: voices, the agent, recordings, calls, emails, contacts.

const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace("T", " ");
const inboxId = (db: Db) => process.env.AGENTMAIL_INBOX_ID?.trim() || getTwinSetting(db, "inbox_id");

/** Deletes third-party transcripts, recordings and received mail older than the retention period. */
export async function purgeExpired(db: Db, voice: ElevenLabs | null, mail: AgentMail | null, now = new Date()) {
  const cutoff = sqlTime(new Date(now.getTime() - retentionDays() * 86_400_000));
  let calls = 0;
  let emails = 0;

  const oldCalls = db
    .prepare(
      `SELECT id, conversation_id, note_path FROM calls WHERE mode IN ('contact', 'screen') AND purged_at IS NULL
       AND status IN ('done', 'missed', 'failed', 'cancelled') AND COALESCE(ended_at, started_at, created_at) < ?`,
    )
    .all(cutoff) as { id: number; conversation_id: string | null; note_path: string | null }[];
  for (const c of oldCalls) {
    if (c.note_path) deleteNote(c.note_path);
    db.prepare("UPDATE calls SET transcript = NULL, summary = NULL, note_path = NULL WHERE id = ?").run(c.id);
    // The recording lives at ElevenLabs. Until it's gone there, the row isn't marked purged, so this is tried again.
    if (c.conversation_id) {
      if (!voice) continue;
      try {
        await voice.deleteConversation(c.conversation_id);
      } catch {
        continue;
      }
    }
    db.prepare("UPDATE calls SET purged_at = ? WHERE id = ?").run(sqlTime(now), c.id);
    calls++;
  }

  const oldMail = db
    .prepare("SELECT id, message_id, note_path FROM email_threads WHERE direction = 'inbound' AND purged_at IS NULL AND created_at < ?")
    .all(cutoff) as { id: number; message_id: string | null; note_path: string | null }[];
  const inbox = inboxId(db);
  for (const e of oldMail) {
    if (e.note_path) deleteNote(e.note_path);
    db.prepare("UPDATE email_threads SET body = '', note_path = NULL WHERE id = ?").run(e.id);
    if (e.message_id && inbox) {
      if (!mail) continue;
      try {
        await mail.deleteMessage(inbox, e.message_id);
      } catch {
        continue;
      }
    }
    db.prepare("UPDATE email_threads SET purged_at = ? WHERE id = ?").run(sqlTime(now), e.id);
    emails++;
  }
  return { calls, emails };
}

/** Settings that are secrets or internal state, left out of the export. */
const PRIVATE_SETTINGS = new Set(["llm_secret", "phone_code", "phone_code_at", "phone_code_attempts", "agent_hash"]);

/** Everything the twin holds, as plain data. Secrets (call tokens, the custom LLM secret, pending codes) are left out. */
export function exportTwinData(db: Db) {
  const all = (sql: string, ...params: unknown[]) => db.prepare(sql).all(...params) as Record<string, unknown>[];
  const omit = (rows: Record<string, unknown>[], keys: string[]) => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k))));
  return {
    exportedAt: new Date().toISOString(),
    retentionDays: retentionDays(),
    usageThisMonth: usage(db),
    settings: Object.fromEntries((all("SELECT key, value FROM twin_settings") as { key: string; value: string }[]).filter((s) => !PRIVATE_SETTINGS.has(s.key)).map((s) => [s.key, s.value])),
    contacts: all("SELECT * FROM contacts ORDER BY id"),
    consents: omit(all("SELECT * FROM consents ORDER BY id"), ["code", "recording_path"]),
    voices: omit(all("SELECT * FROM voice_profiles ORDER BY id"), ["samples"]),
    approvals: all(`SELECT * FROM approvals WHERE kind IN (${TWIN_APPROVAL_KINDS.map(() => "?").join(", ")}) ORDER BY id`, ...TWIN_APPROVAL_KINDS).map((a) => ({
      ...a,
      payload: JSON.parse(String(a.payload)),
    })),
    calls: omit(all("SELECT * FROM calls ORDER BY id"), ["ref_token"]).map((c) => ({ ...c, transcript: c.transcript ? JSON.parse(String(c.transcript)) : null })),
    emails: all("SELECT * FROM email_threads ORDER BY id"),
    reviewQueue: all("SELECT * FROM twin_flags ORDER BY id"),
  };
}

/**
 * Deletes everything the twin holds. At ElevenLabs: every call's conversation, the agent and the voices. At AgentMail:
 * every message the twin received. Here: recordings, call and email notes, and all twin tables. The rest of
 * FutureMe (goals, memories, other notes) is untouched.
 */
export async function deleteTwinData(db: Db, voice: ElevenLabs | null, mail: AgentMail | null) {
  const convs = (db.prepare("SELECT conversation_id FROM calls WHERE conversation_id IS NOT NULL").all() as { conversation_id: string }[]).map((r) => r.conversation_id);
  if (convs.length && !voice) throw new Error("ELEVENLABS_API_KEY is needed to delete your calls at ElevenLabs.");
  for (const id of convs) await voice!.deleteConversation(id);
  // The agent, the voices, the consent recordings and samples.
  await revokeVoice(db, voice);

  const received = (db.prepare("SELECT message_id FROM email_threads WHERE direction = 'inbound' AND message_id IS NOT NULL AND purged_at IS NULL").all() as { message_id: string }[]).map(
    (r) => r.message_id,
  );
  const inbox = inboxId(db);
  if (received.length && inbox) {
    if (!mail) throw new Error("AGENTMAIL_API_KEY is needed to delete the mail your twin received.");
    for (const id of received) await mail.deleteMessage(inbox, id);
  }

  const notes = db.prepare("SELECT note_path FROM calls WHERE note_path IS NOT NULL UNION SELECT note_path FROM email_threads WHERE note_path IS NOT NULL").all() as { note_path: string }[];
  for (const n of notes) deleteNote(n.note_path);
  db.transaction(() => {
    db.prepare(`DELETE FROM approvals WHERE kind IN (${TWIN_APPROVAL_KINDS.map(() => "?").join(", ")})`).run(...TWIN_APPROVAL_KINDS);
    for (const table of ["calls", "email_threads", "contacts", "twin_flags", "voice_profiles", "consents", "twin_settings"]) db.prepare(`DELETE FROM ${table}`).run();
  })();
  return { conversations: convs.length, emails: received.length, notes: notes.length };
}
