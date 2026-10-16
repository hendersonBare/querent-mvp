import type {ReactNode} from 'react';
import {AppShell} from '@/features/shell/AppShell';
import {requireUser} from '@/features/auth/server';

// Every signed-in page renders inside the shell (the rail and the page area). The proxy already sent
// visitors without a session to /login; requireUser() checks again (and each page does too), then the
// rail shows the user's email, and Sign out posts to /api/auth/signout.
export default async function AppLayout({children}:{children:ReactNode}){
  const {user}=await requireUser();
  return <AppShell email={user.email??''}>{children}</AppShell>;
}
