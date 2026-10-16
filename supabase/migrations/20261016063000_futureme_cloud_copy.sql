-- FutureMe's cloud copy: one table per local SQLite table (same names and columns), plus cloud_files, the list of
-- vault notes and voice recordings kept in the private "futureme-files" Storage bucket.
-- Written by `npm run cloud-sync -- schema`; when the local schema grows, apply that command's output again.
-- Only the server's secret key can read or write any of it (row level security on, no policies, no anon access).

CREATE TABLE IF NOT EXISTS public."approvals" (
  "id" bigint PRIMARY KEY,
  "kind" text,
  "payload" text,
  "status" text,
  "created_at" text,
  "decided_at" text
);
ALTER TABLE public."approvals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."approvals" FROM anon, authenticated;
GRANT ALL ON public."approvals" TO service_role;
CREATE TABLE IF NOT EXISTS public."calls" (
  "id" bigint PRIMARY KEY,
  "direction" text,
  "mode" text,
  "contact_id" bigint,
  "to_number" text,
  "from_number" text,
  "purpose" text,
  "topic" text,
  "task_id" bigint,
  "opener" text,
  "status" text,
  "approval_id" bigint,
  "ref_token" text,
  "conversation_id" text,
  "scheduled_for" text,
  "started_at" text,
  "ended_at" text,
  "duration_secs" bigint,
  "outcome" text,
  "error" text,
  "transcript" text,
  "summary" text,
  "note_path" text,
  "no_record" bigint,
  "purged_at" text,
  "created_at" text
);
ALTER TABLE public."calls" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."calls" FROM anon, authenticated;
GRANT ALL ON public."calls" TO service_role;
CREATE TABLE IF NOT EXISTS public."consents" (
  "id" bigint PRIMARY KEY,
  "kind" text,
  "phrase" text,
  "code" text,
  "recording_path" text,
  "transcript" text,
  "status" text,
  "created_at" text,
  "verified_at" text,
  "revoked_at" text
);
ALTER TABLE public."consents" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."consents" FROM anon, authenticated;
GRANT ALL ON public."consents" TO service_role;
CREATE TABLE IF NOT EXISTS public."contacts" (
  "id" bigint PRIMARY KEY,
  "name" text,
  "phone" text,
  "email" text,
  "relationship" text,
  "created_at" text
);
ALTER TABLE public."contacts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."contacts" FROM anon, authenticated;
GRANT ALL ON public."contacts" TO service_role;
CREATE TABLE IF NOT EXISTS public."councils" (
  "id" bigint PRIMARY KEY,
  "question" text,
  "voices" text,
  "brief" text,
  "backend" text,
  "note_path" text,
  "created_at" text
);
ALTER TABLE public."councils" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."councils" FROM anon, authenticated;
GRANT ALL ON public."councils" TO service_role;
CREATE TABLE IF NOT EXISTS public."daily_issues" (
  "date" text PRIMARY KEY,
  "content" text,
  "note_path" text,
  "created_at" text
);
ALTER TABLE public."daily_issues" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."daily_issues" FROM anon, authenticated;
GRANT ALL ON public."daily_issues" TO service_role;
CREATE TABLE IF NOT EXISTS public."email_threads" (
  "id" bigint PRIMARY KEY,
  "direction" text,
  "contact_id" bigint,
  "from_email" text,
  "to_email" text,
  "cc" text,
  "subject" text,
  "body" text,
  "status" text,
  "approval_id" bigint,
  "message_id" text,
  "thread_id" text,
  "in_reply_to" text,
  "error" text,
  "note_path" text,
  "sent_at" text,
  "purged_at" text,
  "created_at" text
);
ALTER TABLE public."email_threads" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."email_threads" FROM anon, authenticated;
GRANT ALL ON public."email_threads" TO service_role;
CREATE TABLE IF NOT EXISTS public."goals" (
  "id" bigint PRIMARY KEY,
  "title" text,
  "why" text,
  "target_date" text,
  "status" text,
  "note_path" text,
  "created_at" text
);
ALTER TABLE public."goals" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."goals" FROM anon, authenticated;
GRANT ALL ON public."goals" TO service_role;
CREATE TABLE IF NOT EXISTS public."messages" (
  "id" bigint PRIMARY KEY,
  "role" text,
  "content" text,
  "citations" text,
  "created_at" text,
  "verification" text,
  "tools" text
);
ALTER TABLE public."messages" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."messages" FROM anon, authenticated;
GRANT ALL ON public."messages" TO service_role;
CREATE TABLE IF NOT EXISTS public."night_shifts" (
  "id" bigint PRIMARY KEY,
  "trigger" text,
  "status" text,
  "brief" text,
  "focus" text,
  "daily_date" text,
  "approvals" text,
  "error" text,
  "backend" text,
  "started_at" text,
  "finished_at" text
);
ALTER TABLE public."night_shifts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."night_shifts" FROM anon, authenticated;
GRANT ALL ON public."night_shifts" TO service_role;
CREATE TABLE IF NOT EXISTS public."profile" (
  "id" bigint PRIMARY KEY,
  "data" text,
  "updated_at" text
);
ALTER TABLE public."profile" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."profile" FROM anon, authenticated;
GRANT ALL ON public."profile" TO service_role;
CREATE TABLE IF NOT EXISTS public."reflections" (
  "id" bigint PRIMARY KEY,
  "content" text,
  "note_path" text,
  "created_at" text
);
ALTER TABLE public."reflections" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."reflections" FROM anon, authenticated;
GRANT ALL ON public."reflections" TO service_role;
CREATE TABLE IF NOT EXISTS public."research_runs" (
  "id" bigint PRIMARY KEY,
  "topic" text,
  "status" text,
  "summary" text,
  "sources" text,
  "approval_id" bigint,
  "error" text,
  "backend" text,
  "started_at" text,
  "finished_at" text
);
ALTER TABLE public."research_runs" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."research_runs" FROM anon, authenticated;
GRANT ALL ON public."research_runs" TO service_role;
CREATE TABLE IF NOT EXISTS public."settings" (
  "key" text PRIMARY KEY,
  "value" text
);
ALTER TABLE public."settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."settings" FROM anon, authenticated;
GRANT ALL ON public."settings" TO service_role;
CREATE TABLE IF NOT EXISTS public."tasks" (
  "id" bigint PRIMARY KEY,
  "goal_id" bigint,
  "title" text,
  "due_date" text,
  "status" text,
  "completed_at" text,
  "created_at" text
);
ALTER TABLE public."tasks" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."tasks" FROM anon, authenticated;
GRANT ALL ON public."tasks" TO service_role;
CREATE TABLE IF NOT EXISTS public."tool_events" (
  "id" bigint PRIMARY KEY,
  "tool" text,
  "arguments" text,
  "output" text,
  "citations" text,
  "approval_id" bigint,
  "created_at" text
);
ALTER TABLE public."tool_events" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."tool_events" FROM anon, authenticated;
GRANT ALL ON public."tool_events" TO service_role;
CREATE TABLE IF NOT EXISTS public."twin_flags" (
  "id" bigint PRIMARY KEY,
  "kind" text,
  "subject" text,
  "detail" text,
  "count" bigint,
  "status" text,
  "created_at" text,
  "updated_at" text
);
ALTER TABLE public."twin_flags" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."twin_flags" FROM anon, authenticated;
GRANT ALL ON public."twin_flags" TO service_role;
CREATE TABLE IF NOT EXISTS public."twin_settings" (
  "key" text PRIMARY KEY,
  "value" text
);
ALTER TABLE public."twin_settings" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."twin_settings" FROM anon, authenticated;
GRANT ALL ON public."twin_settings" TO service_role;
CREATE TABLE IF NOT EXISTS public."voice_profiles" (
  "id" bigint PRIMARY KEY,
  "provider" text,
  "voice_id" text,
  "kind" text,
  "status" text,
  "consent_id" bigint,
  "samples" text,
  "created_at" text,
  "updated_at" text
);
ALTER TABLE public."voice_profiles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."voice_profiles" FROM anon, authenticated;
GRANT ALL ON public."voice_profiles" TO service_role;
CREATE TABLE IF NOT EXISTS public."cloud_files" (
  "path" text PRIMARY KEY,
  "sha1" text NOT NULL,
  "size" bigint NOT NULL,
  "updated_at" text NOT NULL
);
ALTER TABLE public."cloud_files" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public."cloud_files" FROM anon, authenticated;
GRANT ALL ON public."cloud_files" TO service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES ('futureme-files', 'futureme-files', false)
ON CONFLICT (id) DO NOTHING;
