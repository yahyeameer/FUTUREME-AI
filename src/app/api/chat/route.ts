import { chat } from "@/lib/futureme";
import { db } from "@/lib/server-db";

// Streams a chat turn as newline-delimited JSON: {"type":"delta","text"} ... then {"type":"done", ...turn}.
export async function POST(request: Request) {
  const { text } = (await request.json().catch(() => ({}))) as { text?: unknown };
  if (typeof text !== "string" || !text.trim() || text.length > 4000) {
    return Response.json({ error: "Send a message of up to 4000 characters." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const turn = await chat(db(), text, undefined, (delta) => send({ type: "delta", text: delta }));
        send({ type: "done", ...turn });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Your future self couldn't answer just now." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
