// Milestone 1 spike: prove a Nemotron model on Nebius Token Factory can call a tool that writes to the vault.
//   npm run spike:models   list Nemotron models available to your key
//   npm run spike          run one tool call end to end
import { llmClient, modelId, NEBIUS_BASE_URL } from "../src/lib/llm";
import { writeNote } from "../src/lib/vault";

async function listModels() {
  const client = llmClient();
  const models = await client.models.list();
  const ids = models.data.map((m) => m.id);
  const nemotron = ids.filter((id) => id.toLowerCase().includes("nemotron"));
  console.log(`Connected to ${NEBIUS_BASE_URL}. ${ids.length} models available.`);
  console.log(nemotron.length ? `Nemotron models:\n  ${nemotron.join("\n  ")}` : "No Nemotron models found for this key.");
}

async function toolCall() {
  const client = llmClient();
  const model = modelId();
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "write_note",
        description: "Save a goal note to the user's memory vault.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
          },
          required: ["title", "body"],
        },
      },
    },
  ];
  const started = Date.now();
  const res = await client.chat.completions.create({
    model,
    tools,
    tool_choice: "auto",
    messages: [
      { role: "system", content: "You are FutureMe. When the user states a goal, save it with write_note." },
      { role: "user", content: "My 10-year goal is to lead an AI research lab in Hargeisa. Please remember it." },
    ],
  });
  const call = res.choices[0]?.message.tool_calls?.[0];
  console.log(`Model ${model} answered in ${Date.now() - started} ms.`);
  if (!call || call.type !== "function") {
    console.error("No tool call returned. Message:", res.choices[0]?.message.content);
    process.exit(1);
  }
  const args = JSON.parse(call.function.arguments);
  const note = writeNote({ folder: "Goals", title: args.title, body: args.body, tags: args.tags });
  console.log(`Tool call OK. Wrote ${note.path}`);
}

const run = process.argv[2] === "models" ? listModels : toolCall;
run().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
