import { createServer } from "node:http";
import next from "next";
import { runInWorkspace } from "./src/lib/tenant";
import { cookieValue, WORKSPACE_COOKIE } from "./src/lib/workspace-id";

// The web server for multi-user mode (FUTUREME_MULTI_USER=1), started by scripts/start.sh in place of `next start`.
// It does one extra thing: it reads each request's workspace cookie and runs the whole request inside that workspace
// (src/lib/tenant.ts), so every visitor's pages, actions and API calls see only their own database and vault.

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME_BIND ?? "0.0.0.0";

const app = next({ dev: false, hostname, port });
const handle = app.getRequestHandler();

async function main() {
  await app.prepare();
  createServer((req, res) => {
    runInWorkspace(cookieValue(req.headers.cookie, WORKSPACE_COOKIE), () => handle(req, res));
  }).listen(port, hostname, () => {
    console.log(`TOMORA (multi-user) ready on http://${hostname}:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
