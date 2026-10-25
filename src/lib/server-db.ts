import "server-only";
import { openDb, type Db } from "./db";
import { currentWorkspace, workspaceDbFile } from "./tenant";

// One connection per workspace per server process (survives dev hot reloads). Outside multi-user mode there is only
// the default workspace, so this is the single connection it has always been.
const g = globalThis as unknown as { __futuremeDbs?: Map<string, Db> };
const MAX_OPEN = 64;

export function db(): Db {
  const dbs = (g.__futuremeDbs ??= new Map());
  const key = currentWorkspace() ?? "";
  let conn = dbs.get(key);
  if (conn) {
    // Most recently used goes last, so the first entry is the one to close when there are too many.
    dbs.delete(key);
  } else {
    conn = openDb(workspaceDbFile());
    while (dbs.size >= MAX_OPEN) {
      const oldest = dbs.keys().next().value as string;
      dbs.get(oldest)?.close();
      dbs.delete(oldest);
    }
  }
  dbs.set(key, conn);
  return conn;
}
