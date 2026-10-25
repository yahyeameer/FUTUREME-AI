import { cookies } from "next/headers";
import { usageToday } from "@/lib/budget";
import { isWorkspaceId, multiUser, WORKSPACE_COOKIE } from "@/lib/workspace-id";

// Whether this server gives every visitor a private workspace, and which one is yours. The cookie is HttpOnly, so the
// page can't read it itself; the workspace code is what lets you open the same workspace again from another device.
// Also today's model usage for this workspace against the server's limits (see budget.ts).
export async function GET() {
  const value = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  return Response.json({ multiUser: multiUser(), workspace: multiUser() && isWorkspaceId(value) ? value : null, budget: usageToday() }, { headers: { "Cache-Control": "no-store" } });
}
