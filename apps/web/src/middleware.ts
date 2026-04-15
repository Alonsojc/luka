import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Server-side auth guard.
 *
 * Checks for the `luka_access` httpOnly cookie set by the API on login.
 * - If missing on a dashboard route → redirect to /login
 * - If present on /login → redirect to /dashboard
 *
 * This runs on the Edge before the page renders, preventing the
 * flash of unauthenticated content that the client-side useRouteGuard has.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasAccessToken = request.cookies.has("luka_access");

  // Authenticated user visiting login → send to dashboard
  if (pathname === "/login" && hasAccessToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Unauthenticated user visiting dashboard → send to login
  if (!hasAccessToken) {
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
     * - /_next (static files)
     * - /api (API proxy)
     * - /manifest.json, /sw.js, /luka-logo.png (public assets)
     */
    "/((?!login|forgot-password|reset-password|_next|api|manifest\\.json|sw\\.js|luka-logo\\.png|favicon\\.ico).*)",
  ],
};
