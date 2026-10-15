// OpenAI-compatible stand-in model server, so Docker Agent can run end to end without a Nebius key.
//   npm run mock-model            listens on 127.0.0.1:8090
//   docker agent serve chat agents/futureme.yaml --flavor mock
import http from "node:http";
import type { ChatMessage, ToolDefinition } from "../src/lib/llm";
import { mockProvider } from "../src/lib/mock-llm";

const port = Number(process.env.MOCK_MODEL_PORT ?? 8090);

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url?.endsWith("/models")) {
    return send(res, 200, { object: "list", data: [{ id: "futureme-mock", object: "model", owned_by: "futureme" }] });
  }
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) return send(res, 404, { error: "not found" });

  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw) as { model: string; messages: ChatMessage[]; tools?: ToolDefinition[]; stream?: boolean };
  const out = await mockProvider.complete(body.messages, body.tools);
  const id = `chatcmpl-${Date.now()}`;
  const created = Math.floor(Date.now() / 1000);
  const toolCalls = out.toolCalls.map((c, index) => ({ index, id: c.id, type: "function", function: { name: c.name, arguments: c.arguments } }));
  const finish = toolCalls.length ? "tool_calls" : "stop";

  if (!body.stream) {
    return send(res, 200, {
      id,
      object: "chat.completion",
      created,
      model: body.model,
      choices: [{ index: 0, finish_reason: finish, message: { role: "assistant", content: out.content, tool_calls: toolCalls.length ? toolCalls : undefined } }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  }

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const chunk = (delta: unknown, finish_reason: string | null = null) =>
    res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  if (toolCalls.length) {
    chunk({ role: "assistant", content: out.content ?? "", tool_calls: toolCalls });
  } else {
    // Stream word by word, like a real model.
    const words = (out.content ?? "").split(/(?<= )/);
    chunk({ role: "assistant", content: "" });
    for (const w of words) {
      chunk({ content: w });
      await new Promise((r) => setTimeout(r, 15));
    }
  }
  chunk({}, finish);
  res.write("data: [DONE]\n\n");
  res.end();
});

server.listen(port, "127.0.0.1", () => console.log(`Mock model server on http://127.0.0.1:${port}/v1`));
