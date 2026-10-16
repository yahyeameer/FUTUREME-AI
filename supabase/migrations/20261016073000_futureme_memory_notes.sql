-- The agent's memory index: one row per note or file in the Obsidian vault (see src/lib/memory.ts).
-- fts lets you search memory straight from Postgres too, for example:
--   select path, title from notes where fts @@ websearch_to_tsquery('english', 'marathon') order by ts_rank(fts, websearch_to_tsquery('english', 'marathon')) desc;
CREATE TABLE IF NOT EXISTS public."notes" (
  "path" text PRIMARY KEY,
  "folder" text,
  "title" text,
  "tags" text,
  "links" text,
  "body" text,
  "evidence" text,
  "mtime" double precision,
  "updated_at" text,
  "fts" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce("title", '') || ' ' || coalesce("tags", '') || ' ' || coalesce("body", ''))) STORED
);
CREATE INDEX IF NOT EXISTS notes_fts_idx ON public."notes" USING gin ("fts");
ALTER TABLE public."notes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."notes" FROM anon, authenticated;
GRANT ALL ON public."notes" TO service_role;
