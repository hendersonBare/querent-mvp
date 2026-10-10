'use client';
import {createContext,useCallback,useContext,useMemo} from 'react';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import type {CustomerListItem} from '@/domain';
import type {API} from '@/lib/contracts';
import type {RepBadges} from '@/server/rep/badges';
import {REPS_PARAM,isAllReps,scopeFrom,scopedHref} from './scope';

// What every rep portal page can use: the signed-in rep, the customer list, the API client, the
// nav badges (useRepPortal), and the "Viewing" picker's scope (useRepScope). RepShell provides it.

export interface RepIdentity {id:string;name:string;initials:string;title:string;
  /** The manager (v3 spec §8, task D1): sees every rep's quotes and can reassign them (task D2). */
  manager?:boolean}

export interface RepPortalValue {
  rep:RepIdentity;
  /** The supplier: "Herrick Industrial Supply". */
  org:string;
  /** Every customer, by name: the picker's options. */
  customers:CustomerListItem[];
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

export interface RepScope {
  /** The picked customer's id, or null for All customers. */
  customerId:string|null;
  /** The picked customer, or null for All customers. */
  customer:CustomerListItem|null;
  /** "All customers" or the picked customer's name. */
  label:string;
  /** Picks a customer (null for All customers). Keeps the current page and its other params. */
  setCustomer:(customerId:string|null)=>void;
  /** The manager's All reps scope (?scope=all, task D2); always false for a rep. */
  allReps:boolean;
  /**
   * A portal link that keeps the picked customer, and the manager's All reps scope:
   * href('/rep/settings') -> '/rep/settings?customer=wasatch'. `allReps` switches the scope instead.
   */
  href:(path:string,allReps?:boolean)=>string;
}

/** The "Viewing" picker's scope, read from ?customer=, and the manager's ?scope=all (see ./scope). */
export function useRepScope():RepScope{
  const {customers,rep}=useRepPortal();
  const params=useSearchParams(),pathname=usePathname(),router=useRouter();
  const customerId=scopeFrom(params,customers);
  const allReps=!!rep.manager&&isAllReps(params.get(REPS_PARAM));
  const query=params.toString();
  const setCustomer=useCallback((id:string|null)=>{
    router.replace(scopedHref(query?`${pathname}?${query}`:pathname,id),{scroll:false});
  },[router,pathname,query]);
  return useMemo(()=>{
    const customer=customers.find(c=>c.id===customerId)??null;
    return {customerId,customer,label:customer?.name??'All customers',setCustomer,allReps,
      href:(path:string,all=allReps)=>scopedHref(path,customerId,all)};
  },[customers,customerId,setCustomer,allReps]);
}
