// Seeds a demo user with a story, an approved plan, two completed steps, a chat exchange and a Daily issue.
//   npm run seed:demo              (uses Nebius when NEBIUS_API_KEY is set, otherwise the stand-in model)
//   npm run seed:demo -- --if-empty  only seeds a fresh database
import { generateDaily } from "../src/lib/daily";
import { openDb } from "../src/lib/db";
import { chat, completeTask, decideApproval, generateStory, getProfile, goalsWithTasks, inProcessBackend, saveProfile } from "../src/lib/futureme";
import { getProvider } from "../src/lib/llm";

async function main() {
  const db = openDb();
  if (process.argv.includes("--if-empty") && getProfile(db)) {
    console.log("Database already has a profile; skipping demo seed.");
    return;
  }
  const provider = getProvider();
  console.log(`Seeding demo data with ${provider.name}…`);

  saveProfile(db, {
    name: "Hodan",
    dream:
      "In ten years I run an AI research lab in Hargeisa that trains young Somali engineers and builds tools for farmers and small businesses across the Horn of Africa.",
    current: "Full-stack developer at a local fintech, building side projects with AI agents in the evenings.",
    resources: "Strong TypeScript skills, a laptop, two hours most evenings, a mentor in Nairobi, and a supportive family.",
    challenges: "Unreliable access to GPUs and cloud credits, little time, and no research publications yet.",
    values: "family, craft, courage, community",
    style: "direct",
  });
  await generateStory(db, provider);

  const turn = await chat(db, "Help me plan my first open-source AI project that farmers could use", inProcessBackend(provider));
  for (const id of turn.approvals) decideApproval(db, id, true);

  const goal = goalsWithTasks(db)[0];
  if (goal) {
    goal.tasks.slice(0, 2).forEach((t, i) => {
      completeTask(db, t.id);
      const when = new Date(Date.now() - (2 - i) * 86_400_000).toISOString();
      db.prepare("UPDATE tasks SET completed_at = ? WHERE id = ?").run(when, t.id);
    });
  }
  await generateDaily(db, provider);
  console.log("Demo user ready: open /future, /chat, /plan and /daily.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
