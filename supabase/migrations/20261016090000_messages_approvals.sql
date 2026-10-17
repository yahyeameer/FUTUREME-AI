-- Replies now record the approvals they proposed (messages.approvals in SQLite), so the cloud copy keeps them too.
ALTER TABLE public."messages" ADD COLUMN IF NOT EXISTS "approvals" text;
