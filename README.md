# FutureMe AI

Meet the person you're becoming. Start building that future today.

FutureMe is a personal AI companion for the Nebius × NVIDIA Global AI Hackathon 2026 (Personal AI track). It lets you talk with a personalized version of your future self, keeps an Obsidian-compatible Markdown memory vault you control, and turns reflection into approved goals and tasks.

> **Status:** Milestones 1–3, streaming, a demo seed and the full workspace UI. Only what is listed under "Working today" runs. Everything else is planned.

## Working today

The app is a signed-in workspace (no landing page). Old links (`/chat`, `/plan`, `/future`) redirect to the new screens.

1. **Onboarding** (`/onboarding`): three short steps (ambition and horizon year, where you are now, values and coaching style). Saved to SQLite and written to the vault as `Profile`, `10-Year Dream` and `Values` notes. "Explore with demo data" skips it.
2. **Home** (`/`): today's next step from your active milestone, an opening line from your future self, the night shift's morning brief when it ran in the last day, an agent panel (tools, readable files, latest actions), trajectory per milestone, recent memories and activity. Every number is counted from your tasks.
3. **Future Self** (`/future-self`): the conversation. Replies stream, tool calls show as they run (memory search, plan drafting), recalled notes are cited and linked, and proposals appear inline as approval cards you can review, edit (plans), approve or reject. After approval the card checks the new records exist before saying they were created. Tone can be changed per conversation; failed turns can be retried; replies can be copied. After each reply the fact checker agent checks its claims against your notes and marks them supported (with the note), unverified or opinion. When a question needs focused work, the future self can hand it off (to the researcher, the council, or a helper it creates on the spot), and the reply shows who did it, with which tools, and the supervisor's verdict.
4. **Future Reflection** (`/reflection`): an imagined letter from your future self, read as chapters (keyboard arrows work). Insights can become a goal prompt or be saved to memory, labelled as AI interpretation.
5. **Memory Vault** (`/memory`, `/memory/[id]`): search, filter by type, provenance and tag, a graph of real wiki-links and milestone links, create, edit, delete (with confirmation). Each note shows why it exists and whether you said it or the AI inferred it.
6. **Life Roadmap** (`/roadmap`): long-term goal, milestones as a timeline, tasks with status, due dates and dependencies, blockers and upcoming deadlines, plus any plan waiting for approval.
7. **FutureMe Daily** (`/daily`): a magazine edition of your week. Edition history, section filters, a reading view, mark useful (kept on this device), save an insight to memory, turn a story into an action, and links to every source record. Everything comes from completed tasks, goals or saved notes.
8. **Skills and Actions** (`/skills`): Plan My Day, Break Down My Goal, Weekly Review, Prepare an Action Plan and Research and Summarize. On the server, research runs the research agent with real web search and page reading; it keeps only links its tools actually returned and proposes the summary as an AI-labelled note in `Research/`. Each lists its permissions; runs show ready, running, waiting for approval, completed or failed, and anything that would create records goes through an approval card.
9. **Council** (`/council`): ask one decision of four future selves (you at your horizon, you next year, a skeptic and a mentor). They answer in parallel, each reading your notes, and a chair agent merges them into a decision brief with agreements, tensions and a next step you can turn into a plan or save to the vault.
10. **Agent** (`/agent`): the agent's control room. The team of agents from `agents/futureme.yaml` and the tools each may call; the supervisor log (every handoff and mission task with its verdict); the real tools (`search_memory`, `propose_plan`, `propose_memory`, `web_search`, `fetch_url`, `delegate_task`, `spawn_agent`) with what each can read or write, whether it runs on its own or needs approval, and how often it was used. The night shift (last brief, tomorrow's focus, schedule, Run now), research runs with their sources, the persona pack chooser, and where the model runs. File access lists the vault's Markdown files by folder and whether the agent can read each one. Also the approval queue, the actions it can run, and a log of every tool call, action run and decision, built only from recorded data.
11. **Missions** (`/missions`): give the team one goal. A mission lead splits it into 2 to 4 tasks, a helper agent works on each at the same time with only the read-only tools it needs, the supervisor reviews every result, and the lead writes one report from the accepted results. Any plan it proposes waits for your approval. Each task shows its tools, output and the supervisor's notes; blocked results are left out of the report.
12. **Voice Twin** (`/twin`, server only): your cloned voice, the twin's guardrails, and calls with your future self, and calls and email to your contacts once you approve. See [Voice twin](#voice-twin) below.
13. **Settings** (`/settings`): profile, coaching style, theme (dark, light, system), motion, density, memory controls, data mode, and what runs where.

Plus a command palette (`⌘K`, and `g` then `h/f/a/t/c/i/r/m/d/s` to jump), dark and light themes, reduced-motion support and layouts down to phone width.

## Voice twin

The twin is your future self speaking for you, in your own voice. Phases 0 to 4 are built: the guardrails, your voice, talking to your twin in the browser or on your own phone, reaching your contacts by phone and email once you approve, and the safeguards for running it on a public address.

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
- Approving a call or an email is your go: it's placed or sent right away. If that fails, the card says why and offers "Try again".

**Talk to your twin.** Needs `TWIN_PUBLIC_URL` (FutureMe's public https address) as well as the key.

- ElevenLabs runs the call: speech-to-text, your cloned voice (Flash v2.5) and turn-taking. For each reply it calls FutureMe as a custom LLM at `/api/twin/llm/v1/chat/completions`, which runs the `twin_voice` agent from `agents/futureme.yaml`, so the voice on the call is the same future self, with your memory. FutureMe creates and updates the ElevenLabs agent itself.
- Every request must carry a secret header (`TWIN_LLM_SECRET`, or one generated and stored). Each call also has its own random `call_ref`, so a request can only speak as a call FutureMe started, and only while it's live.
- **In the browser:** "Call now" on `/twin` (or "Call your future self" on Home) starts a WebRTC call with a short-lived token from the server. The agent requires that token, so no one else can start a conversation with your voice.
- **On your phone:** set `ELEVENLABS_PHONE_NUMBER_ID` to a Twilio number imported into ElevenLabs. You add your number, FutureMe calls it and reads a six-digit code, and you type the code in. The twin only ever calls that verified number, at most 6 times a day.
  - **Call From the Future:** your future self calls about a topic you pick, now or at a time you schedule.
  - **Promise Keeper:** your future self calls about one open task. If you say you did it, its `confirm_task_done` tool marks that task done (it works only for that call's own task, during the call); if not, you pick the next small step together.
- Every call opens with a fixed line saying it's an AI and, on the phone, that it's recorded. Pausing the twin stops replies mid-call and stops dialling.
- When a call ends, its transcript and ElevenLabs' summary (marked as written by AI) are filed in the vault under `Calls/` and linked from the call log on `/twin`.
- `scripts/twin-scheduler.ts --loop` dials scheduled calls and files transcripts every 30 seconds. The Docker image runs it when `ELEVENLABS_API_KEY` is set (`TWIN_SCHEDULER=off` disables it); locally, run `npm run twin-scheduler -- --loop`.

**Reach your contacts.** Calls need `ELEVENLABS_PHONE_NUMBER_ID`; email needs `AGENTMAIL_API_KEY`.

- **Calls to contacts:** an approved call dials right away. At dial time the kill switch, the daily limit and the contact's number are checked again; if the number changed since you approved, the call isn't placed. These calls run the `twin_proxy` agent, which has no memory search and only `propose_commitment`, so nothing from your vault can leak to the other person. It opens with the fixed AI line, says why it's calling, takes messages and never agrees to anything itself.
- **Call Screen:** calls to the twin's Twilio number are answered as your AI twin: it says it's an AI and that the call is recorded, asks who's calling and why, and files the message under `Calls/`. Block a number from the call log. A paused twin, a blocked number, or more than 30 calls a day get a one-line goodbye. Assign the same Twilio number to the twin's agent in ElevenLabs. FutureMe turns on its initiation webhook (`/api/twin/inbound`, with the secret header) when it creates or updates the agent.
- **Time Capsule Voicemail:** record a message to yourself and pick a date between an hour and two years ahead. Only the transcript is kept, never the recording, and your future self reads it back on a call to your verified phone on that day.
- **Email:** the twin gets its own AgentMail inbox ("Create its inbox" on `/twin`, or `AGENTMAIL_INBOX_ID`), so it never writes as you. Approved emails go out from that address with you cc'd (add your address on `/twin`). To receive mail, point an AgentMail webhook for `message.received` at `/api/twin/email` and set `AGENTMAIL_WEBHOOK_SECRET`; requests without a valid Svix signature are refused. Received mail is filed under `Inbox/`. Mail from a contact gets a drafted reply, threaded to that message, waiting for your approval; the email is treated as untrusted text, and mail from anyone else is only filed.

**Running it publicly (Phase 4).** Before you put FutureMe on a public address:

- **Lock the app.** `TWIN_PUBLIC_URL` must be reachable from the internet, so set `FUTUREME_ACCESS_CODE`. Every page and API then asks for that code (`/login`, a 30-day cookie, five wrong tries per 15 minutes). Only the three webhooks stay open, and each checks its own secret or signature. `/twin` shows a warning while the twin is public and the app isn't locked.
- **Calling rules.** The twin calls only numbers in the countries it knows (narrow them with `TWIN_CALL_COUNTRIES`, like `US,GB,SO`), never premium-rate numbers, and calls contacts only between 8 am and 9 pm in every time zone of their country (`TWIN_CALL_HOURS`, US numbers use the four mainland zones). An approved call outside those hours stays on its card to place later.
- **Recording consent.** If someone on a call doesn't want to be recorded, the twin calls its `stop_recording` tool: nothing of that call is kept, and its conversation is deleted at ElevenLabs.
- **Retention.** What other people said is deleted after `TWIN_RETENTION_DAYS` (30): transcripts and notes of calls with contacts and callers, their recordings at ElevenLabs (also set as the agent's own retention), and mail the twin received, here and at AgentMail. Your calls with your future self stay in your notes. The scheduler runs this.
- **Export and delete.** Settings, "Voice twin data": download everything the twin holds as JSON (secrets left out), or delete it all here and at ElevenLabs and AgentMail. Your goals, memories and other notes stay.
- **Cost cap.** The twin estimates this month's spending (`TWIN_COST_PER_MINUTE`, default $0.10; `TWIN_COST_PER_EMAIL`, default $0.001) and stops calling and emailing at `TWIN_MONTHLY_BUDGET` (default $20). The meter is in the rail on `/twin`.
- **Review queue.** "Needs a look" on `/twin` lists what the twin refused: someone it tried to reach who isn't a contact, hit limits, a blocked or repeat caller, mail that tries to give it orders (no reply is drafted), and requests with a wrong secret. Block a number or dismiss each item.
- **Before launch:** have a lawyer review the opener, recording consent and retention for each country you call. This is an engineering reading of the rules, not legal advice.

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
                │                         └─ MCP: mcp/futureme-server.ts (search_memory, propose_memory, propose_plan, web_search, fetch_url, delegate_task, spawn_agent)
                │                                         │
                └──────── SQLite (goals, tasks, approvals, tool log) + Markdown vault ◄──┘
```

- The app sends each chat turn, with your profile as a system message, to Docker Agent's OpenAI-compatible endpoint.
- Docker Agent runs the agent loop and calls FutureMe's MCP tools. Every tool call is logged, so the app can show what the agent remembered and proposed.
- `agents/futureme.yaml` is a team: `root` (the future self), `council` with four voice sub-agents, `council_chair`, `verifier`, `researcher`, `helper_memory`, `helper_web`, `mission_lead`, `supervisor` and `night_shift`. Docker Agent exposes each one as a model, and each gets only the MCP tools its job needs (the future self never browses; the researcher can't write plans).
- The future-story letter is a single model call made by the app directly.
- Without `DOCKER_AGENT_URL`, the same loop runs in-process (used by unit tests).
- Without a Nebius key, a built-in stand-in model keeps everything runnable (`LLM_PROVIDER=mock`, or `npm run mock-model` plus `--flavor mock` for Docker Agent).

## Limitations

- On the server, tasks can only be marked done (no in-progress or blocked status, no editing), and memories can't be archived or hidden from recall. The UI hides those controls there; demo mode has them.
- Web research needs outbound internet. It uses DuckDuckGo's HTML page by default (best effort; it can rate-limit) or Brave Search with `BRAVE_SEARCH_API_KEY`. In demo mode it is unavailable. Daily's "Signals" section is illustrative in demo mode and empty on the server.
- Skill run history and "mark useful" on Daily are kept in this browser, not the database.
- Without a Nebius key, replies come from the built-in stand-in model and the UI says so.

## Planned

Voice twin Twin-to-Twin calls (it needs more than one FutureMe user), trend sourcing for FutureMe Daily, avatars and VR.

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

- **Handoffs.** The future self has two tools for work it shouldn't do alone. `delegate_task` gives a task to the researcher or the council. `spawn_agent` creates a temporary helper with a role and a subset of read-only tools (`search_memory`, `web_search`, `fetch_url`); it runs as `helper_memory` or `helper_web` from `agents/futureme.yaml`. Helpers can't save anything, propose plans or hand off again. The tools run inside the MCP server, which calls Docker Agent back for the helper (it needs `DOCKER_AGENT_URL`, which `scripts/start.sh` sets), so the same code works with and without Docker Agent. Every run is stored in `agent_runs`.
- **Supervisor.** Every handoff and mission task is reviewed before its result is passed on. Rule checks in code block empty answers and tools the helper wasn't given (in-process, where tool logs are exact per run), and flag links its tools never returned, notes that don't exist and claims to have saved or sent something. Then the `supervisor` agent judges whether the result did its task. The stricter verdict wins; a blocked result is never shown to the agent that asked.
- **Missions.** One mission runs at a time, in the background, and the page follows it live. The lead plans, helpers work in parallel, the supervisor reviews each, and the lead reports from accepted results only. A mission still running after 15 minutes is marked failed. In demo mode a scripted mission plays back in the browser, labelled as demo.

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

- **Docker MCP tools.** The future self can use tools from Docker's MCP catalog through the Docker MCP Gateway (Docker Desktop's MCP Toolkit), each running in its own container. Read-only tools run on their own; anything that changes something waits for your approval on the Agent page. Optional: set `DOCKER_MCP_GATEWAY_URL=http://localhost:8811/mcp` after `docker mcp gateway run --transport streaming --port 8811`. Setup, Windows notes and Compose: [docs/docker-mcp.md](docs/docker-mcp.md).

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
