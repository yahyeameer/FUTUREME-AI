import { ZodError } from "zod";
import type { Db } from "@/lib/db";
import { twinSnapshot } from "@/lib/twin";
import { callsSnapshot } from "@/lib/twin-calls";
import { voiceSnapshot } from "@/lib/voice";

export const twinState = (db: Db) => ({ twin: twinSnapshot(db), voice: voiceSnapshot(db), calls: callsSnapshot(db) });
export type TwinState = ReturnType<typeof twinState>;

export function errorResponse(err: unknown) {
  const message = err instanceof ZodError ? err.issues.map((i) => i.message).join(" ") : err instanceof Error ? err.message : "Something went wrong.";
  return Response.json({ error: message }, { status: 400 });
}
