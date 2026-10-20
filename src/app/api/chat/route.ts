import { chat, validPhoto } from "@/lib/futureme";
import { db } from "@/lib/server-db";

// Streams a chat turn as newline-delimited JSON: {"type":"reasoning"|"tool"|"reset"|"delta", ...} ... then {"type":"done", ...turn}.
export async function POST(request: Request) {
  const { text, image } = (await request.json().catch(() => ({}))) as { text?: unknown; image?: unknown };
  if (typeof text !== "string" || !text.trim() || text.length > 4000) {
    return Response.json({ error: "Send a message of up to 4000 characters." }, { status: 400 });
  }
  if (image !== undefined && image !== null && !validPhoto(image)) {
    return Response.json({ error: "Attach a PNG, JPEG, WebP or GIF photo of up to 4 MB." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const turn = await chat(db(), text, undefined, (delta) => send({ type: "delta", text: delta }), {
          image: validPhoto(image) ? image : undefined,
          hooks: {
            onReasoning: (t) => send({ type: "reasoning", text: t }),
            onTool: (name, status) => send({ type: "tool", name, status }),
            onReset: () => send({ type: "reset" }),
          },
        });
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
