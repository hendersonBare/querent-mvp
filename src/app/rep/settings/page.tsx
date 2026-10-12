import type {Metadata} from 'next';
import {SettingsSection} from '@/components/rep/SettingsSection';
import {ALL_CUSTOMERS,CUSTOMER_PARAM} from '@/components/rep/scope';
import {ensureHeartbeat} from '@/server/heartbeat';
import {repSettings} from '@/server/rep/settings';
import {signedInRep} from '@/server/rep/session';

export const metadata:Metadata={title:'Settings'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;
const single=(value:string|string[]|undefined)=>typeof value==='string'?value:null;

/**
 * Settings (spec §4, task 6.1): Rep assignments (a rep's own customers, every customer for the
 * manager, task U1), Customer access for the page's own ?customer=, My margin floors, Pricing & delivery, and Data sources (?tab=); for the manager also
 * Reps and Aging (v3 spec §6, task D1). Rendered here with
 * the signed-in rep's settings; the tabs then save through /api/rep/settings/*.
 */
export default async function SettingsPage({searchParams}:{searchParams:SearchParams}){
  const {repId,manager}=await signedInRep();
  ensureHeartbeat();
  const customer=single((await searchParams)[CUSTOMER_PARAM]);
  const settings=repSettings(repId,{customerId:customer===ALL_CUSTOMERS?null:customer,manager});
  // A new customer filter is a new Customer access list: remount, so no tab keeps the old one's state.
  return <SettingsSection key={settings.access.customer_id??ALL_CUSTOMERS} initial={settings}/>;
}
