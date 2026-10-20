import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type Db } from "../src/lib/db";
import { chat, inProcessBackend, saveProfile, validPhoto } from "../src/lib/futureme";
import type { CompleteOptions, LlmProvider } from "../src/lib/llm";
import { reasoningFor } from "../src/lib/llm";
import { SCHEMAS } from "../src/lib/nemotron";

vi.mock("server-only", () => ({}));

// The Nemotron-specific parts of the agent loop: reasoning, parallel tools, structured output and photos.

let dir: string;
let db: Db;
const profile = { name: "Amina", dream: "Lead an AI research lab", current: "", resources: "", challenges: "", values: "", style: "direct" };
const PNG = `data:image/png;base64,${Buffer.from("not really a png").toString("base64")}`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "futureme-"));
  process.env.VAULT_DIR = path.join(dir, "vault");
  db = openDb(":memory:");
  saveProfile(db, profile);
});
afterEach(() => {
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.VAULT_DIR;
  delete process.env.NEBIUS_REASONING;
});

describe("Nemotron agent loop", () => {
  it("runs several tool calls from one step in parallel and streams reasoning", async () => {
    const calls: CompleteOptions[] = [];
    let step = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const provider: LlmProvider = {
      name: "nebius:test",
      async complete(_m, _t, opts = {}) {
        calls.push(opts);
        opts.onReasoning?.(step === 0 ? "Check memory and files." : "Now answer.");
        if (step++ === 0) {
          return {
            content: null,
            toolCalls: [
              { id: "a", name: "search_memory", arguments: '{"query":"dream"}' },
              { id: "b", name: "list_files", arguments: "{}" },
            ],
          };
        }
        return { content: "Start with one paper this week. What will you read first?", toolCalls: [] };
      },
    };
    const tools: string[] = [];
    const backend = inProcessBackend(provider, { reasoning: "on" });
    const orig = backend.run.bind(backend);
    // Counts how many tools are running at once.
    const onTool = (n: string, s: string) => {
      if (s === "running") {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        tools.push(n);
      } else inFlight--;
    };
    const turn = await chat(db, "What should I do first?", {
      ...backend,
      run: (d, m, o, h) => orig(d, m, o, { ...h, onTool: (n, s) => (onTool(n, s), h?.onTool?.(n, s)) }),
    });
    expect(tools.sort()).toEqual(["list_files", "search_memory"]);
    expect(maxInFlight).toBe(2);
    expect(calls.every((c) => c.reasoning === "on")).toBe(true);
    expect(turn.reasoning).toContain("Check memory and files.");
    expect(turn.reasoning).toContain("Now answer.");
    const row = db.prepare("SELECT reasoning FROM messages WHERE id = ?").get(turn.id) as { reasoning: string };
    expect(row.reasoning).toBe(turn.reasoning);
  });

  it("holds a tool-free agent to its schema and formats a tool-using agent's prose as JSON", async () => {
    const seen: CompleteOptions[] = [];
    const noTools: LlmProvider = { name: "t", complete: async (_m, _t, o = {}) => (seen.push(o), { content: '{"summary":"s"}', toolCalls: [] }) };
    await inProcessBackend(noTools, { tools: [], schema: SCHEMAS.councilBrief }).run(db, [{ role: "user", content: "q" }]);
    expect(seen[0].schema?.name).toBe("council_brief");

    let n = 0;
    const withTools: LlmProvider = {
      name: "t",
      complete: async (_m, tools, o = {}) => {
        seen.push(o);
        if (n++ === 0) return { content: "Here is what I found: it went fine.", toolCalls: [] };
        expect(tools).toBeUndefined();
        return { content: '{"summary":"It went fine.","findings":[]}', toolCalls: [] };
      },
    };
    const backend = inProcessBackend(withTools, {
      tools: [{ type: "function", function: { name: "search_memory", parameters: { type: "object", properties: {} } } }],
      schema: SCHEMAS.research,
    });
    const reply = await backend.run(db, [{ role: "user", content: "research" }]);
    expect(JSON.parse(reply).summary).toBe("It went fine.");
    expect(seen.at(-1)?.schema?.name).toBe("research");
  });

  it("lets NEBIUS_REASONING override every agent", () => {
    expect(reasoningFor("on")).toBe("on");
    process.env.NEBIUS_REASONING = "off";
    expect(reasoningFor("on")).toBe("off");
  });

  it("sends a photo to the model and keeps it in the vault", async () => {
    let content: unknown;
    const provider: LlmProvider = { name: "nebius:x-VL", complete: async (m) => ((content = m.at(-1)?.content), { content: "Nice whiteboard.", toolCalls: [] }) };
    await chat(db, "Here's my plan", inProcessBackend(provider), undefined, { image: PNG });
    expect(Array.isArray(content)).toBe(true);
    expect((content as { type: string }[]).map((p) => p.type)).toEqual(["text", "image_url"]);
    const row = db.prepare("SELECT image FROM messages WHERE role = 'user'").get() as { image: string };
    expect(row.image).toMatch(/^Photos\/.+\.png$/);
    expect(fs.existsSync(path.join(dir, "vault", row.image))).toBe(true);
    expect(validPhoto(PNG)).toBe(true);
    expect(validPhoto("data:text/html;base64,AAAA")).toBe(false);
  });
});
