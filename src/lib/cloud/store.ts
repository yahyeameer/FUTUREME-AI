import { supabaseStore } from "./supabase";

// The cloud backend behind FutureMe's local SQLite database and files. Supabase today; the sync code only talks to
// this interface, so moving to another host (for example Postgres on RDS plus S3) means writing one more CloudStore.

export type Value = string | number | null;
export type Row = Record<string, Value>;

export interface CloudStore {
  name: string;
  /** Tables the cloud database has, with their columns. */
  tables(): Promise<Map<string, string[]>>;
  select(table: string, key: string): Promise<Row[]>;
  upsert(table: string, key: string, rows: Row[]): Promise<void>;
  remove(table: string, key: string, ids: Value[]): Promise<void>;
  putFile(path: string, bytes: Uint8Array): Promise<void>;
  getFile(path: string): Promise<Uint8Array>;
  removeFiles(paths: string[]): Promise<void>;
}

/** The configured cloud backend, or null when FutureMe runs on local storage only. */
export function getCloudStore(env: Record<string, string | undefined> = process.env): CloudStore | null {
  const provider = env.CLOUD_PROVIDER || (env.SUPABASE_URL ? "supabase" : "");
  if (!provider || provider === "off") return null;
  if (provider !== "supabase") throw new Error(`Unknown CLOUD_PROVIDER: ${provider}`);
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Set SUPABASE_URL and SUPABASE_SECRET_KEY to use Supabase.");
  return supabaseStore({ url: env.SUPABASE_URL, key: env.SUPABASE_SECRET_KEY, bucket: env.SUPABASE_BUCKET || "futureme-files" });
}
