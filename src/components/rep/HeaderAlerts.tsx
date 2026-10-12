'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Dropdown,DropdownItem,HeaderIconButton} from '@/components/ui';
import type {BadgeSummary,RepBadges} from '@/server/rep/badges';
import {useOptionalRepPortal} from './context';
import s from './HeaderAlerts.module.css';

// The caution (Needs attention) and bell (Notifications) at the right end of every rep page header
// (plan U2; C_QOBoard closed, C_QOB3 caution open, C_QOB4 bell open). Opening either never navigates
// (decision 50 and the style guide's behaviour rules); one is open at a time. Their rows come from
// GET /api/rep/badges (src/server/rep/badges.ts), which the shell polls.
//
// No frame (decision 50, listed in docs/plans/status.md): choosing a row opens that quote; an empty
// bell says "No notifications" (decision 52: one plain line).

/** "Sep 23, 4:14 PM" in the browser's time zone (decision 10), as C_QOB4 prints when a notification happened. */
const when=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});

/** C_QOB3's heading: "3 need your attention". */
export const attentionHeading=(n:number)=>`${n} ${n===1?'needs':'need'} your attention`;

/** The two buttons and their dropdowns, for a header's `right` slot (RepPageHeader puts them there). Nothing outside the shell. */
export function HeaderAlerts(){
  const portal=useOptionalRepPortal();
  return portal&&<Alerts badges={portal.badges}/>;
}

function Alerts({badges}:{badges:RepBadges}){
  const router=useRouter();
  const [open,setOpen]=useState<'caution'|'bell'|null>(null);
  const toggle=(which:'caution'|'bell')=>(next:boolean)=>setOpen(next?which:o=>o===which?null:o);
  const choose=(item:BadgeSummary)=>{setOpen(null);router.push(`/rep/quotes/${encodeURIComponent(item.quote_number)}`);};
  const red=badges.attention;
  return <>
    <Dropdown open={open==='caution'} onOpenChange={toggle('caution')} title={attentionHeading(badges.caution.length)}
      trigger={<HeaderIconButton tone="caution" icon="caution" open={open==='caution'} label={open==='caution'?'Needs attention, open':`Needs attention, ${red} ${red===1?'item':'items'}`}/>}>
      {badges.caution.map(item=><DropdownItem key={item.id} title={item.label} tag={item.tag??undefined} tone="problem" onSelect={()=>choose(item)}>{item.line}</DropdownItem>)}
    </Dropdown>
    <Dropdown open={open==='bell'} onOpenChange={toggle('bell')} title="Notifications"
      trigger={<HeaderIconButton tone="bell" icon="bell" open={open==='bell'} label={open==='bell'?'Notifications, open':'Notifications'}/>}>
      {badges.bell.length?badges.bell.map(item=><DropdownItem key={item.id} title={item.label} onSelect={()=>choose(item)}>{item.line??when.format(new Date(item.at))}</DropdownItem>)
        :<div className={s.empty}>No notifications</div>}
    </Dropdown>
  </>;
}

/** The same buttons on their own, at the far right of a header that is not a PageHeader yet (detail pages until U4, U5). */
export function HeaderAlertsBar(){
  return <div className={`ui-root ${s.bar}`}><HeaderAlerts/></div>;
}
