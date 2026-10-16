# Deploying FutureMe AI

FutureMe ships as one Docker image that runs the Next.js app and the Docker Agent future-self agent together. SQLite and the Markdown vault live in `/data`, so mount a persistent volume there. To also keep a cloud copy that a new server restores from, set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (see [supabase.md](supabase.md)).

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

- `/daily` shows a FutureMe Daily issue when `SEED_DEMO=1`.
- `docker compose logs futureme` shows `Listening on 127.0.0.1:8083` from Docker Agent and the Next.js ready line.
- The Agent page shows the night shift's next run time. `docker compose exec futureme npm run night-shift` runs it once.
- A chat message on `/future-self` shows "remembered …" tags under the reply, which proves the agent called the memory tool.

## Security notes

- FutureMe is a single-user MVP with no sign-in. Don't put personal data in a public deployment; use the demo user, or put the app behind HTTP basic auth at the proxy.
- The research agent's page reader refuses private, loopback and link-local addresses (checked after DNS and on every redirect), so it can't be pointed at the VM's metadata service or other containers. Set `WEB_SEARCH=off` if the server shouldn't reach the internet at all.
- Docker Agent listens only on `127.0.0.1` inside the container. Its tools are FutureMe's own MCP tools, and anything they propose still needs approval in the app.
