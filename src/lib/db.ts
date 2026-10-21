import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { DECISION_SCHEMA } from "./decision/schema";
import { MEMORY_SCHEMA } from "./memory";
import { SOCIAL_SCHEMA } from "./social/schema";
import { migrateTwin, TWIN_SCHEMA } from "./twin-schema";

// Operational records (profile, goals, tasks, pending approvals). The vault holds the human-readable memory.

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  why TEXT,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  note_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER REFERENCES goals(id),
  title TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'todo',
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  note_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tool_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool TEXT NOT NULL,
  arguments TEXT NOT NULL,
  output TEXT NOT NULL,
  citations TEXT,
  approval_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS daily_issues (
  date TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  note_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS councils (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  voices TEXT NOT NULL,
  brief TEXT NOT NULL,
  backend TEXT NOT NULL,
  note_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS simulations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal TEXT NOT NULL,
  result TEXT NOT NULL,
  situation TEXT,
  grounding TEXT NOT NULL,
  backend TEXT NOT NULL,
  note_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS night_shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  brief TEXT,
  focus TEXT,
  daily_date TEXT,
  approvals TEXT,
  error TEXT,
  backend TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS research_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  summary TEXT,
  sources TEXT,
  approval_id INTEGER,
  error TEXT,
  backend TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  agent TEXT NOT NULL,
  role TEXT,
  task TEXT NOT NULL,
  tools TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'running',
  output TEXT,
  citations TEXT,
  used_tools TEXT,
  supervision TEXT,
  backend TEXT,
  error TEXT,
  mission_id INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS missions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',
  plan TEXT,
  report TEXT,
  next_step TEXT,
  approval_id INTEGER,
  lead_run_id INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

// Columns added after the first release. SQLite has no ADD COLUMN IF NOT EXISTS, so check first.
const COLUMNS: [table: string, column: string, type: string][] = [
  ["messages", "verification", "TEXT"],
  ["messages", "tools", "TEXT"],
  ["tool_events", "run_id", "INTEGER"],
  // JSON array of the approval ids a reply proposed. Older replies have none and are matched by time.
  ["messages", "approvals", "TEXT"],
  ["messages", "reasoning", "TEXT"],
  ["messages", "image", "TEXT"],
];

function migrate(db: Database.Database) {
  for (const [table, column, type] of COLUMNS) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

export function getSetting(db: Database.Database, key: string): string | null {
  return (db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined)?.value ?? null;
}

export function setSetting(db: Database.Database, key: string, value: string | null) {
  if (value === null) db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  else db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

export function openDb(file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "futureme.db")) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  db.exec(TWIN_SCHEMA);
  db.exec(MEMORY_SCHEMA);
  db.exec(SOCIAL_SCHEMA);
  db.exec(DECISION_SCHEMA);
  migrate(db);
  migrateTwin(db);
  return db;
}

export type Db = ReturnType<typeof openDb>;
