'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import type {RepSettings} from '@/server/rep/settings';
import {useRepScope} from './context';
import {RepPageHeader,repPageStyles as s} from './RepPage';
import {CustomerAccess} from './settings/CustomerAccess';
import {DataSources} from './settings/DataSources';
import {MarginFloors} from './settings/MarginFloors';
import {PricingDelivery} from './settings/PricingDelivery';
import {RepAssignments} from './settings/RepAssignments';

// Settings (spec §4, task 6.1), one tab per section in ?tab=: Rep assignments, Customer access
// (follows the "Viewing" picker), My margin floors, Pricing & delivery, and Data sources. The page
// renders it with the signed-in rep's settings; each tab saves through /api/rep/settings/* and
// keeps what the server stored.

export const SETTINGS_TABS=[
  {id:'assignments',label:'Rep assignments'},
  {id:'access',label:'Customer access'},
  {id:'floors',label:'Margin floors'},
  {id:'pricing',label:'Pricing & delivery'},
  {id:'sources',label:'Data sources'},
] as const;
export type SettingsTab=typeof SETTINGS_TABS[number]['id'];
export const DEFAULT_SETTINGS_TAB:SettingsTab='assignments';

/** The tab in ?tab=, or Rep assignments for anything else. */
export const settingsTab=(value:string|null|undefined):SettingsTab=>SETTINGS_TABS.find(t=>t.id===value)?.id??DEFAULT_SETTINGS_TAB;

export function SettingsSection({initial}:{initial:RepSettings}){
  const scope=useRepScope();
  const tab=settingsTab(useSearchParams().get('tab'));
  const [settings,setSettings]=useState(initial);
  const update=<K extends keyof RepSettings>(key:K)=>(value:RepSettings[K])=>setSettings(current=>({...current,[key]:value}));
  const tabsRef=useRef<HTMLElement>(null);
  // On a phone the tabs are a scrolling strip: keep the current one in view, as the portal nav does.
  useEffect(()=>{
    const strip=tabsRef.current,link=strip?.querySelector<HTMLElement>('[aria-current="page"]');
    if(!strip||!link||strip.scrollWidth<=strip.clientWidth)return;
    const left=link.offsetLeft-strip.offsetLeft;
    if(left<strip.scrollLeft||left+link.offsetWidth>strip.scrollLeft+strip.clientWidth)strip.scrollLeft=Math.max(0,left-12);
  },[tab]);
  return <>
    <RepPageHeader title="Settings" description={tab==='access'?`Viewing ${scope.label}`:'Herrick Industrial Supply'}/>
    <nav ref={tabsRef} className={s.tabs} aria-label="Settings sections">
      {SETTINGS_TABS.map(t=><Link key={t.id} href={scope.href(`/rep/settings?tab=${t.id}`)} aria-current={t.id===tab?'page':undefined}>{t.label}</Link>)}
    </nav>
    {tab==='assignments'&&<RepAssignments rows={settings.assignments} reps={settings.reps} repId={settings.rep_id} onChange={update('assignments')}/>}
    {tab==='access'&&<CustomerAccess access={settings.access} scopeLabel={scope.label} onChange={update('access')}/>}
    {tab==='floors'&&<MarginFloors mine={settings.floors.mine} others={settings.floors.others} onSaved={mine=>setSettings(current=>({...current,floors:{...current.floors,mine}}))}/>}
    {tab==='pricing'&&<PricingDelivery pricing={settings.pricing} delivery={settings.delivery} onPricing={update('pricing')} onDelivery={update('delivery')}/>}
    {tab==='sources'&&<DataSources initial={settings.sources}/>}
  </>;
}
