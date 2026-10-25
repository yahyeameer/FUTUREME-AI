import { createServer } from "node:http";
import next from "next";
import { runInWorkspace, workspaceFromHandle } from "./src/lib/tenant";
import { cookieValue, WORKSPACE_COOKIE } from "./src/lib/workspace-id";

// The web server for multi-user mode (FUTUREME_MULTI_USER=1), started by scripts/start.sh in place of `next start`.
// It does one extra thing: it reads each request's workspace cookie and runs the whole request inside that workspace
// (src/lib/tenant.ts), so every visitor's pages, actions and API calls see only their own database and vault.
// ElevenLabs' voice-call callbacks carry no cookie; they name the workspace by its handle instead (see tenant.ts).

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME_BIND ?? "0.0.0.0";

const app = next({ dev: false, hostname, port });

/** The workspace a request belongs to: its cookie, or for the twin's webhooks the handle in the address. */
function workspaceOf(req: { url?: string; headers: { cookie?: string } }): string | null {
  const fromCookie = cookieValue(req.headers.cookie, WORKSPACE_COOKIE);
  if (fromCookie) return fromCookie;
  const url = new URL(req.url ?? "/", "http://localhost");
  const webhook = url.pathname.match(/^\/api\/twin\/llm\/ws\/([a-f0-9]{32})(?:\/|$)/)?.[1] ?? (url.pathname === "/api/twin/inbound" ? url.searchParams.get("ws") : null);
  return webhook ? workspaceFromHandle(webhook) : null;
}

const handle = app.getRequestHandler();

async function main() {
  await app.prepare();
  createServer((req, res) => {
    runInWorkspace(workspaceOf(req), () => handle(req, res));
  }).listen(port, hostname, () => {
    console.log(`TOMORA (multi-user) ready on http://${hostname}:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
