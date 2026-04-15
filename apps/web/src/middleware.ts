import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Server-side auth guard.
 *
 * Checks for the `luka_csrf` cookie (path="/", non-httpOnly) which is set
 * alongside the auth tokens on login. We cannot use `luka_access` here
 * because it has `path="/api"` and browsers only send it to API routes.
 *
 * - If missing on a dashboard route → redirect to /login
 * - If present on /login → redirect to /dashboard
 *
 * This runs on the Edge before the page renders, preventing the
 * flash of unauthenticated content that the client-side useRouteGuard has.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAuthenticated = request.cookies.has("luka_csrf");

  // Authenticated user visiting login → send to dashboard
  if (pathname === "/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Unauthenticated user visiting dashboard → send to login
  if (!isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all dashboard routes but exclude:
     * - /login, /forgot-password, /reset-password (auth pages)
     * - /_next (static files, chunks, images)
     * - /api (API proxy)
     * - Static public assets (icons, manifest, sw, logo, favicon)
     */
    "/((?!login|forgot-password|reset-password|_next|api|icons|manifest\\.json|sw\\.js|luka-logo\\.png|favicon\\.ico|\\.well-known).*)",
  ],
};
