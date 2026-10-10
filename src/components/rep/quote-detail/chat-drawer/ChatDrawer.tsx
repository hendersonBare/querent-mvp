'use client';
import {useId,useLayoutEffect,useRef,useState} from 'react';
import {ChevronRight,X} from 'lucide-react';
import {useModal} from '../send/use-modal';
import {requestedAt} from '../format';
import type {TranscriptMessage} from './api';
import s from './ChatDrawer.module.css';

// The quote's whole chat in a right-hand drawer (B1; decision 26; spec §9): the customer's
// messages emphasised (bold, Querent-green left accent), Querent's turns one line each until
// expanded, notices (item pop-up, quote requested, quote sent) one muted line. No AI summary.
// Pages of 50 with "Load earlier" at the top. Escape, the X or a click outside closes it; focus
// moves in on open and back to "View full chat" on close (useModal). Full width on a phone.

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
  const dialog=useRef<HTMLElement>(null),body=useRef<HTMLDivElement>(null);
  useModal(dialog,{onEscape:onClose});
  // Opens at the newest message; an older page added above keeps what the rep was reading in place.
  const scroll=useRef<{first:string|undefined;height:number}|null>(null);
  useLayoutEffect(()=>{
    const box=body.current;
    if(!box)return;
    const first=messages[0]?.id;
    if(!scroll.current)box.scrollTop=box.scrollHeight;
    else if(first!==scroll.current.first)box.scrollTop+=box.scrollHeight-scroll.current.height;
    scroll.current={first,height:box.scrollHeight};
  },[messages]);
  return <div className={s.backdrop} onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <aside ref={dialog} className={s.drawer} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className={s.head}>
        <div className={s.titles}>
          <h2 id={titleId}>Full chat</h2>
          <p>{customer}{total!==null&&` · ${messageCount(total)}`} · via Querent chat</p>
        </div>
        <button type="button" className={s.close} onClick={onClose} aria-label="Close chat"><X aria-hidden="true" size={18} strokeWidth={2}/></button>
      </header>
      <div ref={body} className={s.body} aria-busy={loading||undefined}>
        {hasEarlier&&<button type="button" className={s.earlier} onClick={onLoadEarlier} disabled={loading}>Load earlier</button>}
        {error&&<p className={s.error} role="alert">{error}{total===null&&<> <button type="button" className={s.retry} onClick={onRetry} disabled={loading}>Try again</button></>}</p>}
        {total===null&&!error?<p className={s.empty}>Loading the chat…</p>
          :total===0?<p className={s.empty}>No messages in this chat.</p>
          :<ol className={s.list}>{messages.map(m=><Message key={m.id} message={m} customer={customer}/>)}</ol>}
      </div>
    </aside>
  </div>;
}

const When=({at}:{at:string})=><time dateTime={at}>{requestedAt(at)}</time>;

function Message({message:m,customer}:{message:TranscriptMessage;customer:string}){
  if(m.role==='customer')return <li className={s.customer} data-role="customer">
    <p className={s.meta}><span>{customer}</span><When at={m.created_at}/></p>
    <strong className={s.said}>{m.content}</strong>
  </li>;
  if(m.role==='assistant'&&TURN_KINDS.has(m.kind))return <AssistantTurn message={m}/>;
  return <li className={s.notice} data-role={m.role} data-kind={m.kind} title={m.content||undefined}>
    <span className={s.noticeText}>{noticeLabel(m.kind)}{m.content&&`: ${m.content}`}</span><When at={m.created_at}/>
  </li>;
}

/** Querent's turn: its first line and an ellipsis (or CSS's, when the line itself is long), the whole turn on click or Enter. */
function AssistantTurn({message:m}:{message:TranscriptMessage}){
  const [open,setOpen]=useState(false);
  const [first='',...rest]=m.content.trim().split('\n');
  const more=rest.some(line=>line.trim());
  return <li className={s.assistant} data-role="assistant">
    <button type="button" className={s.turn} aria-expanded={open} onClick={()=>setOpen(o=>!o)}>
      <span className={s.meta}><ChevronRight aria-hidden="true" size={12} strokeWidth={2.25} className={s.chev}/><span>Querent</span><When at={m.created_at}/></span>
      <span data-text className={open?s.full:s.line}>{open?m.content:`${first}${more?'…':''}`}</span>
    </button>
  </li>;
}
