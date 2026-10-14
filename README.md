# FutureMe AI

Meet the person you're becoming. Start building that future today.

FutureMe is a personal AI companion for the Nebius × NVIDIA Global AI Hackathon 2026 (Personal AI track). It lets you talk with a personalized version of your future self, keeps an Obsidian-compatible Markdown memory vault you control, and turns reflection into approved goals and tasks.

> **Status:** Milestone 1 (foundation). Only what is listed under "Working today" runs. Everything else is planned.

## Working today

- Next.js + TypeScript + Tailwind app skeleton
- Markdown memory vault (`src/lib/vault.ts`): notes with YAML frontmatter and `[[wiki-links]]`, keyword and tag search, path-escape protection
- SQLite store for profile, goals, tasks, and approvals (`src/lib/db.ts`)
- MCP server exposing `write_note` and `search_memory` (`mcp/vault-server.ts`)
- Spike script that calls a Nemotron model on Nebius Token Factory with a tool call (`scripts/spike-nebius.ts`)
- Docker Agent definition wired to Nebius and the vault MCP server (`agents/futureme.yaml`)

## Planned

Onboarding, Future Reflection story, Chat with Your Future, approval-gated plans and tasks, FutureMe Daily, deployment.

## Setup

```bash
npm install
cp .env.example .env.local   # add NEBIUS_API_KEY
npm run spike:models         # list Nemotron models your key can use; put one in NEBIUS_MODEL
npm run spike                # Nemotron calls write_note; a note appears in data/vault/Goals
npm run dev
```

### Docker Agent

With [Docker Agent](https://docs.docker.com/ai/docker-agent/) installed and `NEBIUS_API_KEY` exported:

```bash
docker agent run agents/futureme.yaml
```

Set `model` in `agents/futureme.yaml` to an id from `npm run spike:models`.

## Development

```bash
npm run lint
npm run typecheck
npm test
```

## Memory vault

The vault lives in `data/vault` (set `VAULT_DIR` to change it) and opens directly in Obsidian. Folders: `Profile`, `Goals`, `Reflections`, `Plans`, `Tasks`, `Daily`. Each note records whether it is `user-stated`, `ai-inferred`, or `verified`.

## License

Apache-2.0. See [LICENSE](LICENSE).
