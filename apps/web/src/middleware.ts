import { NextResponse } from "next/server";

/**
 * Auth is enforced client-side via localStorage tokens in the dashboard
 * layout + api-client. Edge middleware cannot read localStorage, and
 * cookie-based signalling is fragile across proxy/cross-origin setups,
 * so the server-side guard is disabled.
 */
export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};
