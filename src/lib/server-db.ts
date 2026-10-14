import "server-only";
import { openDb, type Db } from "./db";

// One connection per server process (survives dev hot reloads).
const g = globalThis as unknown as { __futuremeDb?: Db };

export function db(): Db {
  g.__futuremeDb ??= openDb();
  return g.__futuremeDb;
}
