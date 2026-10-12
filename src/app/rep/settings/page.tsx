import type {Metadata} from 'next';
import {SettingsSection} from '@/components/rep/SettingsSection';
import {CUSTOMER_PARAM} from '@/components/rep/scope';
import {ensureHeartbeat} from '@/server/heartbeat';
import {repSettings} from '@/server/rep/settings';
import {signedInRep} from '@/server/rep/session';

export const metadata:Metadata={title:'Settings'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;
const single=(value:string|string[]|undefined)=>typeof value==='string'?value:null;

/**
 * Settings (spec §4, task 6.1; plan U8): the manager's Customer access, Margin floors, Pricing and delivery
 * and Aging (?tab=), with the feature flags read on the server (decision 48); ?customer=<id> opens Customer
 * access searched for that customer (Analytics' Manage customer access). A rep gets their own margin floors
 * only. Rendered here with the signed-in rep's settings; the tabs then save through /api/rep/settings/*.
 */
export default async function SettingsPage({searchParams}:{searchParams:SearchParams}){
  const {repId,manager}=await signedInRep();
  ensureHeartbeat();
  const params=await searchParams;
  const settings=repSettings(repId,{customerId:manager?single(params[CUSTOMER_PARAM]):null,manager});
  // A new ?customer= or ?tab= is a new tab: remount, so no tab keeps the old one's state.
  return <SettingsSection key={`${single(params.tab)??''}:${single(params[CUSTOMER_PARAM])??''}`} initial={settings}/>;
}
