// The decisions table (see store.ts). Kept apart so db.ts can create it without importing the decision layer.

export const DECISION_SCHEMA = `
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  simulation_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  parent_id TEXT,
  scenario_version TEXT NOT NULL,
  request TEXT NOT NULL,
  result TEXT NOT NULL,
  status TEXT NOT NULL,
  producer TEXT NOT NULL,
  model TEXT,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  shown TEXT,
  choice TEXT,
  choice_kind TEXT,
  choice_reason TEXT,
  chosen_at TEXT,
  outcome TEXT,
  outcome_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS decisions_by_simulation ON decisions (simulation_id, created_at);
CREATE INDEX IF NOT EXISTS decisions_by_version ON decisions (simulation_id, kind, scenario_version);
`;
