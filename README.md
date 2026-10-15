# FutureMe AI

Meet the person you're becoming. Start building that future today.

FutureMe is a personal AI companion for the Nebius × NVIDIA Global AI Hackathon 2026 (Personal AI track). It lets you talk with a personalized version of your future self, keeps an Obsidian-compatible Markdown memory vault you control, and turns reflection into approved goals and tasks.

> **Status:** Milestones 1–3, streaming, a demo seed and the full workspace UI. Only what is listed under "Working today" runs. Everything else is planned.

## Working today

The app is a signed-in workspace (no landing page). Old links (`/chat`, `/plan`, `/future`) redirect to the new screens.

1. **Onboarding** (`/onboarding`): three short steps (ambition and horizon year, where you are now, values and coaching style). Saved to SQLite and written to the vault as `Profile`, `10-Year Dream` and `Values` notes. "Explore with demo data" skips it.
2. **Home** (`/`): today's next step from your active milestone, an opening line from your future self, an agent panel (tools, readable files, latest actions), trajectory per milestone, recent memories and activity. Every number is counted from your tasks.
3. **Future Self** (`/future-self`): the conversation. Replies stream, tool calls show as they run (memory search, plan drafting), recalled notes are cited and linked, and proposals appear inline as approval cards you can review, edit (plans), approve or reject. After approval the card checks the new records exist before saying they were created. Tone can be changed per conversation; failed turns can be retried; replies can be copied.
4. **Future Reflection** (`/reflection`): an imagined letter from your future self, read as chapters (keyboard arrows work). Insights can become a goal prompt or be saved to memory, labelled as AI interpretation.
5. **Memory Vault** (`/memory`, `/memory/[id]`): search, filter by type, provenance and tag, a graph of real wiki-links and milestone links, create, edit, delete (with confirmation). Each note shows why it exists and whether you said it or the AI inferred it.
6. **Life Roadmap** (`/roadmap`): long-term goal, milestones as a timeline, tasks with status, due dates and dependencies, blockers and upcoming deadlines, plus any plan waiting for approval.
7. **FutureMe Daily** (`/daily`): a magazine edition of your week. Edition history, section filters, a reading view, mark useful (kept on this device), save an insight to memory, turn a story into an action, and links to every source record. Everything comes from completed tasks, goals or saved notes.
8. **Skills and Actions** (`/skills`): Plan My Day, Break Down My Goal, Weekly Review, Prepare an Action Plan and Research and Summarize. Each lists its permissions; runs show ready, running, waiting for approval, completed or failed, and anything that would create records goes through an approval card.
9. **Agent** (`/agent`): the agent's control room. Its real tools (`search_memory`, `propose_plan`, `propose_memory`) with what each can read or write, whether it runs on its own or needs approval, and how often it was used; web search is shown as not connected. File access lists the vault's Markdown files by folder and whether the agent can read each one. Also the approval queue, the actions it can run, and a log of every tool call, action run and decision, built only from recorded data.
10. **Voice Twin** (`/twin`, server only): the first two phases of the voice twin. See [Voice twin](#voice-twin) below.
11. **Settings** (`/settings`): profile, coaching style, theme (dark, light, system), motion, density, memory controls, data mode, and what runs where.

Plus a command palette (`⌘K`, and `g` then `h/f/a/t/r/m/d/s` to jump), dark and light themes, reduced-motion support and layouts down to phone width.

## Voice twin

The twin is your future self speaking for you, in your own voice. Phases 0 and 1 are built: the guardrails and your voice. Placing calls and sending emails come next, so nothing reaches anyone yet.

**Your voice (ElevenLabs).** Needs `ELEVENLABS_API_KEY` on the server.

1. You read a consent phrase with three random code words aloud, within ten minutes. ElevenLabs speech-to-text must hear every code word and "agree", so an old recording of someone else can't pass.
2. That same recording is the first sample of an instant clone, plus up to five samples you record. The voice that agreed is the voice that's cloned.
3. "Hear yourself" plays a line in your cloned voice.
4. The professional upgrade trains a closer voice from the same recordings after you read ElevenLabs' own verification CAPTCHA aloud. When it's ready, the instant clone is deleted, so one voice remains.
5. "Delete my voice" deletes every clone at ElevenLabs and every recording on the server, and withdraws the consent.

Recordings are kept in `data/voice/` (or `TWIN_DATA_DIR`) and go only to ElevenLabs.

**Guardrails.** A `twin` agent in `agents/futureme.yaml` gets `search_memory` plus three propose-only MCP tools: `propose_call`, `propose_email` and `propose_commitment`. Each creates a pending approval (`outbound_call`, `send_email`, `commitment`) shown on `/twin`, never in the plan and memory queue.

- It can only reach contacts you added on `/twin`.
- Every call opens with a fixed line saying it's your AI twin and that the call may be recorded; every email starts with an AI disclosure and ends with the twin's signature. The app adds these, not the model.
- It never agrees for you: requests become `commitment` approvals, and an approved one is filed in the vault under `Plans/`.
- At most 10 proposed calls and 50 proposed emails a day.
- The kill switch on `/twin` pauses it: no proposals and no approvals until you resume.
- Approved calls and emails are saved in the `calls` and `email_threads` tables with status `approved`, waiting for the dialler and sender.

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
                │                         └─ MCP: mcp/futureme-server.ts (search_memory, propose_memory, propose_plan)
                │                                         │
                └──────── SQLite (goals, tasks, approvals, tool log) + Markdown vault ◄──┘
```

- The app sends each chat turn, with your profile as a system message, to Docker Agent's OpenAI-compatible endpoint.
- Docker Agent runs the agent loop and calls FutureMe's MCP tools. Every tool call is logged, so the app can show what the agent remembered and proposed.
- The future-story letter is a single model call made by the app directly.
- Without `DOCKER_AGENT_URL`, the same loop runs in-process (used by unit tests).
- Without a Nebius key, a built-in stand-in model keeps everything runnable (`LLM_PROVIDER=mock`, or `npm run mock-model` plus `--flavor mock` for Docker Agent).

## Limitations

- On the server, tasks can only be marked done (no in-progress or blocked status, no editing), and memories can't be archived or hidden from recall. The UI hides those controls there; demo mode has them.
- Research and Summarize has no web search tool on the server yet, so it's shown as unavailable. In demo mode it returns a clearly labelled illustrative result. Daily's "Signals" section is illustrative in demo mode and empty on the server.
- Skill run history and "mark useful" on Daily are kept in this browser, not the database.
- Without a Nebius key, replies come from the built-in stand-in model and the UI says so.

## Planned

Voice twin Phases 2 to 4 (talking to your twin by browser and phone, then calls and email to your contacts, then public-launch hardening), trend sourcing for FutureMe Daily, avatars and VR.

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
