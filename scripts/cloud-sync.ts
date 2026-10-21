// Keeps the cloud copy (Supabase) of TOMORA's database and files up to date. See docs/supabase.md.
//   npm run cloud-sync                       restore if this install is empty, then push once
//   npm run cloud-sync -- --loop             the same, then push every CLOUD_SYNC_INTERVAL seconds (default 30)
//   npm run cloud-sync -- restore [--force]  pull the cloud copy down (--force replaces local rows)
//   npm run cloud-sync -- schema             print the Postgres schema for the current local tables
import { openDb } from "../src/lib/db";
import { getCloudStore } from "../src/lib/cloud/store";
import { CloudSync, postgresSchema } from "../src/lib/cloud/sync";
import { vaultRoot } from "../src/lib/vault";
import { voiceDir } from "../src/lib/voice";

const args = process.argv.slice(2);
const db = openDb();

async function main() {
  if (args[0] === "schema") return void process.stdout.write(postgresSchema(db));

  const store = getCloudStore();
  if (!store) return console.log("Cloud sync skipped: SUPABASE_URL isn't set.");
  const sync = new CloudSync(db, store, [
    { prefix: "vault", dir: vaultRoot() },
    { prefix: "voice", dir: voiceDir() },
  ]);
  await sync.init();

  const restored = await sync.restore({ force: args[0] === "restore" && args.includes("--force") });
  if (restored.rows || restored.files) console.log(`Cloud sync: restored ${restored.rows} row(s) and ${restored.files} file(s) from ${store.name}.`);
  if (args[0] === "restore") return;

  const interval = Math.max(5, Number(process.env.CLOUD_SYNC_INTERVAL) || 30) * 1000;
  for (;;) {
    try {
      const r = await sync.push();
      if (r.upserted || r.deleted || r.uploaded || r.removedFiles) {
        console.log(`Cloud sync: ${r.upserted} row(s) saved, ${r.deleted} deleted, ${r.uploaded} file(s) uploaded, ${r.removedFiles} removed.`);
      }
      for (const s of r.skipped) console.log(`Cloud sync: skipped ${s}.`);
    } catch (err) {
      if (!args.includes("--loop")) throw err;
      console.error("Cloud sync error:", err);
    }
    if (!args.includes("--loop")) return;
    await new Promise((r) => setTimeout(r, interval));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
