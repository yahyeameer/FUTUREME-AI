import crypto from "node:crypto";
import type { ChatMessage } from "@/lib/llm";
import { db } from "@/lib/server-db";
import { checkLlmSecret, replyOnCall, SECRET_HEADER } from "@/lib/twin-calls";

// The future self as ElevenLabs' custom LLM. ElevenLabs posts an OpenAI chat completions request here for every turn
// of a call (to /api/twin/llm/v1/chat/completions) and speaks the streamed reply in the user's cloned voice.
// It must carry the secret header set on the agent; the call itself is identified by the call_ref in the prompt.

const FALLBACK = "Sorry, I lost my train of thought. Could you say that again?";

export async function POST(request: Request) {
  const d = db();
  if (!checkLlmSecret(d, request.headers.get(SECRET_HEADER))) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { messages?: unknown; stream?: boolean } | null;
  if (!body || !Array.isArray(body.messages)) return Response.json({ error: "Send OpenAI chat completion messages." }, { status: 400 });
  const messages = body.messages as ChatMessage[];

  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  const chunk = (delta: { role?: "assistant"; content?: string }, finish: "stop" | null = null) =>
    JSON.stringify({ id, object: "chat.completion.chunk", created, model: "futureme-twin", choices: [{ index: 0, delta, finish_reason: finish }] });

  if (body.stream === false) {
    const reply = (await replyOnCall(d, messages).catch(() => "")) || FALLBACK;
    return Response.json({
      id,
      object: "chat.completion",
      created,
      model: "futureme-twin",
      choices: [{ index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" }],
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      send(chunk({ role: "assistant" }));
      let spoke = false;
      try {
        const reply = await replyOnCall(d, messages, (text) => {
          spoke = true;
          send(chunk({ content: text }));
        });
        // Fixed lines (an unknown call, a paused twin) come back without deltas.
        if (!spoke) send(chunk({ content: reply || FALLBACK }));
      } catch (err) {
        console.error("Twin call reply failed:", err);
        if (!spoke) send(chunk({ content: FALLBACK }));
      }
      send(chunk({}, "stop"));
      send("[DONE]");
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", Connection: "keep-alive" } });
}
