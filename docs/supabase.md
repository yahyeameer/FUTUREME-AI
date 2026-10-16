# Supabase cloud copy

FutureMe keeps working on its local SQLite database and Markdown vault, and keeps a copy of both in Supabase:
every table goes to a Postgres table with the same name and columns, and every vault note and voice recording goes to
the private `futureme-files` Storage bucket. A new server or a lost disk gets everything back from that copy.

## Set it up

1. Apply `supabase/migrations/20261016063000_futureme_cloud_copy.sql` to the project (SQL editor, `supabase db push`,
   or the Supabase MCP `apply_migration`). It creates the tables, the `cloud_files` list and the bucket.
2. In `.env.local` (or the server's `.env`), set:

   ```bash
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_...   # Project Settings > API Keys > Secret keys
   ```

3. Run `npm run cloud-sync` once to push what you have. The Docker image does this by itself: on start it restores an
   empty volume from the cloud, then pushes changes every 30 seconds (`CLOUD_SYNC_INTERVAL`).

During development, `npm run cloud-sync -- --loop` keeps pushing while `npm run dev` runs.

## How it behaves

- **Restore** only fills a database with no data of its own (settings aside), so it never overwrites local work.
  `npm run cloud-sync -- restore --force` replaces local rows with the cloud's. Missing files are always downloaded.
- **Push** sends rows and files whose content changed, and deletes in the cloud what was deleted locally. An empty
  install never deletes anything in the cloud; it tells you to restore first.
- **Security:** row level security is on with no policies and `anon`/`authenticated` have no access, so only the
  secret key on the server can read or write. The copy includes the twin's settings and secrets, so treat the
  Supabase project as private.
- **Schema changes:** when a release adds a table or column, the sync skips it and logs a warning until the cloud has
  it. `npm run cloud-sync -- schema` prints idempotent SQL for the current local schema; apply it as a new migration.

## Moving off Supabase later

The sync code only talks to the `CloudStore` interface in `src/lib/cloud/store.ts`. Supabase lives in
`src/lib/cloud/supabase.ts`; another host (for example Postgres on AWS RDS plus S3) is one more implementation of the
same seven methods, picked with `CLOUD_PROVIDER`. The data itself is plain Postgres, so `pg_dump` moves it, and the
files are ordinary objects under `vault/` and `voice/` in one bucket.
