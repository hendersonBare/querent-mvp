'use client';
import {useCallback,useMemo,type ReactNode} from 'react';
import {createAPI} from '@/lib/api';
import {usePoll} from '@/lib/use-poll';
import type {RepBadges} from '@/server/rep/badges';
import {RepPortalContext,type RepIdentity,type RepPortalValue} from './context';
import {Rail,exit} from './Rail';
import s from './RepShell.module.css';

// The rep portal shell (plan U2): the left rail (./Rail; C_QOBoard, C_RQBoard) and the page area,
// which takes the rest of the width (decision 51: fluid, no max-width, no breakpoints, decision 43).
//
// How a page uses it:
//   - Its first child is its header: <RepPageHeader title="…">{picker, search, Filter}</RepPageHeader>
//     (./RepPage). The header puts the caution and bell (./HeaderAlerts, C_QOB3, C_QOB4) on the right.
//   - useRepPortal() (./context) gives the signed-in rep, the API client and the polled badges.
//   - The page area has the frames' page padding (24 32 40). A page wraps its body in .ui-root
//     (src/app/tokens.css).
//
// Scope is role based on the server (task U1): no "Viewing" picker, no ?customer= or ?scope= on any
// link. No search, avatar menu, "Switch workspace" or role switch (decision 42).

/** How often the header badges are re-read, so a customer's new request shows up without a reload. */
export const BADGE_POLL_MS=5000;

export interface RepShellProps {
  rep:RepIdentity;org:string;
  /** The badges as the server rendered them; the shell then polls GET /api/rep/badges. */
  initialBadges:RepBadges;
  children:ReactNode;
}

const leave=()=>exit.to('/');

/** GET /api/rep/badges, scoped by role on the server (task U1). */
async function loadBadges():Promise<RepBadges>{
  const response=await fetch('/api/rep/badges',{cache:'no-store'});
  if(response.status===401||response.status===403){leave();throw new Error('Sign in to continue.');}
  if(!response.ok)throw new Error('Unable to load notifications.');
  return response.json();
}

export function RepShell({rep,org,initialBadges,children}:RepShellProps){
  // Sign out (C_QOB9): DELETE /api/session clears the session cookie, then `/` (decision 53).
  const signOut=useCallback(()=>{void fetch('/api/session',{method:'DELETE'}).finally(leave);},[]);
  const api=useMemo(()=>createAPI(leave),[]);
  const {data,refresh}=usePoll(loadBadges,BADGE_POLL_MS);
  const badges=data??initialBadges;
  const value=useMemo<RepPortalValue>(()=>({rep,org,api,badges,refreshBadges:()=>void refresh(),signOut}),[rep,org,api,badges,refresh,signOut]);
  return <RepPortalContext.Provider value={value}>
    <div className={s.shell}>
      <Rail/>
      <main className={s.page}>{children}</main>
    </div>
  </RepPortalContext.Provider>;
}
