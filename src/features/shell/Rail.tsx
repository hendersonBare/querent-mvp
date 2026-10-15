'use client';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {ORG_NAME,SECTIONS,sectionFor} from './nav';
import s from './Rail.module.css';

// The left rail: 216px charcoal, sticky as the page scrolls. The Querent logo and wordmark, the org,
// the three sections (./nav), then the signed-in user's email and Sign out.

/** What Sign out submits to: a URL (POSTed) or a server action. */
export type SignOutAction=string|((formData:FormData)=>void|Promise<void>);
/** Until auth lands (B2), Sign out posts here. */
export const SIGN_OUT_PATH='/api/auth/signout';

export interface RailProps {
  /** The signed-in user's email. */
  email:string;
  /** Sign out's form action. */
  onSignOut?:SignOutAction;
}

export function Rail({email,onSignOut=SIGN_OUT_PATH}:RailProps){
  const active=sectionFor(usePathname());
  return <aside className={`ui-root ${s.rail}`}>
    <div className={s.inner}>
      <div className={s.brand}>
        <svg width="40" height="40" viewBox="10 10 80 80" fill="none" stroke="#FFFFFF" strokeWidth="7.5" strokeLinecap="round" role="img" aria-label="Querent"><circle cx="49" cy="49" r="28.5"/><path d="M60 60 81 82"/></svg>
        <span className={s.wordmark}>Querent</span>
      </div>
      <div className={s.org}>{ORG_NAME}</div>
      <nav className={s.nav} aria-label="Main">
        {SECTIONS.map(section=><Link key={section.id} href={section.href} className={s.link} aria-current={active?.id===section.id?'page':undefined}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={section.icon}/></svg>
          <span className={s.label}>{section.label}</span>
        </Link>)}
      </nav>
      <div className={s.spacer}/>
      <UserBlock email={email} onSignOut={onSignOut}/>
    </div>
  </aside>;
}

/** The rail's foot: who is signed in, and Sign out. */
function UserBlock({email,onSignOut}:{email:string;onSignOut:SignOutAction}){
  return <div className={s.user}>
    <div className={s.who}>
      <div className={s.avatar} aria-hidden="true">{email.charAt(0).toUpperCase()}</div>
      <div className={s.email} title={email}>{email}</div>
    </div>
    {/* React sets the method itself for a server action, and warns when one is given. */}
    <form method={typeof onSignOut==='string'?'post':undefined} action={onSignOut} className={s.signOutForm}>
      <button type="submit" className={s.signOut}>Sign out</button>
    </form>
  </div>;
}
