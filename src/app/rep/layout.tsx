import type {ReactNode} from 'react';
import type {Metadata} from 'next';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {RepShell} from '@/components/rep/RepShell';
import {initials} from '@/lib/initials';
import {repAccess} from '@/server/rep/access';
import {repBadges} from '@/server/rep/badges';
import {rep} from '@/server/repository';
import {COOKIE,principalFromCookie} from '@/server/session';

// The rep portal (spec §4): every /rep/* page renders inside the shell (plan U2: the rail and the page
// area, src/components/rep/RepShell.tsx). Only a supplier persona whose rep is active gets in (v3 spec
// §8, task D1); anyone else goes back to /.

// Type: Albert Sans and Geist Mono, loaded once in the root layout (plan U0). Until the page tasks (U3
// to U9) rebuild every page body, the "rep-fonts" class (src/app/tokens.css) on the page area points the
// old bodies' font variables (--font-archivo, --font-plex-sans, --font-plex-mono) at them.

export const metadata:Metadata={title:{default:'Rep portal · Querent',template:'%s · Querent'}};

export default async function RepLayout({children}:{children:ReactNode}){
  const user=principalFromCookie((await cookies()).get(COOKIE)?.value);
  const access=repAccess(user);
  if(!user||!access.ok)redirect('/');
  const me=rep(access.repId);
  const identity={id:access.repId,name:me?.name??user.user_name,initials:me?.initials||initials(user.user_name),title:me?.title??'Rep',manager:access.manager};
  return <RepShell rep={identity} org={user.name} initialBadges={repBadges(access.repId,{manager:access.manager})}
    className="rep-fonts">{children}</RepShell>;
}
