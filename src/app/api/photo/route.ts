import fs from "node:fs";
import { resolveInVault } from "@/lib/vault";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };

// Serves a photo the user sent in the chat. Only files in the vault's Photos folder.
export async function GET(request: Request) {
  const rel = new URL(request.url).searchParams.get("path") ?? "";
  const ext = rel.split(".").pop() ?? "";
  if (!/^Photos\/[\w.-]+$/.test(rel) || !TYPES[ext]) return new Response("Not found", { status: 404 });
  try {
    const data = fs.readFileSync(resolveInVault(rel));
    return new Response(data, { headers: { "Content-Type": TYPES[ext], "Cache-Control": "private, max-age=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
