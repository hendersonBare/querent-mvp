import type {ReactNode} from 'react';
import {ORG_NAME} from '@/features/shell/nav';
import s from './Auth.module.css';

// The frame of the sign-in screens (/login, /reset-password, /update-password): the Querent mark and
// wordmark, the org, then the screen's title, a line under it and its form.

export function AuthCard({title,lead,children,foot}:{title:string;lead?:ReactNode;children:ReactNode;foot?:ReactNode}){
  return <main className={`ui-root ${s.page}`}>
    <div className={s.card}>
      <div className={s.brand}>
        <svg width="36" height="36" viewBox="10 10 80 80" fill="none" stroke="var(--q-accent)" strokeWidth="7.5" strokeLinecap="round" role="img" aria-label="Querent"><circle cx="49" cy="49" r="28.5"/><path d="M60 60 81 82"/></svg>
        <span className={s.wordmark}>Querent</span>
      </div>
      <div className={s.org}>{ORG_NAME}</div>
      <h1 className={s.title}>{title}</h1>
      {lead?<p className={s.lead}>{lead}</p>:null}
      {children}
      {foot?<p className={s.foot}>{foot}</p>:null}
    </div>
  </main>;
}
