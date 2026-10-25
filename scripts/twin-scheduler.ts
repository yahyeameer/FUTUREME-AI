// The voice twin's scheduler: places scheduled calls to the user's own phone (Call From the Future, Promise Keeper)
// files finished call transcripts in the vault, and deletes third-party transcripts and mail after the retention period.
//   npm run twin-scheduler            run once now
//   npm run twin-scheduler -- --loop  every 30 seconds; the container does this unless TWIN_SCHEDULER=off
// The ElevenLabs key is read on every run, so a key added in the app is picked up without a restart. On a multi-user
// server (FUTUREME_MULTI_USER=1) every workspace gets its pass, with its own key and phone number (src/lib/twin-scheduler.ts).
import { getMailApi } from "../src/lib/mail";
import { tickAll } from "../src/lib/twin-scheduler";

const INTERVAL_MS = 30_000;
const mail = getMailApi();
let waiting = false;

async function once() {
  const { ticks, errors } = await tickAll(mail);
  if (!ticks.length && !errors.length) {
    if (!waiting) console.log("Twin scheduler waiting: there's no ElevenLabs key yet.");
    waiting = true;
    return;
  }
  waiting = false;
  for (const t of ticks) {
    const who = t.workspace ? ` [${t.workspace.slice(0, 6)}…]` : "";
    if (t.dialled || t.filed) console.log(`Twin scheduler${who}: ${t.dialled} call(s) placed, ${t.filed} transcript(s) filed.`);
    if (t.purged.calls || t.purged.emails) console.log(`Twin scheduler${who}: deleted ${t.purged.calls} old call transcript(s) and ${t.purged.emails} old email(s).`);
  }
  for (const e of errors) console.error(`Twin scheduler error${e.workspace ? ` [${e.workspace.slice(0, 6)}…]` : ""}:`, e.error);
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
