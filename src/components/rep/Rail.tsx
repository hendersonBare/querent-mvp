'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useRepPortal} from './context';
import {sectionFor,sectionsFor,shortName} from './scope';
import s from './Rail.module.css';

// The left rail (plan U2; the left edge of every page frame: C_QOBoard for the manager, C_RQBoard for
// a rep): 216px charcoal, sticky at the top as the page scrolls. The Querent logo, the supplier, the
// nav for the reader's role (./scope sectionsFor), then the user block: initials, short name, role
// and Sign out, which asks first (C_QOB9). No search, no avatar menu, no role switch (decision 42).

/** Where Sign out sends the browser (decision 53: `/`, the visitor box). An object so tests can stub it. */
export const exit={to:(path:string)=>window.location.assign(path)};

export function Rail(){
  const {rep,org,signOut}=useRepPortal();
  const active=sectionFor(usePathname());
  const [asking,setAsking]=useState(false);
  const signOutButton=useRef<HTMLButtonElement>(null);
  const name=shortName(rep.name);
  const role=rep.manager?'Manager':'Rep';
  return <aside className={`ui-root ${s.rail}`}>
    <div className={s.inner}>
      <div className={s.brand}>
        <svg width="40" height="40" viewBox="10 10 80 80" fill="none" stroke="#FFFFFF" strokeWidth="7.5" strokeLinecap="round" role="img" aria-label="Querent"><circle cx="49" cy="49" r="28.5"/><path d="M60 60 81 82"/></svg>
        <span className={s.wordmark}>Querent</span>
      </div>
      <div className={s.org}>{org}</div>
      <nav className={s.nav} aria-label="Rep portal">
        {sectionsFor(!!rep.manager).map(section=>{
          const current=active?.id===section.id;
          return <Link key={section.id} href={section.href} className={s.link} aria-current={current?'page':undefined}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={section.icon}/></svg>
            {/* The frame's label is a span holding a span (its template's text slot). */}
            <span className={s.label}><span>{section.label}</span></span>
          </Link>;
        })}
      </nav>
      <div className={s.spacer}/>
      <div className={s.user}>
        <div className={s.who}>
          <div className={s.avatar} aria-hidden="true">{rep.initials}</div>
          <div><div className={s.name}>{name}</div><div className={s.role}>{role}</div></div>
        </div>
        <button ref={signOutButton} type="button" className={s.signOut} onClick={()=>setAsking(true)}>Sign out</button>
      </div>
    </div>
    {asking&&<SignOutDialog who={`${name}, ${role} at ${org}`} onCancel={()=>{setAsking(false);signOutButton.current?.focus();}} onConfirm={signOut}/>}
  </aside>;
}

/** C_QOB9: "Sign out of Querent?" over the dimmed page. Focus stays inside; Escape or Cancel keeps the session. */
function SignOutDialog({who,onCancel,onConfirm}:{who:string;onCancel:()=>void;onConfirm:()=>void}){
  const titleId=useId();
  const cancel=useRef<HTMLButtonElement>(null),confirm=useRef<HTMLButtonElement>(null);
  const close=useRef(onCancel);
  useEffect(()=>{close.current=onCancel;});
  useEffect(()=>{
    cancel.current?.focus();
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close.current();};
    document.addEventListener('keydown',key);
    return()=>document.removeEventListener('keydown',key);
  },[]);
  // Two buttons: Tab and Shift+Tab move between them and never leave the dialog.
  const trap=(event:ReactKeyboardEvent)=>{
    if(event.key!=='Tab')return;
    event.preventDefault();
    (document.activeElement===cancel.current?confirm:cancel).current?.focus();
  };
  return <>
    <div className={s.backdrop} data-ui="sign-out-backdrop" onClick={onCancel}/>
    <div className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={trap}>
      <div id={titleId} className={s.dialogTitle}>Sign out of Querent?</div>
      <div className={s.dialogBody}>{`You are signed in as ${who}.`}</div>
      <div className={s.dialogActions}>
        <button ref={cancel} type="button" className={s.cancel} onClick={onCancel}>Cancel</button>
        <button ref={confirm} type="button" className={s.confirm} onClick={onConfirm}>Sign out</button>
      </div>
    </div>
  </>;
}
