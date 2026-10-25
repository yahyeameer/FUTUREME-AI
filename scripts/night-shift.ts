// The night shift: publishes the day's TOMORA Daily and writes a morning brief while the user sleeps.
//   npm run night-shift            run once now
//   npm run night-shift -- --loop  wait for NIGHT_SHIFT_AT (default 05:30, server time) every day; the container does this
import { openDb } from "../src/lib/db";
import { getProfile } from "../src/lib/futureme";
import { nextRunAt, nightShiftSchedule, runNightShift } from "../src/lib/night-shift";

const db = openDb();

async function once(trigger: "schedule" | "manual") {
  if (!getProfile(db)) return console.log("Night shift skipped: no profile yet.");
  const r = await runNightShift(db, trigger);
  console.log(r.status === "completed" ? `Night shift done: ${r.brief}` : `Night shift failed: ${r.error}`);
}

async function main() {
  if (!process.argv.includes("--loop")) return once("manual");
  const at = nightShiftSchedule();
  if (!at) return console.log("Night shift schedule is off (NIGHT_SHIFT_AT).");
  for (;;) {
    const next = nextRunAt(at);
    console.log(`Next night shift at ${next.toString()}`);
    await new Promise((r) => setTimeout(r, next.getTime() - Date.now()));
    await once("schedule").catch((err) => console.error("Night shift error:", err));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
