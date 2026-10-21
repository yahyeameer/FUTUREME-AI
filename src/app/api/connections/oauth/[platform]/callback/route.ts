import { db } from "@/lib/server-db";
import { finishOAuth, publicBase } from "@/lib/social/oauth";
import { isPlatform } from "@/lib/social/store";

// Where LinkedIn, X and Facebook send the person back after they approve (or cancel) on the platform's own screen.
// Behind the access lock like every other page: the browser carries the sign-in cookie on this redirect.

export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const url = new URL(request.url);
  const back = new URL("/connections", publicBase(url.origin));
  if (!isPlatform(platform)) return Response.redirect(back, 303);
  try {
    const q = url.searchParams;
    const result = await finishOAuth(db(), platform, { code: q.get("code"), state: q.get("state"), error: q.get("error_description") ?? q.get("error") }, url.origin);
    back.searchParams.set("connected", platform);
    back.searchParams.set("posts", String(result.posts));
  } catch (err) {
    back.searchParams.set("error", err instanceof Error ? err.message.slice(0, 300) : "The connection didn't work.");
  }
  return Response.redirect(back, 303);
}
