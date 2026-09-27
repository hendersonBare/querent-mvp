'use client';
import {useId,type ReactNode} from 'react';
import {ChevronRight} from 'lucide-react';
import s from '../QuoteDetail.module.css';
import p from './Panels.module.css';

/**
 * One of the rail's collapsible side panels (the mockup's `details.card.acc`): a label, a
 * one-line value while closed ("Net 30 · 39% of credit"), and the panel body. Closed by default,
 * as in screens 03, 04 and 08; the browser keeps it open or closed across re-renders.
 */
export function Panel({label,value,tone,children}:{label:string;value:ReactNode;tone?:'bad';children:ReactNode}){
  const labelId=useId();
  return <details className={`${s.card} ${p.acc}`} aria-labelledby={labelId}>
    <summary>
      <ChevronRight aria-hidden="true" size={14} strokeWidth={2} className={p.chev}/>
      <span id={labelId} className={s.lbl}>{label}</span>
      <span className={p.val} data-tone={tone}>{value}</span>
    </summary>
    <div className={p.body}>{children}</div>
  </details>;
}
