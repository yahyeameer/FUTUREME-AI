// Tables for the agent's integrations (connectors/). TOMORA's own calendar lives here; see calendar.ts.
export const CALENDAR_SCHEMA = `
CREATE TABLE IF NOT EXISTS calendar_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  location TEXT,
  description TEXT,
  attendees TEXT,
  note_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
