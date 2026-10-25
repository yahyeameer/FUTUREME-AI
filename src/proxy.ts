import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, hasAccess, isOpenPath } from "./lib/access";

// The access lock: with FUTUREME_ACCESS_CODE set, every page and API needs the sign-in cookie (see src/lib/access.ts).

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isOpenPath(pathname) || hasAccess(request.cookies.get(ACCESS_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Sign in to TOMORA first." }, { status: 401 });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
