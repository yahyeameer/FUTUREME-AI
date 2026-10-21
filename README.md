<div align="center">

<img src="docs/screenshots/logo.png" alt="FutureMe" width="360" />

### Meet the person you're becoming. Then let them help you get there.

A personal AI that talks to you as **your future self**, remembers your life in a vault you own, runs a **team of Nemotron agents** while you sleep, and can even **call you in your own cloned voice**.

[![NVIDIA Nemotron](https://img.shields.io/badge/NVIDIA-Nemotron--3.5--Super--VL-76B900?logo=nvidia&logoColor=white)](#-nemotron-native-not-just-a-chat-endpoint)
[![Nebius Token Factory](https://img.shields.io/badge/Nebius-Token%20Factory%20us--north1-0B1F3A)](#-deploy-it)
[![Docker Agent](https://img.shields.io/badge/Docker-Agent%20%2B%20MCP-2496ED?logo=docker&logoColor=white)](#-the-agent-works-on-its-own)
[![Next.js](https://img.shields.io/badge/Next.js-App%20Router-000000?logo=nextdotjs&logoColor=white)](#-under-the-hood)
[![Obsidian vault](https://img.shields.io/badge/Memory-Obsidian%20vault-7C3AED?logo=obsidian&logoColor=white)](#memory-vault)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue)](LICENSE)

**Nebius × NVIDIA Global AI Hackathon 2026 · Personal AI track**

[What it is](#-what-it-is) · [Voice twin](#-the-standout-your-voice-twin) · [Agents](#-the-agent-works-on-its-own) · [Nemotron](#-nemotron-native-not-just-a-chat-endpoint) · [Features](#-every-feature) · [Deploy](#-deploy-it) · [What's next](#-whats-next)

<br/>

<img src="docs/screenshots/home-dark.png" alt="FutureMe home in dark mode" width="900" />

</div>

---

## ✨ What it is

Most AI assistants answer the question you just asked. FutureMe starts from the question you rarely ask: **who do you want to be in ten years, and what do you do this week to get there?**

You describe your ambition once. FutureMe builds a version of you from that horizon year, grounded only in what you've actually told it, and that future self:

- 💬 **talks with you** about today's decisions, citing the notes it remembered,
- 🗺️ **turns talk into a plan** (goals, milestones, tasks), but only after you approve,
- 🌙 **keeps working when you don't**: a night shift writes your morning brief, a council of four future selves debates your hard decisions, missions split a big goal across helper agents,
- 📞 **calls you in your own voice** to check whether you kept your promise,
- 🔐 **never acts behind your back**: every change, call, email and commitment waits on an approval card.

> **Why this has potential.** Coaching, accountability and planning help people most when they're personal and continuous, and that's exactly what's expensive. FutureMe makes it personal (your values, your words, your voice), continuous (agents that run on a schedule and call you), and trustworthy (local-first Markdown memory, provenance on every note, approval for every action). It's built for people who can't hire a coach: the demo persona is Hodan in Hargeisa, building an SMS crop-advice tool for farmers.

<div align="center">
<img src="docs/screenshots/future-self-chat.png" alt="Chat with your future self" width="900" />
<br/><sub><b>Future Self.</b> Replies stream, tool calls show as they run, recalled notes are cited, and the plan waits as an approval card.</sub>
</div>

---

## 🎙️ The standout: your voice twin

> Your future self, speaking **in your own cloned voice**, on a call in your browser or on your real phone. Every word on the call is written live by **Nemotron**, with your memory.

<div align="center">
<img src="docs/screenshots/voice-twin.png" alt="Voice twin page" width="900" />
</div>

| | What it does |
| --- | --- |
| 🗣️ **Clone your voice, with proof of consent** | You read a consent phrase with three random code words aloud within ten minutes. Speech-to-text must hear every code word and "agree". That same recording is the first sample of the clone, so **only the voice that agreed can be cloned**. "Hear yourself" plays a line back; "Delete my voice" removes every clone and recording. |
| 📞 **Call From the Future** | Your future self calls you about a topic you pick, now or at a time you schedule. |
| ✅ **Promise Keeper** | Your future self calls about one open task. Say you did it and its `confirm_task_done` tool marks that task done; if not, you pick the next small step together. |
| ⏳ **Time Capsule Voicemail** | Record a message to yourself for a date between an hour and two years ahead. Only the transcript is kept, and your future self reads it back on a call that day. |
| 🛡️ **Call Screen** | Calls to the twin's number are answered as your AI twin: it says it's an AI, asks who's calling and why, and files the message in your vault under `Calls/`. Block numbers from the call log. |
| 👥 **Reach your contacts** | The twin proposes calls and emails to people **you** added. Approve and it dials or sends. Contact calls run a separate `twin_proxy` agent with **no memory search**, so nothing from your vault leaks. It takes messages and never agrees to anything for you. |
| ✉️ **Its own inbox** | The twin gets an AgentMail address, so it never writes as you. Incoming mail from a contact gets a drafted reply waiting for approval; mail is treated as untrusted text. |
| 🎛️ **Voice engine picker** | Paste a key in the app, press **Test** to hear a line, and pick the engine. Keys are AES-256-GCM encrypted and only the last four characters are ever shown. |

**Voice engines** (picked on `/twin`):

| Engine | Clones your voice | Live calls |
| --- | --- | --- |
| **ElevenLabs** | Instant and professional clones | ✅ |
| **OpenRouter** | With a reference-audio model such as `fish-audio/s2.1-pro`: your consent recording goes with each request, nothing is enrolled. Other models use preset voices. | — |
| **Qwen TTS** (Alibaba Model Studio) | Your consent recording is enrolled for `qwen3-tts-vc` | — |
| **Self-hosted** | Preset voices from any OpenAI-style `/audio/speech` server (Qwen3-TTS, Kokoro, Orpheus on Nebius, vLLM or your own box) | — |

**How a call works.** ElevenLabs handles speech-to-text, your cloned voice (Flash v2.5) and turn-taking. For every reply it calls FutureMe as a **custom LLM** at `/api/twin/llm/v1/chat/completions`, which runs the `twin_voice` agent on Nemotron with your memory. So the voice is yours and the words are your future self's. Each call has its own random `call_ref` and a secret header, so nobody else can speak through your voice.

**Guardrails that are code, not prompts.** A fixed AI-disclosure opener on every call and email (added by the app, not the model) · contacts-only · daily limits (10 proposed calls, 50 emails, 6 calls to you) · a kill switch · a monthly cost cap · calling hours per country and no premium-rate numbers · a `stop_recording` tool if someone declines recording · retention of other people's data for 30 days · export or delete all twin data from Settings · an access code that locks the whole app before it goes public.

> ⚠️ **Honest status.** The voice twin is built end to end, covered by unit tests and clicked through in a browser against **mock** ElevenLabs, OpenRouter, Qwen and AgentMail servers. It has **not yet been run against the live services**. Real calls need a paid ElevenLabs key, and phone calls also need a Twilio number imported into ElevenLabs. Treat these paths as ready to try, not proven.

<details>
<summary><b>Full voice twin reference (setup, env vars, public launch checklist)</b></summary>

**Your voice.**

1. You read a consent phrase with three random code words aloud, within ten minutes. Speech-to-text (ElevenLabs, or OpenRouter Whisper) must hear every code word and "agree", so an old recording of someone else can't pass.
2. That same recording is the first sample of the clone (with ElevenLabs, plus up to five samples you record).
3. "Hear yourself" plays a line in your cloned voice.
4. The professional upgrade (ElevenLabs) trains a closer voice after you read ElevenLabs' own verification CAPTCHA aloud. When it's ready the instant clone is deleted, so one voice remains.
5. "Delete my voice" deletes every clone at its engine and every recording on the server, and withdraws the consent. To switch engines, delete your voice and clone it again.

Recordings are converted to WAV in the browser so every engine accepts them, kept in `data/voice/` (or `TWIN_DATA_DIR`), and go only to the engine you picked. A key in the server environment (`ELEVENLABS_API_KEY`, `OPENROUTER_API_KEY`, `DASHSCOPE_API_KEY`) wins over one saved in the app. Keys are encrypted with `FUTUREME_SECRET`, or a random `secret.key` created next to the database. Nebius AI Studio doesn't serve speech models itself; host one on Nebius and use Self-hosted.

**Guardrails.** A `twin` agent in `agents/futureme.yaml` gets `search_memory` plus three propose-only MCP tools: `propose_call`, `propose_email` and `propose_commitment`. Each creates a pending approval (`outbound_call`, `send_email`, `commitment`) shown on `/twin`. It never agrees for you: requests become `commitment` approvals, and an approved one is filed under `Plans/`.

**Talk to your twin** needs `TWIN_PUBLIC_URL` (FutureMe's public https address) and an ElevenLabs key.

- **In the browser:** "Call now" on `/twin` (or "Call your future self" on Home) starts a WebRTC call with a short-lived token.
- **On your phone:** set `ELEVENLABS_PHONE_NUMBER_ID` to a Twilio number imported into ElevenLabs. FutureMe calls your number and reads a six-digit code you type in; the twin only ever calls that verified number.
- When a call ends, its transcript and ElevenLabs' summary (marked as AI-written) are filed under `Calls/`.
- `scripts/twin-scheduler.ts --loop` dials scheduled calls and files transcripts every 30 seconds. The Docker image always runs it (`TWIN_SCHEDULER=off` disables it).

**Reach your contacts.** Calls need `ELEVENLABS_PHONE_NUMBER_ID`; email needs `AGENTMAIL_API_KEY`. At dial time the kill switch, daily limit and the contact's number are checked again. For Call Screen, assign the same Twilio number to the twin's ElevenLabs agent; FutureMe turns on its initiation webhook (`/api/twin/inbound`). To receive mail, point an AgentMail `message.received` webhook at `/api/twin/email` and set `AGENTMAIL_WEBHOOK_SECRET` (Svix signatures are verified).

**Before putting it on a public address:**

- **Lock the app** with `FUTUREME_ACCESS_CODE`: every page and API asks for it (`/login`, 30-day cookie, five wrong tries per 15 minutes). Only the three webhooks stay open, each checking its own secret or signature.
- **Calling rules:** only known countries (`TWIN_CALL_COUNTRIES`, like `US,GB,SO`), never premium-rate numbers, and only 8 am to 9 pm in every time zone of the contact's country (`TWIN_CALL_HOURS`).
- **Retention:** what other people said is deleted after `TWIN_RETENTION_DAYS` (30), here and at ElevenLabs and AgentMail.
- **Cost cap:** `TWIN_MONTHLY_BUDGET` (default $20), estimated from `TWIN_COST_PER_MINUTE` and `TWIN_COST_PER_EMAIL`.
- **Review queue:** "Needs a look" on `/twin` lists everything the twin refused.
- Have a lawyer review the opener, recording consent and retention for each country you call. This is an engineering reading of the rules, not legal advice.

</details>

---

## 🤖 The agent works on its own

FutureMe isn't one chatbot. `agents/futureme.yaml` defines a **team of 17 agents**, each with only the tools its job needs (the future self never browses; the researcher can't write plans). They run on Nemotron in the app, or under [Docker Agent](https://docker.github.io/docker-agent/) with FutureMe's MCP server.

<div align="center">
<img src="docs/screenshots/agent.png" alt="Agent control room" width="900" />
<br/><sub><b>Agent.</b> The control room: the team, every tool and what it may touch, the approval queue, and a log of everything it did.</sub>
</div>

<br/>

| | What runs by itself |
| --- | --- |
| 🌙 **Night shift** | Every day at `NIGHT_SHIFT_AT` (default 05:30) it publishes FutureMe Daily, writes a morning brief, picks up to three real open tasks as tomorrow's focus, and can propose a plan that waits for you. The Docker image starts the loop for you. |
| 🚀 **Missions** | Give the team one goal. A mission lead splits it into 2 to 4 tasks, helper agents work on them **in parallel** with read-only tools, a supervisor reviews every result, and the lead writes one report from accepted results only. |
| 🏛️ **Council** | Ask one decision of four future selves (you at your horizon, you next year, a skeptic, a mentor). They answer in parallel from your notes; a chair agent merges them into a decision brief with agreements, tensions and a next step. |
| 🤝 **Handoffs** | Mid-conversation the future self can `delegate_task` to the researcher or council, or `spawn_agent` a temporary helper with a role and a subset of read-only tools. The reply shows who did it, with which tools, and the supervisor's verdict. |
| 🧑‍⚖️ **Supervisor** | Code rules block empty answers and unauthorized tools and flag invented links, missing notes or claims to have "sent" something; then the `supervisor` agent judges the result. The stricter verdict wins. |
| 🔎 **Fact checker** | After each reply the `verifier` checks its claims against your notes and marks them supported (with the note), unverified or opinion. |
| 🌐 **Web research** | The researcher searches (DuckDuckGo, or Brave with a key) and reads pages, keeps only links its tools actually returned, and proposes an AI-labelled note in `Research/`. Private and metadata addresses are refused. |
| 🐳 **Docker MCP tools** | Through the Docker MCP Gateway, the future self can use tools from Docker's MCP catalog, each in its own container. Read-only tools run on their own; anything that changes something waits for approval. |
| 🗂️ **Memory vault** | Every goal, task, reflection, call and research note is an Obsidian-compatible Markdown file with provenance (`user-stated`, `ai-inferred` or `verified`). The agent searches it with MCP tools and can only *propose* new memories. |
| 🔗 **Connected accounts** | Import your LinkedIn, X and Facebook exports (parsed in your browser, only your profile and your own posts are sent), or fetch a public profile through Apify's MCP server after a one-time ownership code. Your future self learns how you write and quotes your posts with dates. |
| 🎭 **Persona packs** | Standalone Docker Agent files in `agents/packs/`, shareable through any OCI registry (`npm run pack -- push|pull`). |

<table>
<tr>
<td width="50%"><img src="docs/screenshots/missions.png" alt="Missions" /><br/><sub><b>Missions.</b> One goal, a team that splits it up.</sub></td>
<td width="50%"><img src="docs/screenshots/council.png" alt="Council" /><br/><sub><b>Council.</b> One question, four future selves.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/connected-accounts.png" alt="Connected accounts" /><br/><sub><b>Connected Accounts.</b> Your future self learns how you write.</sub></td>
<td width="50%"><img src="docs/screenshots/fact-check.png" alt="Fact check" /><br/><sub><b>Fact check.</b> Every claim checked against your notes.</sub></td>
</tr>
</table>

<div align="center">
<img src="docs/screenshots/docker-mcp.png" alt="Docker MCP tools" width="520" />
<br/><sub><b>Docker MCP.</b> A write tool asked first, was approved, and ran (shown here against the test gateway).</sub>
</div>

---

## 🧠 Nemotron-native, not just a chat endpoint

Every agent runs on **`nvidia/Nemotron-3.5-Super-VL`** on **Nebius Token Factory (`us-north1`)**, and FutureMe uses what the model offers beyond plain chat. See `src/lib/llm.ts` and `src/lib/nemotron.ts`.

| Nemotron capability | Where FutureMe uses it |
| --- | --- |
| **Reasoning on/off per agent** (`chat_template_kwargs.enable_thinking`) | Planners and judges think first (future self, mission lead, council chair, supervisor, night shift, voice twin). Quick ones answer straight away (council voices, verifier, researcher, helpers, live-call agents, so calls stay fast). `NEBIUS_REASONING=on\|off` overrides. |
| **Live reasoning trace** (`reasoning_content`, streamed) | The chat shows "Nemotron is reasoning…" live, and every reply keeps a folded "How I reasoned" section. |
| **Structured outputs** (`response_format: json_schema`) | Council brief, fact check, supervisor verdict, mission plan and report, morning brief, research summary and FutureMe Daily are constrained to a schema. Tool-using agents answer freely, then get one formatting pass. |
| **Parallel tool calling** | When Nemotron asks for several tools in one step, they run in parallel. Up to 10 tool steps per turn. |
| **Vision** (photo input) | Attach a photo in the chat (a whiteboard plan, a workout log). Nemotron reads it, and the photo is kept in the vault's `Photos/` folder. |
| **Long context** | The future self keeps the last 40 messages in view. |
| **Writes every word the voice twin says** | ElevenLabs only speaks; each reply on a call comes from the `twin_voice` agent on Nemotron. |

<table>
<tr>
<td width="50%"><img src="docs/screenshots/nemotron-live-reasoning.png" alt="Nemotron reasoning live over a photo" /><br/><sub>A photo of a whiteboard plan, with Nemotron's reasoning streaming live.</sub></td>
<td width="50%"><img src="docs/screenshots/nemotron-reply-reasoning.png" alt="How I reasoned" /><br/><sub>Every reply keeps its reasoning, folded away.</sub></td>
</tr>
</table>

---

## 🧩 Every feature

<table>
<tr>
<td width="50%"><img src="docs/screenshots/reflection.png" alt="Future Reflection" /><br/><sub><b>Future Reflection.</b> A letter from your future self, read as a magazine issue.</sub></td>
<td width="50%"><img src="docs/screenshots/covers.png" alt="Magazine covers" /><br/><sub>Eleven illustrated covers that change with the plan length.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/roadmap.png" alt="Life Roadmap" /><br/><sub><b>Life Roadmap.</b> Milestones, tasks, dependencies, deadlines.</sub></td>
<td width="50%"><img src="docs/screenshots/memory.png" alt="Memory Vault" /><br/><sub><b>Memory Vault.</b> Search, filters, provenance and a graph of real links.</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/daily.png" alt="FutureMe Daily" /><br/><sub><b>FutureMe Daily.</b> A magazine edition of your week, every item sourced.</sub></td>
<td width="50%" align="center"><img src="docs/screenshots/chat-phone.png" alt="Phone layout" width="220" /><br/><sub>Every screen works down to phone width.</sub></td>
</tr>
</table>

| Screen | What you get |
| --- | --- |
| **Onboarding** `/onboarding` | Three short steps: ambition and horizon year, where you are now, values and coaching style. Written to the vault as `Profile`, `10-Year Dream` and `Values`. Or "Explore with demo data". |
| **Home** `/` | Today's next step, an opening line from your future self, the night shift's morning brief, an agent panel, trajectory per milestone, recent memories. Every number is counted from your tasks. |
| **Future Self** `/future-self` | Streaming chat with live tool calls, cited notes, inline approval cards (review, edit, approve, reject), tone per conversation, retry, photo input, fact check and handoffs. |
| **Future Reflection** `/reflection` | An imagined letter as a five-chapter magazine issue with keyboard and swipe navigation; insights become goals or memories (labelled as AI interpretation). |
| **Memory Vault** `/memory` | Search, filter by type, provenance and tag, a graph of wiki-links, create, edit and delete. Each note shows why it exists. |
| **Life Roadmap** `/roadmap` | Long-term goal, milestones as a timeline, tasks with status, due dates and dependencies, blockers, and plans awaiting approval. |
| **FutureMe Daily** `/daily` | A weekly magazine built only from completed tasks, goals and saved notes, with links to every source. |
| **Skills and Actions** `/skills` | Plan My Day, Break Down My Goal, Weekly Review, Prepare an Action Plan, Research and Summarize. Each lists its permissions; record-creating runs go through approval. |
| **Council** `/council` · **Missions** `/missions` · **Agent** `/agent` | The agent team, described above. |
| **Voice Twin** `/twin` | Your cloned voice, calls, contacts, email and guardrails, described above. |
| **Connected Accounts** `/connections` | Social import and persona, with consent every time, a preview before sending, a before/after comparison and delete at any time. |
| **Settings** `/settings` | Profile, coaching style, theme, motion, density, memory controls, data mode, voice twin data export and delete. |

Plus a command palette (`⌘K`, and `g` then a letter to jump), dark and light themes, and reduced-motion support. Design language: *Editorial Futurism*, with Geist, Instrument Serif and Newsreader, shadcn-style primitives on Radix, and Motion.

<a id="memory-vault"></a>
**Memory vault.** Lives in `data/vault` (`VAULT_DIR` to change it) and opens directly in Obsidian: `Profile`, `Goals`, `Tasks`, `Plans`, `Reflections`, `Research`, `Daily`, `Calls`, `Inbox`, `Social`, `Photos`. Optionally mirrored to Supabase so a new server restores from it ([docs/supabase.md](docs/supabase.md)).

<a id="decision-layer"></a>
**Decision layer (Jev by TypeSafe AI).** In the Future Simulator, "Check these routes" turns a set of roads into a decision. Deterministic rules do every calculation and enforce your budget, hours, risk, debt consent and living-cost runway; [Jev](https://docs.typesafe.ai) then answers narrow, typed questions (values fit, challenge fit, risk handling, a pick asked in both orders) about only the routes that passed. The result is decided, needs your review, abstained, or pending, with every fact's provenance, Jev's confidences, and its cost and latency, and it's kept as an auditable history with what you chose and how it went. Nemotron proposes the routes; it never makes the decision. Optional: set `TYPESAFE_API_KEY` (or save a key in Settings > Decision model); without it you get the rules' checks only. Details, the evaluation and its limits: [docs/decision-layer.md](docs/decision-layer.md).

**Demo mode.** With no server reachable (or by choice in Settings), the whole app runs on a deterministic demo workspace in your browser, clearly labelled "Demo". Without a Nebius key, a built-in stand-in model keeps everything runnable and the UI says so.

---

## 🏗️ Under the hood

```
Browser ─► Next.js app ─┬─► Nemotron team in-process (default) ──────────────┐
                        │                                                     ├─► Nemotron-3.5-Super-VL
                        └─► docker agent serve (agents/futureme.yaml) ────────┘   on Nebius Token Factory
                                     │
                                     └─ MCP: mcp/futureme-server.ts
                                        search_memory · search_social · get_persona · propose_memory
                                        propose_plan · web_search · fetch_url · delegate_task · spawn_agent
                                        propose_call · propose_email · propose_commitment
                                     │
           SQLite (goals, tasks, approvals, tool log, agent runs) + Markdown vault ◄┘

ElevenLabs call ─► /api/twin/llm/v1/chat/completions ─► twin_voice agent on Nemotron
```

- **Default runtime** (`AGENT_RUNTIME=nemotron`): the team runs in the app with all the Nemotron features above. `AGENT_RUNTIME=docker-agent` (or `DOCKER_AGENT_URL`) routes chat through Docker Agent and the MCP server instead.
- **Every tool call is logged**, so the UI shows exactly what the agent remembered, proposed and did.
- **Private local mode:** `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build` runs the model on your own machine with Docker Model Runner, so no conversation leaves it.
- **Two paid model providers:** Nemotron on Nebius for everything generative, and optionally Jev by TypeSafe AI for route decisions (USD 0.042 per million input tokens; a typical decision is a few thousand tokens, well under a cent).
- **Tested:** unit and workflow tests (Vitest), and CI runs the browser end-to-end test twice (in-process and through Docker Agent), loads every agent file, pushes and pulls a persona pack, and smoke-tests the container.

---

## 🚀 Deploy it

One Docker image runs the web app, the night shift and the twin scheduler. Data lives in the `/data` volume. Without `NEBIUS_API_KEY` the app runs on the stand-in model, so the link works from the first minute.

### Quick start (any machine with Docker)

```bash
git clone -b main https://github.com/yahyeameer/FUTUREME-AI.git futureme-ai && cd futureme-ai
cat > .env <<'EOF'
NEBIUS_API_KEY=your-token-factory-key
NEBIUS_BASE_URL=https://api.tokenfactory.us-north1.nebius.com/v1/
NEBIUS_MODEL=nvidia/Nemotron-3.5-Super-VL
SEED_DEMO=1
EOF
docker compose up -d --build        # http://localhost:3000
```

### On Nebius (one script, from Cloud Shell)

[`deploy/nebius-deploy.sh`](deploy/nebius-deploy.sh) creates a firewall and a small CPU VM (2 vCPU, 8 GB, Ubuntu 24.04, static IP). The VM installs Docker, clones the app and starts it by itself. The model runs on Token Factory, so the VM needs no GPU.

1. **Make an SSH key** (on Windows, in PowerShell):
   ```powershell
   ssh-keygen -t ed25519 -C "futureme-nebius"
   Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard
   ```
2. **Open Cloud Shell** from the terminal icon in the [Nebius console](https://console.nebius.com) header. It already has the CLI installed and signed in.
3. **Create the script:** `nano deploy-futureme.sh`, paste [`deploy/nebius-deploy.sh`](deploy/nebius-deploy.sh), and fill in the three `CHANGE ME` lines (`PROJECT_ID`, `VM_USER`, `SSH_PUBKEY`). Save with Ctrl+O, Enter, Ctrl+X.
4. **Run it:** `bash deploy-futureme.sh`. In a minute or two it prints the VM's public IP, the SSH command and the app link.
5. **Wait about 10 minutes** for the build. Watch it with `ssh <user>@<IP>` then `tail -f /var/log/futureme-setup.log`. Open `http://<IP>:3000`.
6. **Add your Token Factory key** on the VM:
   ```bash
   cd ~/futureme-ai && nano .env              # paste after NEBIUS_API_KEY=
   docker compose up -d
   docker compose logs futureme | grep -i "stand-in" || echo "Real model in use"
   ```
7. **HTTPS (recommended):** put Caddy in front using `<IP>.sslip.io` as the hostname, set `FUTUREME_ACCESS_CODE` in `.env`, then remove port 3000 from the `futureme-web` security group. The always-on script below does all of this for you and also runs on a Nebius VM.

<details>
<summary><b>Nebius troubleshooting</b></summary>

| Problem | What to do |
| --- | --- |
| `PermissionDenied` while creating resources | Your account needs at least the `editor` role in the project (Administration → IAM). |
| `security-group create` says "already exists" | You ran the script before. Delete the old group and VM, or rename them in the script. |
| VM creation fails with "not enough resources" | Try `--resources-preset 4vcpu-16gb`, or check quotas. |
| VM creation rejects `security_groups` | Remove that part of `--network-interfaces`, rerun `instance create`, then add the VM to the group in the console (VM page → Actions → Add to security groups). |
| App not up after 15 minutes | `tail -50 /var/log/futureme-setup.log`. Download errors mean the `all-out` rule is missing; out-of-memory means a bigger preset. Retry with `sudo /usr/local/bin/futureme-setup`. |
| `docker` says "permission denied" | Log out and SSH in again (the docker group applies on a new login). |

</details>

### On AWS, always on, with free HTTPS

[`deploy/aws-always-on.sh`](deploy/aws-always-on.sh) is EC2 user data that installs Docker, adds swap, starts the app behind **Caddy with a free Let's Encrypt certificate** at `https://<ip-with-dashes>.sslip.io`, locks it with an access code, and installs a systemd service so it **comes back after crashes and reboots**. It also works on any Ubuntu 22.04/24.04 server (Nebius, DigitalOcean, Hetzner, a home server): run `sudo bash aws-always-on.sh`.

1. **Account and region.** Sign up at [aws.amazon.com/free](https://aws.amazon.com/free) and pick a region near you.
2. **Launch an instance** (EC2 → Instances → Launch instances):

   | Field | Value |
   | --- | --- |
   | Image | Ubuntu Server 24.04 LTS, 64-bit (x86) |
   | Type | **t3.small** (t3.micro works, slower first build) |
   | Key pair | New, ED25519, `.pem` |
   | Network | Auto-assign public IP on; new security group `futureme-web` with SSH (22, My IP), HTTP (80) and HTTPS (443) from anywhere. Don't open 3000. |
   | Storage | **20 GiB gp3** |
   | User data | All of `deploy/aws-always-on.sh`, after filling in the settings at the top |

   ```bash
   NEBIUS_API_KEY="..."        # empty = stand-in model, the demo still works
   ACCESS_CODE="pick-a-code"   # people type this to open the app
   DOMAIN=""                   # empty = free <ip>.sslip.io link
   ```
3. **Give it a fixed address.** EC2 → Elastic IPs → Allocate → Associate with `futureme` → then reboot the instance so it picks up the new address. Your link is the Elastic IP with dashes: `3.91.20.14` → `https://3-91-20-14.sslip.io`.
4. **Check it** after 10 to 15 minutes: the link shows a padlock and asks for the access code; `/daily` shows the demo issue; `http://<ip>:3000` does *not* open; and it survives a reboot. On the server, `cat ~/futureme-url.txt` prints the link.
5. **Change settings later:** `cd ~/futureme-ai && nano .env && sudo systemctl restart futureme`. Update with `git pull && sudo systemctl restart futureme`.

> 💸 Rough cost against AWS credits: t3.small ≈ $20/month including the public IPv4 address and disk. A nicer name is free with DuckDNS: `echo you.duckdns.org | sudo tee /etc/futureme-domain && sudo systemctl restart futureme`.

> 🖥️ **Fully local model:** set `MODEL_MODE="local"` and `LOCAL_MODEL="ai/nemotron-3-nano:4b-q4_K_M"` at the top of the script. Docker Model Runner serves NVIDIA Nemotron 3 Nano on the server itself and nothing leaves it. Needs about 8 GB RAM (t3.small can't).

To enable the voice twin on a deployment, `TWIN_PUBLIC_URL` must be the public https address (the AWS script sets it for you), and add your voice engine key on `/twin`. More options: [`.env.example`](.env.example), [docs/deploy.md](docs/deploy.md), [docs/docker-mcp.md](docs/docker-mcp.md), [docs/social-connectors.md](docs/social-connectors.md), [docs/supabase.md](docs/supabase.md).

---

## 🛠️ Run it locally

```bash
npm install
cp .env.example .env.local      # add NEBIUS_API_KEY
npm run spike:models            # list the Nemotron models your key can use
npm run seed:demo               # optional: a demo profile, plan, chat and Daily issue
npm run build && npm start      # http://localhost:3000
```

No key yet? `LLM_PROVIDER=mock npm start` runs on the built-in stand-in model.

<details>
<summary><b>With Docker Agent, night shift, packs and tests</b></summary>

```bash
NEBIUS_API_KEY=... npm run agent:serve      # docker agent serve chat agents/futureme.yaml --safety autonomous
# then set DOCKER_AGENT_URL=http://127.0.0.1:8083 in .env.local and start the app
docker agent run agents/futureme.yaml       # talk to the agent in the terminal

npm run night-shift                         # run the night shift once (-- --loop to schedule it)
npm run twin-scheduler -- --loop            # dial scheduled twin calls locally
npm run pack -- push founder docker.io/<you>/futureme-founder:1.0

npm run lint && npm run typecheck && npm test
npm run test:e2e                            # browser test of the whole loop
```

`--safety autonomous` lets Docker Agent call tools without a terminal prompt. That's safe here because its only tools are FutureMe's own, and anything they propose still waits for approval in the app.

</details>

---

## 🧭 Honest limitations

- **Not yet run against live services:** the voice twin (ElevenLabs cloning and calls, the OpenRouter and Qwen engines, AgentMail email) was tested against mock servers only. The Apify public-profile fetch was checked against Apify's real endpoints only up to authentication; actor output mapping is tested against each actor's documented output.
- On the server, tasks can only be marked done (no in-progress or blocked status), and memories can't be archived. Demo mode has those controls.
- Web research needs outbound internet; DuckDuckGo can rate-limit (Brave with `BRAVE_SEARCH_API_KEY` is steadier).
- Skill run history and "mark useful" on Daily are kept in the browser, not the database.
- The decision layer's thresholds and weights are untuned starting points, and its evaluation set is small and labelled by the implementer. Nemotron's cost estimates aren't verified unless you enter a looked-up price ([docs/decision-layer.md](docs/decision-layer.md#limitations-and-what-still-needs-real-world-validation)).
- Single-user app: lock it with `FUTUREME_ACCESS_CODE` before putting real data on a public address.

---

## 🔮 What's next

Ideas that build directly on what's already here:

1. **Shareable call clip.** Turn the best 30 seconds of a "Call From the Future" into a captioned clip to share, with the AI disclosure burned in. The best possible demo of the product, made by its users.
2. **Dial-a-Council.** Put the four council voices on one phone call: ask your hard question out loud and hear the skeptic and the mentor argue it out, then get the brief by email.
3. **Twin-to-Twin.** Let two FutureMe users' twins schedule a meeting or swap updates on their behalf, with both owners approving. It needs more than one user, which is why it isn't built yet.
4. **Local Nemotron by default for private mode.** Ship a one-click "private" profile on Nemotron Nano through Docker Model Runner, and a GPU recipe on Nebius for the full model on your own VM.
5. **Real Apify fetch, end to end.** Run the public-profile fetch against live Apify actors (Instagram, TikTok, YouTube) and harden it with real-world data.
6. **Voice engines in production.** Validate OpenRouter (Fish Audio) and Qwen cloning on real keys, and let calls run on a self-hosted voice on Nebius.
7. **Trend sourcing for FutureMe Daily**, so the "Signals" section brings in real news about your field.
8. **Accountability streaks:** Promise Keeper calls that adapt their timing to when you actually get things done.

---

<div align="center">

Built with **NVIDIA Nemotron** on **Nebius Token Factory**, **Docker Agent** and **MCP**.

Apache-2.0 · see [LICENSE](LICENSE)

</div>
