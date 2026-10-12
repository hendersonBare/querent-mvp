'use client';
import {useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import type {RepSettings} from '@/server/rep/settings';
import {AgingSettings} from './settings/AgingSettings';
import {RepPageHeader,repPageStyles as s} from './RepPage';
import {withCustomer} from './scope';
import {CustomerAccess} from './settings/CustomerAccess';
import {DataSources} from './settings/DataSources';
import {MarginFloors} from './settings/MarginFloors';
import {PricingDelivery} from './settings/PricingDelivery';

// Settings (spec §4, task 6.1), one tab per section in ?tab=: Customer access (its customer is the page's
// own ?customer=, picked on the tab, task U1), My margin floors, Pricing & delivery, and Data sources. The
// manager also gets Aging (v3 spec §6, task D1); a rep doesn't see that tab, and its routes answer 403.
// Rep assignments and Reps moved to Teams and Reps (plan U7, /rep/teams). The page renders it with the
// signed-in rep's settings; each tab saves through its route and keeps what the server stored.

export const SETTINGS_TABS=[
  {id:'access',label:'Customer access',manager:false},
  {id:'floors',label:'Margin floors',manager:false},
  {id:'pricing',label:'Pricing & delivery',manager:false},
  {id:'aging',label:'Aging',manager:true},
  {id:'sources',label:'Data sources',manager:false},
] as const;
export type SettingsTab=typeof SETTINGS_TABS[number]['id'];
export const DEFAULT_SETTINGS_TAB:SettingsTab='access';

/** The tabs the signed-in rep gets: the manager-only ones only for the manager. */
export const settingsTabs=(manager:boolean)=>SETTINGS_TABS.filter(t=>manager||!t.manager);
/** The tab in ?tab=, or Customer access for anything else (a manager-only tab, for a rep). */
export const settingsTab=(value:string|null|undefined,manager=false):SettingsTab=>settingsTabs(manager).find(t=>t.id===value)?.id??DEFAULT_SETTINGS_TAB;

export function SettingsSection({initial}:{initial:RepSettings}){
  const [settings,setSettings]=useState(initial);
  const manager=settings.manager;
  const params=useSearchParams(),pathname=usePathname(),router=useRouter();
  const tab=settingsTab(params.get('tab'),manager!==null);
  // Customer access's customer: one the rep may read (settings.assignments lists exactly those), or every customer.
  const accessCustomers=settings.assignments.map(({id,name})=>({id,name}));
  const accessLabel=accessCustomers.find(c=>c.id===settings.access.customer_id)?.name??'All customers';
  const query=params.toString();
  const pickAccessCustomer=(id:string|null)=>router.replace(withCustomer(query?`${pathname}?${query}`:pathname,id),{scroll:false});
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
    <RepPageHeader spaced title="Settings" description="Herrick Industrial Supply"/>
    <nav ref={tabsRef} className={s.tabs} aria-label="Settings sections">
      {settingsTabs(manager!==null).map(t=><Link key={t.id} href={`/rep/settings?tab=${t.id}`} aria-current={t.id===tab?'page':undefined}>{t.label}</Link>)}
    </nav>
    {tab==='access'&&<CustomerAccess access={settings.access} scopeLabel={accessLabel} customers={accessCustomers} onPick={pickAccessCustomer} onChange={update('access')}/>}
    {tab==='floors'&&<MarginFloors mine={settings.floors.mine} others={settings.floors.others} onSaved={mine=>setSettings(current=>({...current,floors:{...current.floors,mine}}))}/>}
    {tab==='pricing'&&<PricingDelivery pricing={settings.pricing} delivery={settings.delivery} manager={manager!==null} onPricing={update('pricing')} onDelivery={update('delivery')}/>}
    {tab==='aging'&&manager&&<AgingSettings aging={manager.aging} onSaved={aging=>setSettings(current=>({...current,manager:current.manager&&{...current.manager,aging}}))}/>}
    {tab==='sources'&&<DataSources initial={settings.sources}/>}
  </>;
}
