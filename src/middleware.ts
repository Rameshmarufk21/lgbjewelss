import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, getAuthSecret, isAuthEnabled } from "@/lib/auth/config";
import { verifySessionTokenAsync } from "@/lib/auth/token";

/** API routes that stay public even when auth is on. */
const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/auth/logout", "/api/auth/me", "/api/metals", "/api/version"];

function isPublicApi(path: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const secret = getAuthSecret();
  const session = await verifySessionTokenAsync(token, secret);

  if (pathname === "/login") {
    if (session) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    if (isPublicApi(pathname)) return NextResponse.next();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/orders-app/")) {
    if (!session) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", "/");
      return NextResponse.redirect(login);
    }
    return NextResponse.next();
  }

  if (!session) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
