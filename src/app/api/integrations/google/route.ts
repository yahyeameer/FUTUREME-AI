import { db } from "@/lib/server-db";
import { startGoogleOAuth } from "@/lib/connectors/google";
import { publicBase } from "@/lib/social/oauth";

// "Connect Google" on the Agent page: sends the person to Google's consent screen for Gmail and Calendar.
// Behind the access lock like every other page.

export async function GET(request: Request) {
  const base = publicBase(new URL(request.url).origin);
  try {
    return Response.redirect(startGoogleOAuth(db(), base), 303);
  } catch (err) {
    const back = new URL("/agent", base);
    back.hash = "integrations";
    back.searchParams.set("error", err instanceof Error ? err.message.slice(0, 300) : "Google couldn't be connected.");
    return Response.redirect(back, 303);
  }
}
