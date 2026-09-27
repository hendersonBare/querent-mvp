'use client';
import {useEffect,useId,useRef} from 'react';
import type {QuoteCheck,QuoteFigures} from '@/server/rep/quote-math';
import {itemCount,money} from './format';
import s from './QuoteDetail.module.css';

// Approve & send, for now (task 3.3): a summary of what would go to the customer and what still
// blocks it. The real send dialog and its centered Confirm send are task 3.7, which replaces this.

export interface SendDialogStubProps {
  quoteNumber:string;recipient:string;lineCount:number;figures:QuoteFigures;fulfillment:string;
  blockers:readonly QuoteCheck[];
  onClose:()=>void;
}

export function SendDialogStub({quoteNumber,recipient,lineCount,figures,fulfillment,blockers,onClose}:SendDialogStubProps){
  const titleId=useId();
  const dialog=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null;
    dialog.current?.focus();
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')onClose();};
    document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('keydown',escape);before?.focus?.();};
  },[onClose]);
  return <div className={s.modal} onPointerDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <div ref={dialog} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header>
        <h2 id={titleId}>Approve &amp; send {quoteNumber}</h2>
        <p className={s.dsum}>To {recipient} in Querent chat · {itemCount(lineCount)} · {figures.total===null?'freight to set':`${money(figures.total)} before tax`} · {fulfillment}</p>
      </header>
      <div className={s.dbody}>
        {blockers.length>0&&<div className={s.dblock}><strong>Finish these before sending:</strong><ul>{blockers.map((b,i)=><li key={i}>{b.subject?`${b.subject}: `:''}{b.text}</li>)}</ul></div>}
        {figures.belowFloorLines>0&&<p className={s.dwarn}>{figures.belowFloorLines} {figures.belowFloorLines===1?'line is':'lines are'} below your margin floor. That only warns: you can still send.</p>}
        <p className={s.muted}>Sending from the portal isn’t available yet in this demo.</p>
      </div>
      <footer>
        <button type="button" className={s.btn} onClick={onClose}>Close</button>
        <button type="button" className={`${s.btn} ${s.primary}`} disabled>Send quote</button>
      </footer>
    </div>
  </div>;
}
