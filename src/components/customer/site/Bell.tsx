'use client';
import {useCallback,useEffect,useRef,useState,type KeyboardEvent} from 'react';
import type {CustomerNotification,CustomerNotifications} from '@/domain';
import type {API} from '@/lib/contracts';
import {everyWhileVisible} from '@/lib/use-poll';
import {Icon} from '@/components/ui/Icon';
import {Popover} from '@/components/ui/Popover';
import {cx} from '@/components/ui/cx';
import {emitOpenQuote} from '../open-quote';
import {onQuotesChanged} from '../quotes-changed';
import {timeAgo} from './time-ago';
import s from './site.module.css';

/** How often the bell reads its notifications again: like the rep badges (BADGE_POLL_MS). */
export const NOTIFICATION_POLL_MS=5000;

/** Enter or Space on a row drawn as a box (the frame draws rows and "Mark all read" as text, not buttons). */
const onKey=(run:()=>void)=>(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();run();}};

/**
 * The notification bell (plan U10; decision 41; C_CVL1, open: C_CVL4): the unread count on the
 * button, and a dropdown of short notifications, newest first, each with its unread dot, title, one
 * line and when. A quote notification opens the quote preview (Accept, Request changes, Decline); any
 * notification pressed is marked read, and "Mark all read" marks them all. It polls like the rep
 * badges, and reads again when the customer answers a quote or requests one (quotes-changed).
 */
export function Bell({api,now,pollMs=NOTIFICATION_POLL_MS}:{api:API;now?:string;pollMs?:number}){
  const [data,setData]=useState<CustomerNotifications|null>(null);
  const [open,setOpen]=useState(false);
  const wrap=useRef<HTMLDivElement>(null);
  const generation=useRef(0);
  const load=useCallback(()=>{
    const version=++generation.current;
    api.get<CustomerNotifications>('customer/notifications').then(next=>{if(version===generation.current)setData(next);}).catch(()=>{});
  },[api]);
  useEffect(()=>{
    load();
    const stop=everyWhileVisible(load,pollMs);
    const unsubscribe=onQuotesChanged(load);
    return ()=>{stop();unsubscribe();generation.current++;};
  },[load,pollMs]);

  function markRead(body:{ids:string[]}|{all:true}){
    generation.current++;
    api.send<CustomerNotifications>('customer/notifications/read','POST',body).then(setData).catch(()=>{});
  }
  function choose(n:CustomerNotification){
    if(!n.read)markRead({ids:[n.id]});
    if(n.quote){setOpen(false);emitOpenQuote({id:n.quote.id,quote_number:n.quote.quote_number});}
  }
  const at=now??new Date().toISOString();
  const unread=data?.unread??0;
  return <div ref={wrap} className={s.bellWrap}>
    <button type="button" aria-label="Notifications" aria-haspopup="dialog" aria-expanded={open} className={cx(s.bell,open&&s.bellOpen)} onClick={()=>setOpen(o=>!o)}>
      <Icon name="bell" size={19}/>
      {unread>0&&<span className={s.badge}>{unread}</span>}
    </button>
    <Popover open={open} label="Notifications" onClose={()=>setOpen(false)} ignore={wrap} className={s.panel} data-ui="bell-panel">
      <div className={s.panelHead}>
        <span className={s.panelTitle}>Notifications</span>
        <span role="button" tabIndex={0} className={s.markAll} onClick={()=>markRead({all:true})} onKeyDown={onKey(()=>markRead({all:true}))}>Mark all read</span>
      </div>
      {data&&!data.items.length&&<div className={s.panelEmpty}>No notifications yet.</div>}
      {data?.items.map(n=><div key={n.id} role="button" tabIndex={0} className={s.note} data-read={String(n.read)} onClick={()=>choose(n)} onKeyDown={onKey(()=>choose(n))}>
        <span className={cx(s.dot,n.read&&s.dotRead)}/>
        <div className={s.noteText}><div className={s.noteTitle}>{n.title}</div><div className={s.noteBody}>{n.body}</div></div>
        <span className={s.noteWhen}>{timeAgo(n.at,at,{dayOnly:n.day_only})}</span>
      </div>)}
    </Popover>
  </div>;
}
