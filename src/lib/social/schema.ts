// Tables for imported accounts (see store.ts) and OAuth connections (see oauth.ts).

export const SOCIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS social_sources (
  platform TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  account TEXT,
  consent_at TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  notes TEXT NOT NULL DEFAULT '[]',
  data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS social_tokens (
  platform TEXT PRIMARY KEY,
  secret TEXT NOT NULL,
  account TEXT,
  scopes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS social_oauth_states (
  state TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  verifier TEXT NOT NULL,
  consent_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
