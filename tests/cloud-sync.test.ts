import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import { getCloudStore, type CloudStore, type Row, type Value } from "../src/lib/cloud/store";
import { supabaseStore } from "../src/lib/cloud/supabase";
import { CloudSync, FILES_TABLE, localTables, postgresSchema } from "../src/lib/cloud/sync";

// An in-memory stand-in for the cloud, with the same tables as the local schema.
function fakeStore(db: Db, opts: { without?: string[] } = {}) {
  const tables = new Map<string, Map<string, Row>>();
  const columns = new Map<string, string[]>();
  for (const t of localTables(db)) {
    if (opts.without?.includes(t.name)) continue;
    tables.set(t.name, new Map());
    columns.set(t.name, t.columns.map((c) => c.name));
  }
  tables.set(FILES_TABLE, new Map());
  columns.set(FILES_TABLE, ["path", "sha1", "size", "updated_at"]);
  const files = new Map<string, Uint8Array>();
  const calls: string[] = [];
  const store: CloudStore = {
    name: "fake",
    tables: async () => columns,
    select: async (table, key) => [...tables.get(table)!.values()].sort((a, b) => String(a[key]).localeCompare(String(b[key]))),
    upsert: async (table, key, rows) => {
      calls.push(`upsert ${table} ${rows.length}`);
      for (const r of rows) tables.get(table)!.set(String(r[key]), { ...r });
    },
    remove: async (table, _key, ids: Value[]) => {
      calls.push(`remove ${table} ${ids.join(",")}`);
      for (const id of ids) tables.get(table)!.delete(String(id));
    },
    putFile: async (p, bytes) => void files.set(p, bytes),
    getFile: async (p) => files.get(p)!,
    removeFiles: async (paths) => paths.forEach((p) => files.delete(p)),
  };
  return { store, tables, files, calls };
}

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "cloud-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const quiet = () => {};

describe("cloud sync", () => {
  it("pushes rows and files, then restores them into a fresh install", async () => {
    const db = openDb(":memory:");
    const goal = db.prepare("INSERT INTO goals (title) VALUES ('Run a marathon')").run().lastInsertRowid;
    db.prepare("INSERT INTO tasks (goal_id, title) VALUES (?, 'Buy shoes')").run(goal);
    db.prepare("INSERT INTO profile (id, data) VALUES (1, '{\"name\":\"Ada\"}')").run();
    fs.mkdirSync(path.join(dir, "vault", "Goals"), { recursive: true });
    fs.writeFileSync(path.join(dir, "vault", "Goals", "run-a-marathon.md"), "# Run a marathon\n");

    const cloud = fakeStore(db);
    const sync = new CloudSync(db, cloud.store, [{ prefix: "vault", dir: path.join(dir, "vault") }], quiet);
    await sync.init();
    expect(await sync.push()).toMatchObject({ upserted: 3, uploaded: 1, deleted: 0 });
    expect(cloud.files.has("vault/Goals/run-a-marathon.md")).toBe(true);

    // Nothing changed, so nothing is sent again.
    cloud.calls.length = 0;
    expect(await sync.push()).toMatchObject({ upserted: 0, uploaded: 0 });
    expect(cloud.calls).toEqual([]);

    const fresh = openDb(":memory:");
    const freshVault = path.join(dir, "fresh-vault");
    const restore = new CloudSync(fresh, cloud.store, [{ prefix: "vault", dir: freshVault }], quiet);
    await restore.init();
    expect(await restore.restore()).toEqual({ rows: 3, files: 1 });
    expect(fresh.prepare("SELECT title, goal_id FROM tasks").get()).toEqual({ title: "Buy shoes", goal_id: Number(goal) });
    expect(fs.readFileSync(path.join(freshVault, "Goals", "run-a-marathon.md"), "utf8")).toBe("# Run a marathon\n");
    // The restored install is already in step with the cloud.
    expect(await restore.push()).toMatchObject({ upserted: 0, uploaded: 0, deleted: 0 });
  });

  it("sends only changes and deletes what was deleted locally", async () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO goals (title) VALUES ('A'), ('B')").run();
    const cloud = fakeStore(db);
    const sync = new CloudSync(db, cloud.store, [], quiet);
    await sync.init();
    await sync.push();

    db.prepare("UPDATE goals SET status = 'done' WHERE title = 'A'").run();
    db.prepare("DELETE FROM goals WHERE title = 'B'").run();
    cloud.calls.length = 0;
    expect(await sync.push()).toMatchObject({ upserted: 1, deleted: 1 });
    expect(cloud.calls).toEqual(["upsert goals 1", "remove goals 2"]);
    expect([...cloud.tables.get("goals")!.values()].map((r) => [r.title, r.status])).toEqual([["A", "done"]]);
  });

  it("never wipes the cloud copy from an empty install", async () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO goals (title) VALUES ('Keep me')").run();
    const cloud = fakeStore(db);
    const first = new CloudSync(db, cloud.store, [], quiet);
    await first.init();
    await first.push();

    const empty = new CloudSync(openDb(":memory:"), cloud.store, [], quiet);
    await empty.init();
    const report = await empty.push();
    expect(report.deleted).toBe(0);
    expect(report.skipped[0]).toMatch(/run restore/);
    expect(cloud.tables.get("goals")!.size).toBe(1);
  });

  it("does not restore over a database that already has data", async () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO goals (title) VALUES ('Cloud goal')").run();
    const cloud = fakeStore(db);
    const first = new CloudSync(db, cloud.store, [], quiet);
    await first.init();
    await first.push();

    const local = openDb(":memory:");
    local.prepare("INSERT INTO goals (title) VALUES ('Local goal')").run();
    const sync = new CloudSync(local, cloud.store, [], quiet);
    await sync.init();
    expect((await sync.restore()).rows).toBe(0);
    expect(local.prepare("SELECT title FROM goals").all()).toEqual([{ title: "Local goal" }]);
  });

  it("skips tables the cloud doesn't have yet, and says so once", async () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO goals (title) VALUES ('A')").run();
    const logs: string[] = [];
    const sync = new CloudSync(db, fakeStore(db, { without: ["goals"] }).store, [], (m) => logs.push(m));
    await sync.init();
    await sync.push();
    await sync.push();
    expect(logs.filter((l) => l.includes('"goals"'))).toHaveLength(1);
  });

  it("ignores cloud files that would land outside their folder", async () => {
    const db = openDb(":memory:");
    const cloud = fakeStore(db);
    cloud.tables.get(FILES_TABLE)!.set("vault/../escape.md", { path: "vault/../escape.md", sha1: "x", size: 1, updated_at: "" });
    cloud.files.set("vault/../escape.md", new Uint8Array([1]));
    const sync = new CloudSync(db, cloud.store, [{ prefix: "vault", dir: path.join(dir, "vault") }], quiet);
    await sync.init();
    expect((await sync.restore()).files).toBe(0);
    expect(fs.existsSync(path.join(dir, "escape.md"))).toBe(false);
  });

  it("writes a Postgres schema for every local table, locked to the server key", () => {
    const sql = postgresSchema(openDb(":memory:"));
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public."goals" (\n  "id" bigint PRIMARY KEY,');
    expect(sql).toContain('ALTER TABLE public."goals" ADD COLUMN IF NOT EXISTS "title" text;');
    expect(sql).toContain('REVOKE ALL ON public."cloud_files" FROM anon, authenticated;');
  });
});

describe("supabase store", () => {
  it("uses the REST APIs with the secret key", async () => {
    const seen: { url: string; method: string; headers: Record<string, string>; body?: unknown }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit = {}) => {
      seen.push({ url, method: init.method ?? "GET", headers: init.headers as Record<string, string>, body: init.body });
      return new Response("[]", { status: 200 });
    }) as unknown as typeof fetch;
    const store = supabaseStore({ url: "https://x.supabase.co/", key: "sb_secret_abc", bucket: "futureme-files", fetch: fakeFetch });

    await store.upsert("goals", "id", [{ id: 1, title: "A" }]);
    await store.remove("settings", "key", ['a"b', "c"]);
    await store.putFile("vault/Goals/a b.md", new Uint8Array([1]));

    expect(seen[0]).toMatchObject({ url: "https://x.supabase.co/rest/v1/goals?on_conflict=id", method: "POST" });
    expect(seen[0].headers).toMatchObject({ apikey: "sb_secret_abc", Prefer: "resolution=merge-duplicates,return=minimal" });
    expect(seen[0].headers.Authorization).toBeUndefined();
    expect(decodeURIComponent(seen[1].url)).toBe('https://x.supabase.co/rest/v1/settings?key=in.("a\\"b","c")');
    expect(seen[2].url).toBe("https://x.supabase.co/storage/v1/object/futureme-files/vault/Goals/a%20b.md");
    expect(seen[2].headers["x-upsert"]).toBe("true");
  });

  it("reports failures with the status and message", async () => {
    const fakeFetch = (async () => new Response('{"message":"nope"}', { status: 401 })) as unknown as typeof fetch;
    const store = supabaseStore({ url: "https://x.supabase.co", key: "k", bucket: "b", fetch: fakeFetch });
    await expect(store.select("goals", "id")).rejects.toThrow(/failed \(401\).*nope/);
  });

  it("is off unless SUPABASE_URL is set", () => {
    expect(getCloudStore({})).toBeNull();
    expect(() => getCloudStore({ SUPABASE_URL: "https://x.supabase.co" })).toThrow(/SUPABASE_SECRET_KEY/);
    expect(getCloudStore({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SECRET_KEY: "k" })?.name).toBe("supabase");
  });
});
