import fs from "node:fs";
import path from "node:path";
import { openDb, type Db } from "./db";
import type { AgentMail } from "./mail";
import { baseDataDir, runInWorkspace } from "./tenant";
import { dialDueCalls, syncCalls } from "./twin-calls";
import { purgeExpired } from "./twin-data";
import { getVoiceApi, type ElevenLabs } from "./voice";
import { isWorkspaceId, multiUser } from "./workspace-id";

// One pass of the voice twin's scheduler (scripts/twin-scheduler.ts runs it every 30 seconds): places scheduled calls to
// the user's own phone, files finished call transcripts in the vault, and deletes old third-party transcripts and mail.
// On a multi-user server it does this for every workspace, each inside its own workspace, so a call is placed with that
// person's ElevenLabs key and phone number and its transcript lands in their vault.

export interface Tick {
  workspace: string | null;
  dialled: number;
  filed: number;
  purged: { calls: number; emails: number };
}

/** One workspace's pass. Null when it has no ElevenLabs key yet. `voiceApi` is swapped in by tests. */
export async function tickWorkspace(db: Db, mail: AgentMail | null, voiceApi: (db: Db) => ElevenLabs | null = getVoiceApi): Promise<Omit<Tick, "workspace"> | null> {
  const api = voiceApi(db);
  if (!api) return null;
  const dialled = await dialDueCalls(db, api);
  const filed = await syncCalls(db, api);
  const purged = await purgeExpired(db, api, mail);
  return { dialled, filed, purged };
}

/** The workspaces on this server that have a database. */
export function workspaceIds(): string[] {
  const root = path.join(baseDataDir(), "workspaces");
  try {
    return fs.readdirSync(root).filter((id) => isWorkspaceId(id) && fs.existsSync(path.join(root, id, "futureme.db")));
  } catch {
    return [];
  }
}

// The scheduler is a long-running process, so each workspace's database stays open between passes.
const open = new Map<string, Db>();
const dbFor = (key: string, file?: string) => {
  let d = open.get(key);
  if (!d) {
    d = openDb(file);
    open.set(key, d);
  }
  return d;
};

/** One pass over the default workspace, or over every workspace in multi-user mode. A failing workspace doesn't stop the rest. */
export async function tickAll(mail: AgentMail | null, voiceApi?: (db: Db) => ElevenLabs | null): Promise<{ ticks: Tick[]; errors: { workspace: string | null; error: string }[] }> {
  const ticks: Tick[] = [];
  const errors: { workspace: string | null; error: string }[] = [];
  const run = async (workspace: string | null, db: () => Db) => {
    try {
      const t = await tickWorkspace(db(), mail, voiceApi);
      if (t) ticks.push({ workspace, ...t });
    } catch (err) {
      errors.push({ workspace, error: err instanceof Error ? err.message : String(err) });
    }
  };
  if (!multiUser()) {
    await run(null, () => dbFor(""));
    return { ticks, errors };
  }
  for (const id of workspaceIds()) {
    await runInWorkspace(id, () => run(id, () => dbFor(id, path.join(baseDataDir(), "workspaces", id, "futureme.db"))));
  }
  return { ticks, errors };
}

/** For tests: close the databases the scheduler keeps open. */
export function closeSchedulerDbs() {
  for (const d of open.values()) d.close();
  open.clear();
}
