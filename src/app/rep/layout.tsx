import type {ReactNode} from 'react';
import type {Metadata} from 'next';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {Archivo,IBM_Plex_Mono,IBM_Plex_Sans} from 'next/font/google';
import {RepShell} from '@/components/rep/RepShell';
import {initials} from '@/lib/initials';
import {repBadges} from '@/server/rep/badges';
import {customers,rep} from '@/server/repository';
import {COOKIE,principalFromCookie} from '@/server/session';

// The rep portal (spec §4): every /rep/* page renders inside this frame. Only the supplier
// persona (a rep) gets in; anyone else goes back to the workspace chooser at /.

const archivo=Archivo({subsets:['latin'],axes:['wdth'],variable:'--font-archivo'});
const plexSans=IBM_Plex_Sans({subsets:['latin'],weight:['400','500','600','700'],variable:'--font-plex-sans'});
const plexMono=IBM_Plex_Mono({subsets:['latin'],weight:['400','500'],variable:'--font-plex-mono'});

export const metadata:Metadata={title:{default:'Rep portal · Querent',template:'%s · Querent'}};

export default async function RepLayout({children}:{children:ReactNode}){
  const user=principalFromCookie((await cookies()).get(COOKIE)?.value);
  if(user?.role!=='supplier_admin'||!user.rep_id)redirect('/');
  const me=rep(user.rep_id);
  const identity={id:user.rep_id,name:me?.name??user.user_name,initials:me?.initials||initials(user.user_name),title:me?.title??'Rep'};
  return <RepShell rep={identity} org={user.name} customers={customers()} initialBadges={repBadges(user.rep_id)}
    className={[archivo.variable,plexSans.variable,plexMono.variable].join(' ')}>{children}</RepShell>;
}
