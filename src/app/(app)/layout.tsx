import type {ReactNode} from 'react';
import {AppShell} from '@/features/shell/AppShell';

// Every signed-in page renders inside the shell (the rail and the page area).
// Until auth lands (task B2, which passes the session user's email and the sign-out action), the rail
// shows a placeholder email and Sign out posts to /api/auth/signout, which B2 adds.
const PLACEHOLDER_EMAIL='you@example.com';

export default function AppLayout({children}:{children:ReactNode}){
  return <AppShell email={PLACEHOLDER_EMAIL}>{children}</AppShell>;
}
