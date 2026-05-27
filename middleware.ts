import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

// Optimistic cookie-presence check at the edge: if no session cookie is
// present on a request to a protected route, bounce to /sign-in. This is
// the pattern Better-Auth recommends for Next.js middleware — full session
// validation is too expensive (DB call) and incompatible with Edge runtime
// in some Next versions. Each protected page/route still re-checks the
// session server-side via `getSession()` for actual enforcement.
//
// The matcher below targets the /app/(authed)/* route group. The (authed)
// segment is a Next.js route group — it groups files but doesn't add a
// URL segment — so its children are matched by their actual URL paths.
// We list those URL paths in `config.matcher` rather than trying to match
// the route-group name.
export function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }
  return NextResponse.next();
}

export const config = {
  // Every URL that maps to a file under /app/(authed)/* must be listed
  // here. As new authed routes are added, append them to this list.
  matcher: ['/dashboard/:path*'],
};
