// Tables for imported accounts (see store.ts), OAuth connections (see oauth.ts) and ownership checks (see claims.ts).

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
CREATE TABLE IF NOT EXISTS social_claims (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL,
  checks INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL,
  verified_at TEXT
);
CREATE TABLE IF NOT EXISTS social_claim_log (
  platform TEXT NOT NULL,
  handle TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
