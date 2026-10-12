'use client';
import {useId,useLayoutEffect,useRef} from 'react';
import {useModal} from '../send/use-modal';
import {requestedAt} from '../format';
import type {TranscriptMessage} from './api';
import s from './ChatDrawer.module.css';

// The quote's whole chat in a right-hand drawer (plan U4, C_QE6; B1; decision 26; spec §9): "Full chat"
// with who, how many messages and the channel, then every message: the customer's on grey in bold,
// Querent's on the lighter tint, notices (item pop-up, quote requested, quote sent) as one muted italic
// line. No AI summary. Pages of 50 with "Load earlier" at the top (no frame: one plain button). Escape,
// the x or a click outside closes it; focus moves in on open and back to the Chat button on close.

/** "12 messages", "1 message". */
export const messageCount=(n:number)=>`${n} ${n===1?'message':'messages'}`;

const NOTICE_LABELS:Record<string,string>={item_popup:'Item pop-up',quote_requested:'Quote requested',quote_ready:'Quote sent'};
/** "Item pop-up", or the kind in words ("price_check" → "Price check"). */
const noticeLabel=(kind:string)=>NOTICE_LABELS[kind]??(kind.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase())||'Notice');
/** Querent's conversational turns; any other assistant or system message is a notice. */
const TURN_KINDS=new Set(['text','clarify']);

export interface ChatDrawerProps {
  /** "Dana Ortiz". */
  customer:string;
  /** Every message in the chat; null until the first page loads. */
  total:number|null;
  /** What has loaded, oldest first. */
  messages:readonly TranscriptMessage[];
  hasEarlier:boolean;
  loading:boolean;
  error:string|null;
  onLoadEarlier:()=>void;
  /** Loads the first page again, after it failed. */
  onRetry:()=>void;
  onClose:()=>void;
}

export function ChatDrawer({customer,total,messages,hasEarlier,loading,error,onLoadEarlier,onRetry,onClose}:ChatDrawerProps){
  const titleId=useId();
  const dialog=useRef<HTMLElement>(null);
  useModal(dialog,{onEscape:onClose});
  // Opens at the newest message; an older page added above keeps what the rep was reading in place.
  const scroll=useRef<{first:string|undefined;height:number}|null>(null);
  useLayoutEffect(()=>{
    const box=dialog.current;
    if(!box)return;
    const first=messages[0]?.id;
    if(!scroll.current)box.scrollTop=box.scrollHeight;
    else if(first!==scroll.current.first)box.scrollTop+=box.scrollHeight-scroll.current.height;
    scroll.current={first,height:box.scrollHeight};
  },[messages]);
  let noticesSeen=0;
  return <>
    <div className={s.backdrop} onPointerDown={onClose}/>
    <aside ref={dialog} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} aria-busy={loading||undefined}>
      <div className={s.head}>
        <div>
          <div id={titleId} className={s.title} role="heading" aria-level={2}>Full chat</div>
          <div className={s.sub}>{`${customer}${total!==null?`, ${messageCount(total)}`:''}, via Querent chat`}</div>
        </div>
        <button type="button" className={s.closeButton} onClick={onClose} aria-label="Close chat"><span className={s.close}>x</span></button>
      </div>
      {hasEarlier&&<button type="button" className={s.earlier} onClick={onLoadEarlier} disabled={loading}>Load earlier</button>}
      {error&&<p className={s.error} role="alert">{error}{total===null&&<button type="button" className={s.retry} onClick={onRetry} disabled={loading}>Try again</button>}</p>}
      {total===null&&!error?<p className={s.empty}>Loading the chat…</p>
        :total===0?<p className={s.empty}>No messages in this chat.</p>
        :<div role="list">{messages.map(m=>{
          const notice=!(m.role==='customer'||(m.role==='assistant'&&TURN_KINDS.has(m.kind)));
          const first=notice&&noticesSeen++===0;
          return <Message key={m.id} message={m} customer={customer} notice={notice} firstNotice={first}/>;
        })}</div>}
    </aside>
  </>;
}

function Message({message:m,customer,notice,firstNotice}:{message:TranscriptMessage;customer:string;notice:boolean;firstNotice:boolean}){
  const when=requestedAt(m.created_at);
  if(notice)return <div role="listitem" className={s.notice} data-first={firstNotice||undefined} data-role={m.role} data-kind={m.kind}>
    {`${noticeLabel(m.kind)}${m.content?`: ${m.content}`:''} ${when}`}
  </div>;
  const customerSaid=m.role==='customer';
  return <div role="listitem" className={s.message} data-role={m.role}>
    <div className={s.who}>{customerSaid?customer:'Querent'} <span className={s.when}>{when}</span></div>
    <div className={s.said} data-role={m.role}>{m.content}</div>
  </div>;
}
