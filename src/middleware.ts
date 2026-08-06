import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/session";

/**
 * A cheap gate, not the security boundary. It only checks that a session cookie
 * is PRESENT so signed-out visitors get a redirect instead of a flash of empty
 * UI. The cookie's signature is verified — and every permission actually
 * enforced — in the service layer on each request. Middleware runs on the edge
 * runtime and must never be the only thing standing between a user and data.
 */
const PROTECTED = ["/dashboard", "/projects", "/review-queue"];
const AUTH_PAGES = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME));

  if (!hasCookie && PROTECTED.some((p) => pathname.startsWith(p))) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasCookie && AUTH_PAGES.includes(pathname)) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*", "/review-queue/:path*", "/login", "/register"],
};
