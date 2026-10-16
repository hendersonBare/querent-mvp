import type {NextRequest} from 'next/server';
import {updateSession} from '@/features/auth/session-proxy';

// Every page and API needs a session (docs/boxt/plan.md product rule 7). The proxy refreshes the
// Supabase session cookie and gates each request (src/features/auth/session-proxy.ts); every page and
// handler checks the session again itself (requireUser / requireApiUser).
export function proxy(request:NextRequest){
  return updateSession(request);
}

// Everything except build assets (/_next/static/…), image optimisation (/_next/image), the favicon and
// the real files in public/, each named exactly (follow-up F2: a path is not a public file because it
// ends in an image extension, so /api/quotes/x.png is gated like any API). A new file in public/ goes
// in this list (src/features/auth/session-proxy.test.ts checks every one is skipped).
export const config={
  matcher:['/((?!_next/static/|_next/image$|favicon\\.ico$|querent-logo\\.png$).*)'],
};
