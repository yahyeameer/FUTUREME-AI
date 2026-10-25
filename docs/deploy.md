# Deploying TOMORA

TOMORA ships as one Docker image that runs the Next.js app and the Docker Agent future-self agent together. SQLite and the Markdown vault live in `/data`, so mount a persistent volume there. To also keep a cloud copy that a new server restores from, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (see [supabase.md](supabase.md)).

## On a Nebius Compute VM (or any Linux VM)

1. Create a small CPU VM (2 vCPU, 4 GB RAM is plenty; the model runs on Nebius Token Factory, not on the VM).
2. Install Docker and the compose plugin.
3. Clone the repository and create `.env` next to `docker-compose.yml`:

   ```bash
   NEBIUS_API_KEY=your-key
   NEBIUS_MODEL=the-nemotron-model-id   # from `npm run spike:models`
   SEED_DEMO=1                          # optional: demo user on first start
   ```

4. Start it:

   ```bash
   docker compose up -d --build
   ```

   To keep the model on the VM instead (needs a GPU VM with Docker Model Runner), use `docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build`.

5. Open port 3000 in the VM's security group, or put a reverse proxy with HTTPS (for example Caddy) in front of it.

## Checks after deploying

- `/daily` shows a TOMORA Daily issue when `SEED_DEMO=1`.
- `docker compose logs futureme` shows `Agent runtime: Nemotron, in the app` and the Next.js ready line (with `AGENT_RUNTIME=docker-agent`, `Listening on 127.0.0.1:8083` from Docker Agent instead).
- The Agent page shows the night shift's next run time. `docker compose exec futureme npm run night-shift` runs it once.
- A chat message on `/future-self` shows "remembered …" tags under the reply, which proves the agent called the memory tool.

## Security notes

- TOMORA is single-user. Before putting personal data on a public address, set `FUTUREME_ACCESS_CODE` so every page and API asks for it (the `/welcome` page, icons and share image stay public and carry no workspace data).
- The research agent's page reader refuses private, loopback and link-local addresses (checked after DNS and on every redirect), so it can't be pointed at the VM's metadata service or other containers. Set `WEB_SEARCH=off` if the server shouldn't reach the internet at all.
- Docker Agent listens only on `127.0.0.1` inside the container. Its tools are TOMORA's own MCP tools, and anything they propose still needs approval in the app.

## A public demo with a private workspace for every visitor

For a hackathon or a public link, set these in `.env` (next to `docker-compose.yml`) so each visitor who enters the access code gets a future self of their own, with its own database and vault:

```bash
FUTUREME_MULTI_USER=1          # a private workspace per visitor (server.ts runs each request inside it)
FUTUREME_ACCESS_CODE=your-code # the code visitors enter
FUTUREME_SHOW_CODE=1           # optional: show the code on the sign-in page with a one-click button
SEED_DEMO=0                    # new visitors start at onboarding, not on demo data
NIGHT_SHIFT_AT=off             # the night shift and twin schedulers only serve the default workspace
YDC_API_KEY=...                # web research: You.com (or BRAVE_SEARCH_API_KEY). DuckDuckGo blocks most cloud servers.
```

- A visitor's workspace is a random id in a cookie. **Settings -> Your workspace code** shows it, and pasting it under "Coming back?" on the sign-in page opens the same workspace on another device. Anyone holding the code can open that workspace.
- Data lives in `/data/workspaces/<id>/` (database, vault, key file), one folder per visitor.
- Everyone who enters the code spends your model credits, so watch usage on a public link.
- Test it: start a multi-user server, then `E2E_MULTI_USER=1 E2E_BASE_URL=http://127.0.0.1:3000 npx playwright test e2e/judge-workspaces.spec.ts`.
