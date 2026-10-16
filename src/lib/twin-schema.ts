// Tables for the voice twin. Kept apart from the core schema so the twin can be read (and removed) as one unit.
export const TWIN_SCHEMA = `
-- People the user added themselves. The twin may only reach someone on this list.
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  relationship TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Spoken consent to clone the user's own voice: the phrase they read, the recording, and what it was heard as.
CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'voice_clone',
  phrase TEXT NOT NULL,
  code TEXT NOT NULL,
  recording_path TEXT,
  transcript TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT,
  revoked_at TEXT
);
-- At most one live voice: an instant clone first, then a professional clone after ElevenLabs' own voice CAPTCHA.
CREATE TABLE IF NOT EXISTS voice_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL DEFAULT 'elevenlabs',
  voice_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('instant', 'professional')),
  status TEXT NOT NULL,
  consent_id INTEGER NOT NULL REFERENCES consents(id),
  samples TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Every call the twin is part of. direction: 'outbound' to a contact (approved in the queue), 'self' to the user's own
-- verified phone, 'web' in the browser, 'inbound' reserved. ref_token is the secret half of the call_ref ElevenLabs
-- passes back to the custom LLM, so a request can only speak as a call this app started.
CREATE TABLE IF NOT EXISTS calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound', 'self', 'web')),
  mode TEXT NOT NULL DEFAULT 'contact',
  contact_id INTEGER REFERENCES contacts(id),
  to_number TEXT,
  from_number TEXT,
  purpose TEXT,
  topic TEXT,
  task_id INTEGER,
  opener TEXT,
  status TEXT NOT NULL,
  approval_id INTEGER,
  ref_token TEXT,
  conversation_id TEXT,
  scheduled_for TEXT,
  started_at TEXT,
  ended_at TEXT,
  duration_secs INTEGER,
  outcome TEXT,
  error TEXT,
  transcript TEXT,
  summary TEXT,
  note_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Emails through the twin's own AgentMail inbox. 'outbound' rows are approved drafts (approved, sending, sent, failed);
-- 'inbound' rows are mail the inbox received.
CREATE TABLE IF NOT EXISTS email_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  direction TEXT NOT NULL DEFAULT 'outbound',
  contact_id INTEGER REFERENCES contacts(id),
  from_email TEXT,
  to_email TEXT,
  cc TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  approval_id INTEGER,
  message_id TEXT,
  thread_id TEXT,
  in_reply_to TEXT,
  error TEXT,
  note_path TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS twin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Columns added after a table first shipped. Missing ones are added on open. */
const ADDED_COLUMNS: [table: string, column: string, type: string][] = [
  ["calls", "from_number", "TEXT"],
  ["email_threads", "direction", "TEXT NOT NULL DEFAULT 'outbound'"],
  ["email_threads", "from_email", "TEXT"],
  ["email_threads", "to_email", "TEXT"],
  ["email_threads", "cc", "TEXT"],
  ["email_threads", "message_id", "TEXT"],
  ["email_threads", "thread_id", "TEXT"],
  ["email_threads", "in_reply_to", "TEXT"],
  ["email_threads", "error", "TEXT"],
  ["email_threads", "note_path", "TEXT"],
  ["email_threads", "sent_at", "TEXT"],
];

type MiniDb = { prepare: (sql: string) => { all: () => unknown[] }; exec: (sql: string) => unknown };
const columns = (db: MiniDb, table: string) => (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);

export function migrateTwin(db: MiniDb) {
  // Databases made before Phase 2 have a narrower calls table (and a stricter direction check); rebuild it once.
  const cols = columns(db, "calls");
  if (!cols.includes("mode")) {
    const keep = cols.join(", ");
    db.exec(`ALTER TABLE calls RENAME TO calls_v1; ${TWIN_SCHEMA} INSERT INTO calls (${keep}) SELECT ${keep} FROM calls_v1; DROP TABLE calls_v1;`);
  }
  for (const [table, column, type] of ADDED_COLUMNS) {
    if (!columns(db, table).includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
