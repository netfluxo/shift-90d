import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'experimental-edge';

export function middleware(request: NextRequest) {
  // Lightweight session presence check: only look at cookie existence, no validation.
  // Better Auth uses 'better-auth.session_token' by default (or __Secure- prefix in secure contexts).
  // getSessionCookie() returns the token value if present, null otherwise.
  const sessionToken = getSessionCookie(request.headers);
  const isAuthenticated = sessionToken !== null;

  // Protected routes - redirect to login if not authenticated
  const protectedPaths = ['/feed', '/ranking', '/profile', '/sabados'];
  const isProtectedPath = protectedPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isProtectedPath && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users away from auth pages
  const authPaths = ['/login', '/signup'];
  const isAuthPath = authPaths.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  );

  if (isAuthPath && isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/feed';
    return NextResponse.redirect(url);
  }

  return NextResponse.next({
    request,
  });
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
