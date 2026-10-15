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
CREATE TABLE IF NOT EXISTS email_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER REFERENCES contacts(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  approval_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS twin_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Databases made before Phase 2 have a narrower calls table; rebuild it once, keeping its rows. */
export function migrateTwin(db: { prepare: (sql: string) => { all: () => unknown[] }; exec: (sql: string) => unknown }) {
  const cols = (db.prepare("PRAGMA table_info(calls)").all() as { name: string }[]).map((c) => c.name);
  if (cols.includes("mode")) return;
  const keep = cols.join(", ");
  db.exec(`ALTER TABLE calls RENAME TO calls_v1; ${TWIN_SCHEMA} INSERT INTO calls (${keep}) SELECT ${keep} FROM calls_v1; DROP TABLE calls_v1;`);
}
