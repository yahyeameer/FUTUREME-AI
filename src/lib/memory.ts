import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import type { Db } from "./db";
import { readNote, resolveInVault, vaultRoot, writeNote, type Note, type SearchHit } from "./vault";

// The agent's long-term memory: the Obsidian vault, indexed in the database.
//   - Every Markdown note in the vault (TOMORA's own folders and anything the user adds in Obsidian) is copied into the
//     `notes` table with a full-text index, so search_memory reads from the database instead of re-reading every file.
//     The index catches up with the vault before each search, so edits made in Obsidian are seen straight away.
//   - Every conversation with the future self is appended to Conversations/, so nothing said is forgotten.
//   - The agent keeps its own files (drafts, lists, plans) in Files/ with save_file, read_file and list_files.
// The notes table goes to Supabase with the rest of the database (see cloud/sync.ts), and the files go to Storage.

export const MEMORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  path TEXT PRIMARY KEY,
  folder TEXT NOT NULL,
  title TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  links TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL,
  evidence TEXT,
  mtime REAL NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(path UNINDEXED, title, tags, body, tokenize = 'porter unicode61');
`;

/** Text files the agent may keep in Files/ besides Markdown notes. */
const FILE_TYPES = new Set([".md", ".txt", ".csv", ".json"]);
const MAX_FILE_BYTES = 200_000;
const MAX_READ_CHARS = 12_000;

const posix = (rel: string) => rel.split(path.sep).join("/");

/** Every file the memory covers: Markdown anywhere in the vault, plus text files in Files/. */
function memoryFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        const rel = posix(path.relative(root, full));
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".md" || (rel.startsWith("Files/") && FILE_TYPES.has(ext))) out.push(rel);
      }
    }
  };
  walk(root);
  return out.sort();
}

function parseFile(rel: string, root: string): Note {
  if (rel.endsWith(".md")) return readNote(rel, root);
  const body = fs.readFileSync(resolveInVault(rel, root), "utf8");
  return { path: rel, title: path.basename(rel), folder: rel.split("/")[0], tags: [], links: [], body, data: {} };
}

/** Brings the notes table up to date with the vault. Returns how many notes changed. */
export function syncMemoryIndex(db: Db, root = vaultRoot()): number {
  const known = new Map(
    (db.prepare("SELECT path, mtime FROM notes").all() as { path: string; mtime: number }[]).map((r) => [r.path, r.mtime]),
  );
  const upsert = db.prepare(
    `INSERT INTO notes (path, folder, title, tags, links, body, evidence, mtime, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(path) DO UPDATE SET folder = excluded.folder, title = excluded.title, tags = excluded.tags, links = excluded.links,
       body = excluded.body, evidence = excluded.evidence, mtime = excluded.mtime, updated_at = excluded.updated_at`,
  );
  const ftsDelete = db.prepare("DELETE FROM notes_fts WHERE path = ?");
  const ftsInsert = db.prepare("INSERT INTO notes_fts (path, title, tags, body) VALUES (?, ?, ?, ?)");
  let changed = 0;

  db.transaction(() => {
    const seen = new Set<string>();
    for (const rel of memoryFiles(root)) {
      seen.add(rel);
      const mtime = fs.statSync(resolveInVault(rel, root)).mtimeMs;
      if (known.get(rel) === mtime) continue;
      let note: Note;
      try {
        note = parseFile(rel, root);
      } catch {
        continue; // A note Obsidian is still writing, or with broken frontmatter: try again next time.
      }
      const evidence = typeof note.data.evidence === "string" ? note.data.evidence : null;
      upsert.run(rel, note.folder, note.title, JSON.stringify(note.tags), JSON.stringify(note.links), note.body, evidence, mtime);
      ftsDelete.run(rel);
      ftsInsert.run(rel, note.title, note.tags.join(" "), note.body);
      changed++;
    }
    for (const rel of known.keys()) {
      if (seen.has(rel)) continue;
      db.prepare("DELETE FROM notes WHERE path = ?").run(rel);
      ftsDelete.run(rel);
      changed++;
    }
    // The full-text index isn't synced to the cloud: rebuild it after a restore.
    const counts = db.prepare("SELECT (SELECT COUNT(*) FROM notes) AS notes, (SELECT COUNT(*) FROM notes_fts) AS fts").get() as {
      notes: number;
      fts: number;
    };
    if (counts.notes !== counts.fts) {
      db.prepare("DELETE FROM notes_fts").run();
      db.prepare("INSERT INTO notes_fts (path, title, tags, body) SELECT path, title, (SELECT group_concat(value, ' ') FROM json_each(notes.tags)), body FROM notes").run();
    }
  })();
  return changed;
}

interface NoteRow {
  path: string;
  folder: string;
  title: string;
  tags: string;
  links: string;
  body: string;
  evidence: string | null;
  rank: number;
}

/** Full-text search over everything the agent remembers. Titles weigh most, then tags, then the text. */
export function searchMemory(db: Db, query: string, limit = 5, root = vaultRoot()): SearchHit[] {
  syncMemoryIndex(db, root);
  const terms = [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 2))];
  if (!terms.length) return [];
  const match = terms.map((t) => `"${t}"*`).join(" OR ");
  const rows = db
    .prepare(
      `SELECT n.path, n.folder, n.title, n.tags, n.links, n.body, n.evidence, bm25(notes_fts, 0, 3.0, 2.0, 1.0) AS rank
       FROM notes_fts JOIN notes n ON n.path = notes_fts.path WHERE notes_fts MATCH ? ORDER BY rank LIMIT ?`,
    )
    .all(match, limit) as NoteRow[];
  return rows.map((r) => ({
    note: {
      path: r.path,
      title: r.title,
      folder: r.folder,
      tags: JSON.parse(r.tags),
      links: JSON.parse(r.links),
      body: r.body,
      data: r.evidence ? { evidence: r.evidence } : {},
    },
    score: -r.rank,
  }));
}

// ---------- Conversations ----------

/** Appends one exchange to the day's conversation note (Conversations/conversation-YYYY-MM-DD.md). */
export function rememberConversation(userText: string, reply: string, at = new Date(), root = vaultRoot()): string {
  const date = at.toISOString().slice(0, 10);
  const time = at.toISOString().slice(11, 16);
  const section = `## ${time} UTC\n\n**Me:** ${userText.trim()}\n\n**Future me:** ${reply.trim()}`;
  const title = `Conversation ${date}`;
  const rel = path.posix.join("Conversations", `conversation-${date}.md`);
  const full = resolveInVault(rel, root);
  if (!fs.existsSync(full)) {
    return writeNote({ folder: "Conversations", title, tags: ["conversation"], evidence: "verified", links: ["Profile"], body: section }, root).path;
  }
  const parsed = matter(fs.readFileSync(full, "utf8"));
  fs.writeFileSync(full, matter.stringify(`${parsed.content.trimEnd()}\n\n${section}\n`, { ...parsed.data, updated: at.toISOString() }), "utf8");
  return rel;
}

// ---------- The agent's own files ----------

function fileName(name: string): string {
  const base = path.basename(name.trim()).normalize("NFKD").replace(/[^\w. -]/g, "").replace(/\s+/g, "-").replace(/^\.+/, "");
  if (!base) throw new Error("Give the file a name, such as reading-list.md.");
  const ext = path.extname(base).toLowerCase();
  if (!ext) return `${base.slice(0, 80)}.md`;
  if (!FILE_TYPES.has(ext)) throw new Error(`Files can be ${[...FILE_TYPES].join(", ")}; not ${ext}.`);
  return `${path.basename(base, path.extname(base)).slice(0, 80)}${ext}`;
}

/** Where save_file would put a file of this name, and whether one is already there. */
export function savedFileTarget(name: string, root = vaultRoot()): { path: string; exists: boolean } {
  const rel = `Files/${fileName(name)}`;
  return { path: rel, exists: fs.existsSync(resolveInVault(rel, root)) };
}

/** Saves (or replaces) a text file in the vault's Files folder. Returns its vault path. */
export function saveFile(name: string, content: string, root = vaultRoot()): string {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error(`Files are limited to ${MAX_FILE_BYTES / 1000} KB.`);
  const file = fileName(name);
  const rel = `Files/${file}`;
  const full = resolveInVault(rel, root);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const text =
    file.endsWith(".md") && !content.trimStart().startsWith("---")
      ? matter.stringify(content.trim() + "\n", {
          title: path.basename(file, ".md").replace(/-/g, " "),
          tags: ["file"],
          evidence: "ai-inferred",
          updated: new Date().toISOString(),
        })
      : content;
  fs.writeFileSync(full, text, "utf8");
  return rel;
}

/** Reads a text file or note from anywhere in the vault. */
export function readFile(rel: string, root = vaultRoot()): { path: string; content: string; truncated: boolean } {
  const clean = posix(path.normalize(rel.trim().replace(/^\/+/, "")));
  if (!FILE_TYPES.has(path.extname(clean).toLowerCase())) throw new Error("Only .md, .txt, .csv and .json files can be read.");
  const full = resolveInVault(clean, root);
  if (!fs.existsSync(full)) throw new Error(`No file at ${clean}. Use list_files to see what's there.`);
  const content = fs.readFileSync(full, "utf8");
  return { path: clean, content: content.slice(0, MAX_READ_CHARS), truncated: content.length > MAX_READ_CHARS };
}

/** Lists the vault's notes and files, optionally inside one folder. */
export function listFiles(folder?: string, root = vaultRoot()): string[] {
  const prefix = folder?.trim().replace(/^\/+|\/+$/g, "");
  return memoryFiles(root).filter((p) => !prefix || p.startsWith(`${prefix}/`));
}

/** The vault path of an existing text file or note, cleaned. Throws when it isn't there or isn't a text file. */
export function existingFile(rel: string, root = vaultRoot()): { path: string; bytes: number } {
  const clean = posix(path.normalize(rel.trim().replace(/^\/+/, "")));
  if (!FILE_TYPES.has(path.extname(clean).toLowerCase())) throw new Error("Only .md, .txt, .csv and .json files can be changed.");
  const full = resolveInVault(clean, root);
  if (!fs.existsSync(full)) throw new Error(`No file at ${clean}. Use list_files to see what's there.`);
  return { path: clean, bytes: fs.statSync(full).size };
}

/** Adds to the end of a file, or replaces its whole text. Used by edit_file once the user approves. */
export function editFile(rel: string, mode: "append" | "replace", content: string, root = vaultRoot()): string {
  const file = existingFile(rel, root);
  const full = resolveInVault(file.path, root);
  const next = mode === "append" ? `${fs.readFileSync(full, "utf8").trimEnd()}\n\n${content.trim()}\n` : content;
  if (Buffer.byteLength(next, "utf8") > MAX_FILE_BYTES) throw new Error(`Files are limited to ${MAX_FILE_BYTES / 1000} KB.`);
  fs.writeFileSync(full, next, "utf8");
  return file.path;
}

/** Deletes a file from the vault. Used by delete_file once the user approves. */
export function deleteFile(rel: string, root = vaultRoot()): string {
  const file = existingFile(rel, root);
  fs.rmSync(resolveInVault(file.path, root));
  return file.path;
}
