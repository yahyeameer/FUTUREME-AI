# Docker MCP tools for the agent

TOMORA's future self can use tools from [Docker's MCP catalog](https://hub.docker.com/mcp) (web search, fetch, GitHub, Notion, time and many more) through the **Docker MCP Gateway**, part of Docker Desktop's MCP Toolkit. The gateway runs each MCP server in its own container. TOMORA connects to it as an MCP client and offers its tools to the agent as `docker_<tool>`.

Every call goes through TOMORA, so:

- **Read-only tools run straight away.** A tool counts as read-only only when it declares `readOnlyHint` and not `destructiveHint`.
- **Everything else asks first.** The call becomes a request on the Agent page (**Docker MCP tools**). Nothing runs until you press **Approve and run**. The result is shown there and posted into the conversation, so the agent can use it on your next message. **Decline** runs nothing.
- **Every call is logged** with the other tool calls, and shows in the chat as "Docker tool: …".

It's optional. Without it, or when Docker isn't running, the agent has no Docker tools and everything else works as before. The Agent page says whether the gateway is connected.

## Set it up on your computer (Windows, macOS, Linux)

1. Install and start **Docker Desktop** (4.42 or later).
   - On Windows, Docker Desktop needs WSL 2. If it fails to start with a WSL error, open PowerShell **as Administrator** and run `wsl --install` (or `wsl --update` if WSL is already there), restart the computer, then start Docker Desktop again. If it still fails, check that virtualization is turned on in the BIOS and that "Virtual Machine Platform" is on under *Turn Windows features on or off*.
2. In Docker Desktop, open **Settings → Beta features**, turn on **Docker MCP Toolkit**, and apply.
3. Open **MCP Toolkit → Catalog** and enable a few servers, for example **DuckDuckGo** and **Fetch**. You can also do it from a terminal:

   ```bash
   docker mcp server enable duckduckgo fetch
   ```

4. Start the gateway in a terminal and leave it running:

   ```bash
   docker mcp gateway run --transport streaming --port 8811
   ```

   If it prints a bearer token, put it in `DOCKER_MCP_GATEWAY_TOKEN`.
5. In `.env.local`:

   ```bash
   DOCKER_MCP_GATEWAY_URL=http://localhost:8811/mcp
   ```

6. Start TOMORA (`npm run dev`, or `npm run build && npm start`) and open **Agent**. **Docker MCP tools** should say *Connected* and list the tools. Ask your future self something a tool can do, for example "search the web for SMS farming advice".

Instead of steps 4 and 5 you can set `DOCKER_MCP_GATEWAY=on`, and TOMORA starts `docker mcp gateway run` itself over stdio (`DOCKER_MCP_SERVERS=duckduckgo,fetch` picks the servers). That's one gateway per process, so with Docker Agent prefer the URL.

## With Docker Agent

`agents/futureme.yaml` gives the future self a second MCP toolset, `mcp/docker-tools-server.ts`. It's a small bridge that lists the gateway's tools and sends every call through TOMORA's approval step, so `--safety autonomous` stays safe. Set `DOCKER_MCP_GATEWAY_URL` in the environment of `npm run agent:serve` too.

## With Docker Compose

```bash
docker compose -f docker-compose.yml -f docker-compose.mcp.yml up --build
```

This adds a `mcp-gateway` service (the `docker/mcp-gateway` image, with the Docker socket mounted) and points TOMORA at it. `DOCKER_MCP_SERVERS` picks the catalog servers (default `duckduckgo,fetch`).

## Settings

| Variable | What it does |
| --- | --- |
| `DOCKER_MCP_GATEWAY_URL` | The gateway's address, e.g. `http://localhost:8811/mcp`. An address ending in `/sse` uses the older SSE transport. |
| `DOCKER_MCP_GATEWAY_TOKEN` | Bearer token for the gateway, if it asks for one. |
| `DOCKER_MCP_GATEWAY=on` | Start `docker mcp gateway run` over stdio instead of using a URL. |
| `DOCKER_MCP_SERVERS` | Catalog servers to load with `DOCKER_MCP_GATEWAY=on` or Compose, e.g. `duckduckgo,fetch,time`. |
| `DOCKER_MCP_AUTO_APPROVE` | Tool names (as the gateway names them) that may run without asking even though they don't say they're read-only. Leave empty unless you trust them. |
| `DOCKER_MCP_GATEWAY_COMMAND` | Advanced: a different command to start instead of `docker mcp gateway run`. |

If the gateway stops, the Agent page shows *Not reachable* and TOMORA tries again every 30 seconds. A request you approve while it's down stays pending, so you can approve it again once Docker is back.
