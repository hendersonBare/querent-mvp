'use client';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {cx} from '@/components/ui/cx';
import type {RepSettings} from '@/server/rep/settings';
import {AgingSettings} from './settings/AgingSettings';
import {CustomerAccess} from './settings/CustomerAccess';
import {MarginFloors,MyFloors} from './settings/MarginFloors';
import {PricingDelivery} from './settings/PricingDelivery';
import s from './settings/Settings.module.css';

// Settings (spec §4, task 6.1; plan U8; C_S1 to C_S8), one tab per section in ?tab=. The manager's tabs are
// Customer access, Margin floors, Pricing and delivery and Aging (Appendix B). Data sources is gone; Rep
// assignments and Reps moved to Teams and Reps (plan U7). A rep gets one tab, their own margin floors, until
// their own tabs come (plan U9; listed under "No frame"). The page renders it with the signed-in rep's
// settings; each tab saves through its route and keeps what the server stored.

export const MANAGER_TABS=[
  {id:'access',label:'Customer access'},
  {id:'floors',label:'Margin floors'},
  {id:'pricing',label:'Pricing and delivery'},
  {id:'aging',label:'Aging'},
] as const;
const REP_TABS=[{id:'floors',label:'Margin floors'}] as const;
export type SettingsTab=typeof MANAGER_TABS[number]['id'];

/** The tab in ?tab=, or the first tab for anything else (a removed tab, or a manager tab for a rep). */
export function settingsTab(value:string|null|undefined,manager:boolean):SettingsTab{
  const tabs:readonly {id:SettingsTab}[]=manager?MANAGER_TABS:REP_TABS;
  return tabs.find(t=>t.id===value)?.id??tabs[0].id;
}

export function SettingsSection({initial}:{initial:RepSettings}){
  const params=useSearchParams();
  const {manager}=initial;
  const tab=settingsTab(params.get('tab'),manager!==null);
  const tabs=<nav className={cx('ui-root',s.tabs)} aria-label="Settings sections">
    {(manager?MANAGER_TABS:REP_TABS).map(t=><Link key={t.id} href={`/rep/settings?tab=${t.id}`} className={s.tab} aria-current={t.id===tab?'page':undefined}>{t.label}</Link>)}
  </nav>;
  if(!manager)return <MyFloors mine={initial.mine} tabs={tabs}/>;
  switch(tab){
    case 'floors':return <MarginFloors orgFloors={manager.orgFloors} repMargins={manager.repMargins} meId={initial.rep_id} tabs={tabs}/>;
    case 'pricing':return <PricingDelivery pricing={manager.pricing} delivery={manager.delivery} flags={manager.flags} tabs={tabs}/>;
    case 'aging':return <AgingSettings aging={manager.aging} tabs={tabs}/>;
    default:return <CustomerAccess initialRules={manager.access} initialTable={manager.accessTable} tabs={tabs}/>;
  }
}
