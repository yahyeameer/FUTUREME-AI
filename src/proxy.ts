import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, hasAccess, isOpenPath } from "./lib/access";
import { isWorkspaceId, multiUser, WORKSPACE_COOKIE } from "./lib/workspace-id";

// The access lock: with FUTUREME_ACCESS_CODE set, every page and API needs the sign-in cookie (see src/lib/access.ts).
// In multi-user mode (FUTUREME_MULTI_USER=1) the sign-in also hands out the workspace cookie, and both are needed.

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasWorkspace = !multiUser() || isWorkspaceId(request.cookies.get(WORKSPACE_COOKIE)?.value);
  if (isOpenPath(pathname) || (hasAccess(request.cookies.get(ACCESS_COOKIE)?.value) && hasWorkspace)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to TOMORA first." }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
