// The voice twin's scheduler: places scheduled calls to the user's own phone (Call From the Future, Promise Keeper)
// files finished call transcripts in the vault, and deletes third-party transcripts and mail after the retention period.
//   npm run twin-scheduler            run once now
//   npm run twin-scheduler -- --loop  every 30 seconds; the container does this unless TWIN_SCHEDULER=off
// The ElevenLabs key is read on every run, so a key added in the app is picked up without a restart.
import { openDb } from "../src/lib/db";
import { getMailApi } from "../src/lib/mail";
import { dialDueCalls, syncCalls } from "../src/lib/twin-calls";
import { purgeExpired } from "../src/lib/twin-data";
import { getVoiceApi } from "../src/lib/voice";

const INTERVAL_MS = 30_000;
const db = openDb();
const mail = getMailApi();
let skipped = false;

async function once() {
  const api = getVoiceApi(db);
  if (!api) {
    if (!skipped) console.log("Twin scheduler waiting: there's no ElevenLabs key yet.");
    skipped = true;
    return;
  }
  skipped = false;
  const dialled = await dialDueCalls(db, api);
  const filed = await syncCalls(db, api);
  const purged = await purgeExpired(db, api, mail);
  if (dialled || filed) console.log(`Twin scheduler: ${dialled} call(s) placed, ${filed} transcript(s) filed.`);
  if (purged.calls || purged.emails) console.log(`Twin scheduler: deleted ${purged.calls} old call transcript(s) and ${purged.emails} old email(s).`);
}

async function main() {
  if (!process.argv.includes("--loop")) return once();
  for (;;) {
    await once().catch((err) => console.error("Twin scheduler error:", err));
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
