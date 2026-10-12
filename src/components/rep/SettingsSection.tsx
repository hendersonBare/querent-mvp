'use client';
import Link from 'next/link';
import {useSearchParams} from 'next/navigation';
import {cx} from '@/components/ui/cx';
import type {RepSettings} from '@/server/rep/settings';
import {AgingSettings} from './settings/AgingSettings';
import {CustomerAccess} from './settings/CustomerAccess';
import {MarginFloors} from './settings/MarginFloors';
import {PricingDelivery} from './settings/PricingDelivery';
import {RepMargins} from './settings/RepMargins';
import {RepNotifications} from './settings/RepNotifications';
import {RepProfile} from './settings/RepProfile';
import s from './settings/Settings.module.css';

// Settings (spec §4, task 6.1; plans U8, U9), one tab per section in ?tab=. The manager's tabs are Customer
// access, Margin floors, Pricing and delivery and Aging (C_S1 to C_S8; Appendix B), then her own Profile, the
// rep's C_RS2 component, because customers see her in My rep (decision 69). Data sources is gone; Rep
// assignments and Reps moved to Teams and Reps (plan U7). A rep's are Margins, Profile and Notifications
// (C_RS1 to C_RS4), nothing else. The page renders it with the signed-in rep's settings; each tab saves
// through its route and keeps what the server stored.

export const MANAGER_TABS=[
  {id:'access',label:'Customer access'},
  {id:'floors',label:'Margin floors'},
  {id:'pricing',label:'Pricing and delivery'},
  {id:'aging',label:'Aging'},
  {id:'profile',label:'Profile'},
] as const;
export const REP_TABS=[
  {id:'margins',label:'Margins'},
  {id:'profile',label:'Profile'},
  {id:'notifications',label:'Notifications'},
] as const;
export type SettingsTab=typeof MANAGER_TABS[number]['id']|typeof REP_TABS[number]['id'];

/** The tab in ?tab=, or the first tab for anything else (a removed tab, or another role's tab). */
export function settingsTab(value:string|null|undefined,manager:boolean):SettingsTab{
  const tabs:readonly {id:SettingsTab}[]=manager?MANAGER_TABS:REP_TABS;
  return tabs.find(t=>t.id===value)?.id??tabs[0].id;
}

export function SettingsSection({initial}:{initial:RepSettings}){
  const params=useSearchParams();
  const {manager,own}=initial;
  const tab=settingsTab(params.get('tab'),manager!==null);
  const tabs=<nav className={cx('ui-root',s.tabs)} aria-label="Settings sections">
    {(manager?MANAGER_TABS:REP_TABS).map(t=><Link key={t.id} href={`/rep/settings?tab=${t.id}`} className={s.tab} aria-current={t.id===tab?'page':undefined}>{t.label}</Link>)}
  </nav>;
  if(!manager){
    if(!own)return null;
    switch(tab){
      case 'profile':return <RepProfile initial={own.profile} tabs={tabs}/>;
      case 'notifications':return <RepNotifications initial={own.notifications} tabs={tabs}/>;
      default:return <RepMargins mine={initial.mine} orgFloors={own.orgFloors} tabs={tabs}/>;
    }
  }
  switch(tab){
    case 'floors':return <MarginFloors orgFloors={manager.orgFloors} repMargins={manager.repMargins} meId={initial.rep_id} tabs={tabs}/>;
    case 'pricing':return <PricingDelivery pricing={manager.pricing} delivery={manager.delivery} flags={manager.flags} tabs={tabs}/>;
    case 'aging':return <AgingSettings aging={manager.aging} tabs={tabs}/>;
    case 'profile':return <RepProfile initial={manager.profile} tabs={tabs}/>;
    default:return <CustomerAccess initialRules={manager.access} initialTable={manager.accessTable} tabs={tabs}/>;
  }
}
