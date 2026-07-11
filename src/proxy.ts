import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Session cookie names used by Auth.js / NextAuth v5 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const;

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
}

/**
 * Lightweight route guard for Next.js proxy/middleware.
 * Full session validation runs in server components via auth().
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLoggedIn = hasSessionCookie(request);

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/uploads/");

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/login", request.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }

  if (isLoggedIn && pathname.startsWith("/setup")) {
    return NextResponse.redirect(new URL("/", request.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
