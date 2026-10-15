'use client';
import {useState,type ReactNode} from 'react';
import {Toggle} from '@/components/ui';
import {NOTIFICATION_GROUPS} from '@/domain';
import type {NotificationPrefs} from '@/server/rep/notification-prefs';
import {saveNotificationPrefs} from './api';
import {Card,GridHead,Problem,SaveButton,SettingsFrame} from './parts';
import s from './Settings.module.css';

// Settings > Notifications, a rep's (plan U9; C_RS4): in-app switches only, in two cards, the four that feed
// the caution dropdown (Needs attention) and the four that feed the bell (Notifications). Each card's Save
// notifications stores its own four (PUT /api/rep/notification-prefs); the header's dropdowns follow them
// (GET /api/rep/badges). No frame: the "Saved" line and one red line for a refusal (decision 52).

export function RepNotifications({initial,tabs}:{initial:NotificationPrefs;tabs:ReactNode}){
  return <SettingsFrame tabs={tabs}>
    {NOTIFICATION_GROUPS.map(group=><NotificationCard key={group.title} group={group} initial={initial}/>)}
  </SettingsFrame>;
}

function NotificationCard({group,initial}:{group:(typeof NOTIFICATION_GROUPS)[number];initial:NotificationPrefs}){
  const [on,setOn]=useState(()=>Object.fromEntries(group.items.map(i=>[i.key,initial[i.key]])) as Partial<NotificationPrefs>);
  const [saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  async function save(){
    if(saving)return;
    setSaving(true);setError('');setSaved(false);
    try{
      const next=await saveNotificationPrefs(on);
      setOn(Object.fromEntries(group.items.map(i=>[i.key,next[i.key]])));
      setSaved(true);
    }catch(e){setError(e instanceof Error?e.message:'Your notifications weren’t saved. Try again.');}
    finally{setSaving(false);}
  }
  return <Card title={group.title} saved={saved} action={<SaveButton label="Save notifications" drawnOff disabled={saving} onClick={()=>void save()}/>}>
    <Problem>{error}</Problem>
    <div role="table" aria-label={group.title}>
      <GridHead className={s.notifyGrid} labels={[group.title,'In app']}/>
      {group.items.map(item=><div key={item.key} role="row" className={`${s.gridRow} ${s.notifyGrid}`}>
        <div role="rowheader"><div className={s.floorName}>{item.label}</div></div>
        <div role="cell"><Toggle label={item.label} checked={on[item.key]??true} disabled={saving} onChange={checked=>{setOn(o=>({...o,[item.key]:checked}));setSaved(false);setError('');}}/></div>
      </div>)}
    </div>
  </Card>;
}
