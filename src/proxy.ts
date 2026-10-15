import type {NextRequest} from 'next/server';
import {updateSession} from '@/features/auth/session-proxy';

// Every page and API needs a session (docs/boxt/plan.md product rule 7). The proxy refreshes the
// Supabase session cookie and gates each request (src/features/auth/session-proxy.ts); every page and
// handler checks the session again itself (requireUser / requireApiUser).
export function proxy(request:NextRequest){
  return updateSession(request);
}

// Everything except build assets, image optimisation, the favicon and public image files.
export const config={
  matcher:['/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif)$).*)'],
};
