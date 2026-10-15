# FutureMe AI

Meet the person you're becoming. Start building that future today.

FutureMe is a personal AI companion for the Nebius × NVIDIA Global AI Hackathon 2026 (Personal AI track). It lets you talk with a personalized version of your future self, keeps an Obsidian-compatible Markdown memory vault you control, and turns reflection into approved goals and tasks.

> **Status:** Milestones 1–3, streaming, a demo seed and the full workspace UI. Only what is listed under "Working today" runs. Everything else is planned.

## Working today

The app is a signed-in workspace (no landing page). Old links (`/chat`, `/plan`, `/future`) redirect to the new screens.

1. **Onboarding** (`/onboarding`): three short steps (ambition and horizon year, where you are now, values and coaching style). Saved to SQLite and written to the vault as `Profile`, `10-Year Dream` and `Values` notes. "Explore with demo data" skips it.
2. **Home** (`/`): today's next step from your active milestone, an opening line from your future self, the night shift's morning brief when it ran in the last day, an agent panel (tools, readable files, latest actions), trajectory per milestone, recent memories and activity. Every number is counted from your tasks.
3. **Future Self** (`/future-self`): the conversation. Replies stream, tool calls show as they run (memory search, plan drafting), recalled notes are cited and linked, and proposals appear inline as approval cards you can review, edit (plans), approve or reject. After approval the card checks the new records exist before saying they were created. Tone can be changed per conversation; failed turns can be retried; replies can be copied. After each reply the fact checker agent checks its claims against your notes and marks them supported (with the note), unverified or opinion.
4. **Future Reflection** (`/reflection`): an imagined letter from your future self, read as chapters (keyboard arrows work). Insights can become a goal prompt or be saved to memory, labelled as AI interpretation.
5. **Memory Vault** (`/memory`, `/memory/[id]`): search, filter by type, provenance and tag, a graph of real wiki-links and milestone links, create, edit, delete (with confirmation). Each note shows why it exists and whether you said it or the AI inferred it.
6. **Life Roadmap** (`/roadmap`): long-term goal, milestones as a timeline, tasks with status, due dates and dependencies, blockers and upcoming deadlines, plus any plan waiting for approval.
7. **FutureMe Daily** (`/daily`): a magazine edition of your week. Edition history, section filters, a reading view, mark useful (kept on this device), save an insight to memory, turn a story into an action, and links to every source record. Everything comes from completed tasks, goals or saved notes.
8. **Skills and Actions** (`/skills`): Plan My Day, Break Down My Goal, Weekly Review, Prepare an Action Plan and Research and Summarize. On the server, research runs the research agent with real web search and page reading; it keeps only links its tools actually returned and proposes the summary as an AI-labelled note in `Research/`. Each lists its permissions; runs show ready, running, waiting for approval, completed or failed, and anything that would create records goes through an approval card.
9. **Council** (`/council`): ask one decision of four future selves (you at your horizon, you next year, a skeptic and a mentor). They answer in parallel, each reading your notes, and a chair agent merges them into a decision brief with agreements, tensions and a next step you can turn into a plan or save to the vault.
10. **Agent** (`/agent`): the agent's control room. The team of agents from `agents/futureme.yaml` and the tools each may call; the real tools (`search_memory`, `propose_plan`, `propose_memory`, `web_search`, `fetch_url`) with what each can read or write, whether it runs on its own or needs approval, and how often it was used. The night shift (last brief, tomorrow's focus, schedule, Run now), research runs with their sources, the persona pack chooser, and where the model runs. File access lists the vault's Markdown files by folder and whether the agent can read each one. Also the approval queue, the actions it can run, and a log of every tool call, action run and decision, built only from recorded data.
11. **Settings** (`/settings`): profile, coaching style, theme (dark, light, system), motion, density, memory controls, data mode, and what runs where.

Plus a command palette (`⌘K`, and `g` then `h/f/a/c/r/m/d/s` to jump), dark and light themes, reduced-motion support and layouts down to phone width.

## Interface and data modes

The UI talks to a typed service layer (`src/lib/services/types.ts`) with two implementations:

- **Server** (`live-service.ts`): `GET/POST /api/workspace` for the workspace snapshot and mutations, and `POST /api/chat` for streamed turns. Used when the FutureMe server answers.
- **Demo** (`src/mocks/`): a deterministic example workspace (Hodan in Hargeisa, building an SMS crop-advice assistant) kept in this browser's local storage. Replies are scripted, never a model, and are labelled "Demo" everywhere.

Settings → Data mode chooses Automatic (server if reachable, otherwise demo), Demo data, or Server. Demo data can be reset or cleared from Settings. API keys only ever live on the server; the browser never sees one.

Design: "Editorial Futurism". A warm ivory and paper theme by default (obsidian and graphite in dark mode), obsidian ink for the main action, citron for progress and copper for AI interpretation, with ambient light, an animated dashboard and staggered motion that switches off under reduced motion. Geist for the interface, Instrument Serif for display and Newsreader for reading. Primitives are shadcn-style components on Radix (`src/components/ui`), icons from Lucide, motion from Motion, forms from React Hook Form with Zod.

## How it fits together

```
Browser ── Next.js app ──► docker agent serve chat (agents/futureme.yaml) ──► Nemotron on Nebius Token Factory
                │                         │
                │                         └─ MCP: mcp/futureme-server.ts (search_memory, propose_memory, propose_plan, web_search, fetch_url)
                │                                         │
                └──────── SQLite (goals, tasks, approvals, tool log) + Markdown vault ◄──┘
```

- The app sends each chat turn, with your profile as a system message, to Docker Agent's OpenAI-compatible endpoint.
- Docker Agent runs the agent loop and calls FutureMe's MCP tools. Every tool call is logged, so the app can show what the agent remembered and proposed.
- `agents/futureme.yaml` is a team: `root` (the future self), `council` with four voice sub-agents, `council_chair`, `verifier`, `researcher` and `night_shift`. Docker Agent exposes each one as a model, and each gets only the MCP tools its job needs (the future self never browses; the researcher can't write plans).
- The future-story letter is a single model call made by the app directly.
- Without `DOCKER_AGENT_URL`, the same loop runs in-process (used by unit tests).
- Without a Nebius key, a built-in stand-in model keeps everything runnable (`LLM_PROVIDER=mock`, or `npm run mock-model` plus `--flavor mock` for Docker Agent).

## Limitations

- On the server, tasks can only be marked done (no in-progress or blocked status, no editing), and memories can't be archived or hidden from recall. The UI hides those controls there; demo mode has them.
- Web research needs outbound internet. It uses DuckDuckGo's HTML page by default (best effort; it can rate-limit) or Brave Search with `BRAVE_SEARCH_API_KEY`. In demo mode it is unavailable. Daily's "Signals" section is illustrative in demo mode and empty on the server.
- Skill run history and "mark useful" on Daily are kept in this browser, not the database.
- Without a Nebius key, replies come from the built-in stand-in model and the UI says so.

## Planned

Trend sourcing for FutureMe Daily, voice, avatars and VR.

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

## Agent team features

- **Night shift.** `npm run night-shift` runs it once; `npm run night-shift -- --loop` runs it every day at `NIGHT_SHIFT_AT` (server time, default `05:30`). The Docker image starts the loop for you; set `NIGHT_SHIFT_AT=off` to disable it. It publishes the Daily, writes a morning brief, picks up to three real open tasks as tomorrow's focus, and can propose a plan, which waits for approval.
- **Persona packs.** `agents/packs/*.yaml` are standalone Docker Agent files. Choose one on the Agent page and its persona shapes every future-self reply. Share them through any OCI registry:

  ```bash
  npm run pack -- push founder docker.io/<you>/futureme-founder:1.0
  npm run pack -- pull docker.io/<them>/futureme-founder:1.0      # saved to agents/packs/founder.yaml
  docker agent run agents/packs/founder.yaml                       # or talk to it in the terminal
  ```

  The app only reads a pulled pack's persona paragraph and never runs the file. Check a pulled pack's toolsets before running it yourself.
- **Private local mode.** Run the model on your own machine with Docker Model Runner, so no conversation leaves it:

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
  ```

  Outside Docker, `LLM_PROVIDER=local` (with `LOCAL_LLM_URL`, default `http://localhost:12434/engines/v1`, and `LOCAL_MODEL`, default `ai/qwen3`) points the app at Model Runner, and `docker agent run agents/futureme.yaml --flavor local` does the same for Docker Agent.

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

CI runs the browser test twice: once with the loop in-process, and once with chat going through `docker agent serve chat` and the MCP server. A third job loads every agent file with Docker Agent and pushes and pulls a persona pack through a throwaway OCI registry.

## Memory vault

The vault lives in `data/vault` (set `VAULT_DIR` to change it) and opens directly in Obsidian. Folders: `Profile`, `Goals`, `Reflections`, `Tasks`, `Research` and `Daily`. Each note records whether it is `user-stated`, `ai-inferred`, or `verified`.

## License

Apache-2.0. See [LICENSE](LICENSE).
