import { db } from "@/lib/server-db";
import { finishGoogleOAuth } from "@/lib/connectors/google";
import { publicBase } from "@/lib/social/oauth";

// Where Google sends the person back after they approve (or cancel) on its consent screen.

export async function GET(request: Request) {
  const url = new URL(request.url);
  const base = publicBase(url.origin);
  const back = new URL("/agent", base);
  back.hash = "integrations";
  const q = url.searchParams;
  try {
    if (q.get("error")) throw new Error(q.get("error") === "access_denied" ? "You cancelled on Google's screen. Nothing was connected." : `Google said: ${q.get("error")}`);
    const email = await finishGoogleOAuth(db(), base, q.get("code") ?? "", q.get("state") ?? "");
    back.searchParams.set("connected", email ?? "google");
  } catch (err) {
    back.searchParams.set("error", err instanceof Error ? err.message.slice(0, 300) : "Google couldn't be connected.");
  }
  return Response.redirect(back, 303);
}
