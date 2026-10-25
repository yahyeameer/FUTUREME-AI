// Share persona packs through any OCI registry (Docker Hub, GHCR, a private registry) with Docker Agent.
//   npm run pack -- push <pack-id> <registry-ref>     e.g. npm run pack -- push founder docker.io/you/futureme-founder:1.0
//   npm run pack -- pull <registry-ref> [pack-id]     saves it to agents/packs/<pack-id>.yaml so it shows up in the app
// The app only reads a pack's persona paragraph; it never runs a pulled file. Check a pulled pack's toolsets before you
// run it directly with `docker agent run`.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listPacks, packsDir } from "../src/lib/packs";

function dockerAgent(args: string[], cwd?: string) {
  const candidates: [string, string[]][] = process.env.DOCKER_AGENT_BIN
    ? [[process.env.DOCKER_AGENT_BIN, []]]
    : [
        ["docker-agent", []],
        ["docker", ["agent"]],
      ];
  for (const [bin, pre] of candidates) {
    const r = spawnSync(bin, [...pre, ...args], { cwd, stdio: "inherit", env: { TELEMETRY_ENABLED: "false", ...process.env } });
    if (r.error && (r.error as NodeJS.ErrnoException).code === "ENOENT") continue;
    if (r.status !== 0) process.exit(r.status ?? 1);
    return;
  }
  console.error("Docker Agent isn't installed. Install Docker Desktop 4.63+ or the docker-agent binary, or set DOCKER_AGENT_BIN.");
  process.exit(1);
}

const [cmd, a, b] = process.argv.slice(2);
const force = process.argv.includes("--force");

if (cmd === "push" && a && b) {
  const file = path.join(packsDir(), `${a}.yaml`);
  if (!fs.existsSync(file)) {
    console.error(`No pack "${a}". Packs: ${listPacks().map((p) => p.id).join(", ")}`);
    process.exit(1);
  }
  dockerAgent(["share", "push", file, b]);
} else if (cmd === "pull" && a) {
  const id = (b && !b.startsWith("--") ? b : a.split("/").pop()!.split(/[:@]/)[0].replace(/^futureme-/, "")).toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(id)) {
    console.error(`"${id}" isn't a usable pack id. Pass one: npm run pack -- pull ${a} my-pack`);
    process.exit(1);
  }
  const dest = path.join(packsDir(), `${id}.yaml`);
  if (fs.existsSync(dest) && !force) {
    console.error(`agents/packs/${id}.yaml already exists. Pass --force to replace it, or choose another id.`);
    process.exit(1);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-pack-"));
  try {
    dockerAgent(["share", "pull", a], tmp);
    const pulled = fs.readdirSync(tmp).find((f) => f.endsWith(".yaml"));
    if (!pulled) throw new Error("Docker Agent didn't save a YAML file.");
    fs.copyFileSync(path.join(tmp, pulled), path.join(tmp, `${id}.yaml`));
    const pack = listPacks(tmp).find((p) => p.id === id);
    if (!pack) throw new Error("That agent isn't a TOMORA persona pack: its root agent has no instruction.");
    fs.copyFileSync(path.join(tmp, `${id}.yaml`), dest);
    console.log(`Saved "${pack.name}" to agents/packs/${id}.yaml. Choose it on the Agent page.`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
} else {
  console.log("Usage:\n  npm run pack -- push <pack-id> <registry-ref>\n  npm run pack -- pull <registry-ref> [pack-id] [--force]");
  process.exit(cmd ? 1 : 0);
}
