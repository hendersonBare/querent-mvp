'use client';
import {createContext,useContext} from 'react';
import type {API} from '@/lib/contracts';
import type {RepBadges} from '@/server/rep/badges';

// What every rep portal page can use: the signed-in rep, the API client and the nav badges
// (useRepPortal). RepShell provides it. There is no portal-wide customer scope (task U1): the
// server scopes every read by role, and ?customer= is each page's own filter.

export interface RepIdentity {id:string;name:string;initials:string;title:string;
  /** The manager (v3 spec §8, task D1): reads the whole organization (task U1) and can reassign quotes (task D2). */
  manager?:boolean}

export interface RepPortalValue {
  rep:RepIdentity;
  /** The supplier: "Herrick Industrial Supply". */
  org:string;
  api:API;
  badges:RepBadges;
  /** Re-reads the badges now (e.g. after a page marks a quote read), instead of waiting for the poll. */
  refreshBadges:()=>void;
  /** Ends the demo session and returns to the workspace chooser. */
  signOut:()=>void;
}

export const RepPortalContext=createContext<RepPortalValue|null>(null);

export function useRepPortal():RepPortalValue{
  const value=useContext(RepPortalContext);
  if(!value)throw new Error('useRepPortal() needs the rep portal shell (src/app/rep/layout.tsx).');
  return value;
}
