// The voice twin's scheduler: places scheduled calls to the user's own phone (Call From the Future, Promise Keeper)
// and files finished call transcripts in the vault.
//   npm run twin-scheduler            run once now
//   npm run twin-scheduler -- --loop  every 30 seconds; the container does this when ELEVENLABS_API_KEY is set
import { openDb } from "../src/lib/db";
import { dialDueCalls, syncCalls } from "../src/lib/twin-calls";
import { getVoiceApi } from "../src/lib/voice";

const INTERVAL_MS = 30_000;
const db = openDb();
const api = getVoiceApi();

async function once() {
  if (!api) return console.log("Twin scheduler skipped: ELEVENLABS_API_KEY isn't set.");
  const dialled = await dialDueCalls(db, api);
  const filed = await syncCalls(db, api);
  if (dialled || filed) console.log(`Twin scheduler: ${dialled} call(s) placed, ${filed} transcript(s) filed.`);
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
