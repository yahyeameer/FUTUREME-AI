import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { isWorkspaceId, multiUser } from "./workspace-id";

// Which workspace the current request belongs to (multi-user mode). server.ts reads the workspace cookie and runs the
// whole request inside runInWorkspace(), so db(), vaultRoot() and the key and voice folders resolve to that visitor's
// own data without any page, action or API route having to pass an id around. The store lives on globalThis because the
// custom server and the bundled app each load their own copy of this module.

const g = globalThis as unknown as { __futuremeWorkspace?: AsyncLocalStorage<{ workspace: string }> };
const store = (g.__futuremeWorkspace ??= new AsyncLocalStorage<{ workspace: string }>());

/** Runs fn as the given workspace. With a missing or malformed id, or outside multi-user mode, it runs as the default one. */
export function runInWorkspace<T>(workspace: string | null | undefined, fn: () => T): T {
  return multiUser() && isWorkspaceId(workspace) ? store.run({ workspace }, fn) : fn();
}

/** The current request's workspace id, or null for the default (single-user) data. */
export function currentWorkspace(): string | null {
  return multiUser() ? (store.getStore()?.workspace ?? null) : null;
}

/** The default data folder: where DATABASE_PATH lives. */
export function baseDataDir(): string {
  const dbFile = process.env.DATABASE_PATH;
  return path.resolve(/* turbopackIgnore: true */ dbFile && dbFile !== ":memory:" ? path.dirname(dbFile) : path.join(process.cwd(), "data"));
}

export function workspaceDir(id: string): string {
  return path.join(baseDataDir(), "workspaces", id);
}

/** The folder that holds the current workspace's database, key file and voice recordings. */
export function dataDir(): string {
  const ws = currentWorkspace();
  return ws ? workspaceDir(ws) : baseDataDir();
}

/** The current workspace's database file, or undefined for the default one (openDb then uses DATABASE_PATH). */
export function workspaceDbFile(): string | undefined {
  const ws = currentWorkspace();
  return ws ? path.join(workspaceDir(ws), "futureme.db") : undefined;
}
