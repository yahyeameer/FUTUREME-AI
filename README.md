# FutureMe AI

Meet the person you're becoming. Start building that future today.

FutureMe is a personal AI companion for the Nebius × NVIDIA Global AI Hackathon 2026 (Personal AI track). It lets you talk with a personalized version of your future self, keeps an Obsidian-compatible Markdown memory vault you control, and turns reflection into approved goals and tasks.

> **Status:** Milestones 1–3 plus streaming and a demo seed. Only what is listed under "Working today" runs. Everything else is planned.

## Working today

1. **Onboarding** (`/onboarding`): your 10-year dream, situation, resources, challenges, values and coaching style. Saved to SQLite and written to the vault as `Profile`, `10-Year Dream` and `Values` notes.
2. **Future Reflection** (`/future`): a first-person letter from your future self, saved to `Reflections/`.
3. **Chat with Your Future** (`/chat`): the future-self agent runs in [Docker Agent](https://docker.github.io/docker-agent/) (`agents/futureme.yaml`). It searches your vault through FutureMe's MCP server before answering, shows which notes it remembered, and proposes plans or memories.
4. **Approve and track** (`/plan`): proposals wait for your approval. Approved plans become goals and tasks in SQLite and linked notes in `Goals/` and `Tasks/`. Completed tasks are marked `verified` in the vault.
5. **FutureMe Daily** (`/daily`): an editorial issue about your week. Every item (wins, milestones, open steps, a line from your future self) comes from a completed task, a goal or a saved note, and shows its source. The model writes only the headline, lead and editor's note from those facts; if it returns anything unusable, a plain fact-only front page is printed instead. Issues are filed to `Daily/`.
6. **Streaming replies**: chat replies stream from Docker Agent to the browser as they are written (`POST /api/chat`, newline-delimited JSON).

## How it fits together

```
Browser ── Next.js app ──► docker agent serve chat (agents/futureme.yaml) ──► Nemotron on Nebius Token Factory
                │                         │
                │                         └─ MCP: mcp/futureme-server.ts (search_memory, propose_memory, propose_plan)
                │                                         │
                └──────── SQLite (goals, tasks, approvals, tool log) + Markdown vault ◄──┘
```

- The app sends each chat turn, with your profile as a system message, to Docker Agent's OpenAI-compatible endpoint.
- Docker Agent runs the agent loop and calls FutureMe's MCP tools. Every tool call is logged, so the app can show what the agent remembered and proposed.
- The future-story letter is a single model call made by the app directly.
- Without `DOCKER_AGENT_URL`, the same loop runs in-process (used by unit tests).
- Without a Nebius key, a built-in stand-in model keeps everything runnable (`LLM_PROVIDER=mock`, or `npm run mock-model` plus `--flavor mock` for Docker Agent).

## Planned

Premium UI redesign (in progress separately), trend sourcing for FutureMe Daily, voice, avatars and VR.

## Deploy

One image runs both Docker Agent and the web app (`scripts/start.sh`). Data lives in the `/data` volume.

```bash
docker compose up --build                     # http://localhost:3000
# or
docker build -t futureme .
docker run -p 3000:3000 -v futureme-data:/data \
  -e NEBIUS_API_KEY=... -e NEBIUS_MODEL=... -e SEED_DEMO=1 futureme
```

- `NEBIUS_MODEL` is used by both the app and the agent (the entrypoint writes it into the agent file).
- Without `NEBIUS_API_KEY` the container runs on the stand-in model, so a demo always works.
- `SEED_DEMO=1` creates the demo user on an empty database.
- Any host that runs a Docker container with a persistent volume works, for example a Nebius Compute VM with Docker installed. See [docs/deploy.md](docs/deploy.md).

## Demo data

```bash
npm run seed:demo    # profile, letter, approved plan with two completed steps, a chat exchange, and a Daily issue
```

## Setup

```bash
npm install
cp .env.example .env.local   # add NEBIUS_API_KEY
npm run spike:models         # list Nemotron models your key can use; put one in NEBIUS_MODEL and agents/futureme.yaml
npm run spike                # Nemotron calls a tool; a note appears in data/vault/Goals
```

Install [Docker Agent](https://docker.github.io/docker-agent/getting-started/installation/), then run two terminals:

```bash
NEBIUS_API_KEY=... npm run agent:serve   # docker agent serve chat agents/futureme.yaml --safety autonomous
npm run build && npm start               # with DOCKER_AGENT_URL=http://127.0.0.1:8083 in .env.local
```

`--safety autonomous` lets the agent call tools without a terminal prompt. That is safe here because its only tools are FutureMe's own, and anything they propose still waits for your approval in the app.

You can also talk to the agent directly in the terminal with `docker agent run agents/futureme.yaml`.

### No key yet

```bash
npm run mock-model                                                    # stand-in model on :8090
docker agent serve chat agents/futureme.yaml --flavor mock --safety autonomous
LLM_PROVIDER=mock npm start
```

## Development

```bash
npm run lint
npm run typecheck
npm test            # unit + core workflow tests
npm run test:e2e    # browser test of the whole loop (set E2E_BASE_URL to test a running app, e.g. via Docker Agent)
```

CI runs the browser test twice: once with the loop in-process, and once with chat going through `docker agent serve chat` and the MCP server.

## Memory vault

The vault lives in `data/vault` (set `VAULT_DIR` to change it) and opens directly in Obsidian. Folders: `Profile`, `Goals`, `Reflections`, `Tasks` (plus `Plans` and `Daily`, planned). Each note records whether it is `user-stated`, `ai-inferred`, or `verified`.

## License

Apache-2.0. See [LICENSE](LICENSE).
