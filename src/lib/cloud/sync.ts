import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Db } from "../db";
import type { CloudStore, Row, Value } from "./store";

// Keeps a cloud copy of FutureMe's SQLite tables and files (vault notes, voice recordings).
// SQLite stays the working database; the cloud copy is what survives a lost disk or a move to a new server.
//   restore: a fresh install with no data of its own pulls everything down
//   push:    every row and file that changed since the last push goes up, and what was deleted locally is deleted there
// Tables and columns are read from SQLite, so a new table or column only needs the matching cloud schema (see postgresSchema).

/** Cloud table listing every synced file and its hash. */
export const FILES_TABLE = "cloud_files";
/** Tables that can hold rows on a fresh install (generated secrets), so they don't count as user data. */
const SETTINGS_TABLES = new Set(["settings", "twin_settings"]);

export interface TableInfo {
  name: string;
  key: string;
  columns: { name: string; type: string }[];
}

export interface FileDir {
  /** Folder name in the cloud bucket, such as "vault". */
  prefix: string;
  dir: string;
}

export interface SyncReport {
  upserted: number;
  deleted: number;
  uploaded: number;
  removedFiles: number;
  skipped: string[];
}

/** Every SQLite table with a single-column primary key. */
export function localTables(db: Db): TableInfo[] {
  const all = db
    .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string; sql: string | null }[];
  // Full-text indexes (and their shadow tables) are rebuilt locally, not synced.
  const virtual = all.filter((t) => /^CREATE VIRTUAL TABLE/i.test(t.sql ?? "")).map((t) => t.name);
  const names = all.filter((t) => !virtual.some((v) => t.name === v || t.name.startsWith(`${v}_`)));
  return names.flatMap(({ name }) => {
    const cols = db.prepare(`PRAGMA table_info("${name}")`).all() as { name: string; type: string; pk: number }[];
    const keys = cols.filter((c) => c.pk > 0);
    if (keys.length !== 1) return [];
    return [{ name, key: keys[0].name, columns: cols.map((c) => ({ name: c.name, type: c.type })) }];
  });
}

function pgType(sqliteType: string): string {
  const t = sqliteType.toUpperCase();
  if (t.includes("INT")) return "bigint";
  if (/REAL|FLOA|DOUB/.test(t)) return "double precision";
  return "text";
}

/**
 * Postgres DDL for the cloud copy of the local schema. Safe to run again after the local schema grows: it only adds
 * what's missing. Timestamps stay text so values round-trip exactly; constraints are enforced by SQLite, not here.
 */
export function postgresSchema(db: Db): string {
  const out: string[] = [];
  for (const t of localTables(db)) {
    const cols = t.columns.map((c) => `  "${c.name}" ${pgType(c.type)}${c.name === t.key ? " PRIMARY KEY" : ""}`);
    out.push(`CREATE TABLE IF NOT EXISTS public."${t.name}" (\n${cols.join(",\n")}\n);`);
    for (const c of t.columns) {
      if (c.name !== t.key) out.push(`ALTER TABLE public."${t.name}" ADD COLUMN IF NOT EXISTS "${c.name}" ${pgType(c.type)};`);
    }
    out.push(...lockDown(t.name));
  }
  out.push(
    `CREATE TABLE IF NOT EXISTS public."${FILES_TABLE}" (\n  "path" text PRIMARY KEY,\n  "sha1" text NOT NULL,\n  "size" bigint NOT NULL,\n  "updated_at" text NOT NULL\n);`,
    ...lockDown(FILES_TABLE),
  );
  return out.join("\n") + "\n";
}

// Row level security with no policies: only the server's secret key (service_role) can read or write.
const lockDown = (table: string) => [
  `ALTER TABLE public."${table}" ENABLE ROW LEVEL SECURITY;`,
  `REVOKE ALL ON public."${table}" FROM anon, authenticated;`,
  `GRANT ALL ON public."${table}" TO service_role;`,
];

const sha1 = (data: string | Uint8Array) => crypto.createHash("sha1").update(data).digest("hex");

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

export class CloudSync {
  /** What the cloud holds, as last read or written: table -> key -> row hash. */
  private remoteRows = new Map<string, Map<string, string>>();
  private remoteFiles = new Map<string, string>();
  /** Local file hashes, reused while a file's size and mtime don't change. */
  private fileCache = new Map<string, { size: number; mtimeMs: number; sha1: string }>();
  private remoteColumns = new Map<string, string[]>();
  private snapshot = new Map<string, Row[]>();
  private warned = new Set<string>();
  private ready = false;

  constructor(
    private db: Db,
    private store: CloudStore,
    private dirs: FileDir[],
    private log: (msg: string) => void = console.log,
  ) {}

  /** Tables both sides have, limited to the columns both sides have. */
  private synced(): { table: TableInfo; columns: string[] }[] {
    return localTables(this.db).flatMap((table) => {
      const remote = this.remoteColumns.get(table.name);
      if (!remote) {
        this.warnOnce(`table ${table.name}`, `Cloud sync: table "${table.name}" isn't in the cloud database yet, so it isn't synced. Apply the output of "npm run cloud-sync -- schema".`);
        return [];
      }
      const columns = table.columns.map((c) => c.name).filter((c) => remote.includes(c));
      for (const c of table.columns) {
        if (!remote.includes(c.name)) this.warnOnce(`${table.name}.${c.name}`, `Cloud sync: column ${table.name}.${c.name} is missing in the cloud database, so it isn't synced.`);
      }
      return remote.includes(table.key) ? [{ table, columns }] : [];
    });
  }

  private warnOnce(id: string, msg: string) {
    if (this.warned.has(id)) return;
    this.warned.add(id);
    this.log(msg);
  }

  /** Reads the cloud copy. Call once before restore or push. */
  async init() {
    this.remoteColumns = await this.store.tables();
    if (!this.remoteColumns.has(FILES_TABLE)) throw new Error(`The cloud database has no "${FILES_TABLE}" table. Apply supabase/migrations first.`);
    for (const { table, columns } of this.synced()) {
      const rows = await this.store.select(table.name, table.key);
      this.snapshot.set(table.name, rows);
      this.remoteRows.set(table.name, new Map(rows.map((r) => [String(r[table.key]), hashRow(r, columns)])));
    }
    const files = await this.store.select(FILES_TABLE, "path");
    this.remoteFiles = new Map(files.map((f) => [String(f.path), String(f.sha1)]));
    this.ready = true;
  }

  /** True when no table holds user data yet (settings tables aside). */
  localIsEmpty(): boolean {
    return localTables(this.db).every(
      (t) => SETTINGS_TABLES.has(t.name) || !(this.db.prepare(`SELECT 1 FROM "${t.name}" LIMIT 1`).get() as unknown),
    );
  }

  private remoteHasData(): boolean {
    return [...this.remoteRows].some(([name, rows]) => !SETTINGS_TABLES.has(name) && rows.size > 0);
  }

  /**
   * Copies the cloud's rows into SQLite when the local database has no user data (or always, with force), and
   * downloads every cloud file that's missing locally. Returns how many rows and files came down.
   */
  async restore(opts: { force?: boolean } = {}): Promise<{ rows: number; files: number }> {
    this.assertReady();
    let rows = 0;
    if (opts.force || this.localIsEmpty()) {
      const tables = this.synced();
      this.db.pragma("foreign_keys = OFF");
      try {
        this.db.transaction(() => {
          for (const { table, columns } of tables) {
            const data = this.snapshot.get(table.name) ?? [];
            if (!data.length) continue;
            if (opts.force) this.db.prepare(`DELETE FROM "${table.name}"`).run();
            const insert = this.db.prepare(
              `INSERT OR REPLACE INTO "${table.name}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`,
            );
            for (const r of data) insert.run(...columns.map((c) => r[c] ?? null));
            rows += data.length;
          }
        })();
      } finally {
        this.db.pragma("foreign_keys = ON");
      }
    }

    let files = 0;
    for (const remotePath of this.remoteFiles.keys()) {
      const target = this.localPath(remotePath);
      if (!target || fs.existsSync(target)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, await this.store.getFile(remotePath));
      files++;
    }
    return { rows, files };
  }

  /** Sends what changed since the last push (or since init). */
  async push(): Promise<SyncReport> {
    this.assertReady();
    const report: SyncReport = { upserted: 0, deleted: 0, uploaded: 0, removedFiles: 0, skipped: [] };
    // An empty install must never wipe the cloud copy: restore it first.
    const guardDeletes = this.localIsEmpty() && this.remoteHasData();
    if (guardDeletes) report.skipped.push("deletes (local database is empty; run restore)");

    for (const { table, columns } of this.synced()) {
      const remote = this.remoteRows.get(table.name) ?? new Map<string, string>();
      const local = this.db.prepare(`SELECT ${columns.map((c) => `"${c}"`).join(", ")} FROM "${table.name}"`).all() as Row[];
      const seen = new Set<string>();
      const changed: Row[] = [];
      const hashes = new Map<string, string>();
      for (const r of local) {
        const id = String(r[table.key]);
        const h = hashRow(r, columns);
        seen.add(id);
        hashes.set(id, h);
        if (remote.get(id) !== h) changed.push(r);
      }
      const gone = guardDeletes ? [] : [...remote.keys()].filter((id) => !seen.has(id));
      if (changed.length) await this.store.upsert(table.name, table.key, changed);
      if (gone.length) await this.store.remove(table.name, table.key, gone.map((id) => keyValue(id, table)));
      for (const r of changed) remote.set(String(r[table.key]), hashes.get(String(r[table.key]))!);
      for (const id of gone) remote.delete(id);
      this.remoteRows.set(table.name, remote);
      report.upserted += changed.length;
      report.deleted += gone.length;
    }

    const localFiles = new Map<string, { full: string; sha1: string; size: number }>();
    for (const { prefix, dir } of this.dirs) {
      for (const full of walk(dir)) {
        const stat = fs.statSync(full);
        const cached = this.fileCache.get(full);
        const hash = cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs ? cached.sha1 : sha1(fs.readFileSync(full));
        this.fileCache.set(full, { size: stat.size, mtimeMs: stat.mtimeMs, sha1: hash });
        localFiles.set(`${prefix}/${path.relative(dir, full).split(path.sep).join("/")}`, { full, sha1: hash, size: stat.size });
      }
    }
    const uploads = [...localFiles].filter(([p, f]) => this.remoteFiles.get(p) !== f.sha1);
    for (const [p, f] of uploads) {
      await this.store.putFile(p, fs.readFileSync(f.full));
      await this.store.upsert(FILES_TABLE, "path", [{ path: p, sha1: f.sha1, size: f.size, updated_at: new Date().toISOString() }]);
      this.remoteFiles.set(p, f.sha1);
      report.uploaded++;
    }
    const removed = localFiles.size === 0 && this.remoteFiles.size > 0 ? [] : [...this.remoteFiles.keys()].filter((p) => !localFiles.has(p) && this.localPath(p));
    if (localFiles.size === 0 && this.remoteFiles.size > 0) report.skipped.push("file deletes (no local files; run restore)");
    if (removed.length) {
      await this.store.removeFiles(removed);
      await this.store.remove(FILES_TABLE, "path", removed);
      for (const p of removed) this.remoteFiles.delete(p);
      report.removedFiles = removed.length;
    }
    return report;
  }

  /** Local path for a cloud file, or null when no configured folder owns it (or it would escape that folder). */
  private localPath(remotePath: string): string | null {
    const [prefix, ...rest] = remotePath.split("/");
    const dir = this.dirs.find((d) => d.prefix === prefix)?.dir;
    if (!dir || !rest.length) return null;
    const root = path.resolve(dir);
    const full = path.resolve(root, ...rest);
    return full.startsWith(root + path.sep) ? full : null;
  }

  private assertReady() {
    if (!this.ready) throw new Error("CloudSync.init() must run first.");
  }
}

function hashRow(r: Row, columns: string[]): string {
  return sha1(JSON.stringify(columns.map((c) => r[c] ?? null)));
}

function keyValue(id: string, table: TableInfo): Value {
  const type = table.columns.find((c) => c.name === table.key)?.type ?? "";
  return pgType(type) === "text" ? id : Number(id);
}
