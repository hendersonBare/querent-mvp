import type {Metadata} from 'next';
import {SettingsSection} from '@/components/rep/SettingsSection';
import {ALL_CUSTOMERS,SCOPE_PARAM} from '@/components/rep/scope';
import {ensureHeartbeat} from '@/server/heartbeat';
import {repSettings} from '@/server/rep/settings';
import {signedInRepId} from '@/server/rep/session';

export const metadata:Metadata={title:'Settings'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;
const single=(value:string|string[]|undefined)=>typeof value==='string'?value:null;

/**
 * Settings (spec §4, task 6.1): Rep assignments, Customer access for the "Viewing" picker
 * (?customer=), My margin floors, Pricing & delivery, and Data sources (?tab=). Rendered here with
 * the signed-in rep's settings; the tabs then save through /api/rep/settings/*.
 */
export default async function SettingsPage({searchParams}:{searchParams:SearchParams}){
  const repId=await signedInRepId();
  ensureHeartbeat();
  const customer=single((await searchParams)[SCOPE_PARAM]);
  const settings=repSettings(repId,{customerId:customer===ALL_CUSTOMERS?null:customer});
  // A new picker scope is a new Customer access list: remount, so no tab keeps the old scope's state.
  return <SettingsSection key={settings.access.customer_id??ALL_CUSTOMERS} initial={settings}/>;
}
