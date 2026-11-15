import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/", "/login", "/signup", "/forgot-password", "/reset-password"];

// Cheap gate: bounce visitors without a session cookie. Full validation happens server-side in requireUser().
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  // API routes and the share target authenticate themselves and answer with proper status codes.
  if (PUBLIC.includes(pathname) || pathname.startsWith("/api/") || pathname === "/share-target") return NextResponse.next();
  if (!req.cookies.has("syncly_session")) {
    const url = new URL("/login", req.url);
    if (pathname !== "/verify-email") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|webmanifest|js)$).*)"],
};
