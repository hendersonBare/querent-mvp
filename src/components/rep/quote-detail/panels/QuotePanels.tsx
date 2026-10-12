'use client';
import {useCallback,useId,useState,type KeyboardEvent} from 'react';
import type {QuoteFigures} from '@/server/rep/quote-math';
import {Chevron} from '../icons';
import {day} from '../format';
import type {QuoteEditor} from '../use-quote-editor';
import {ActivityPanel} from './ActivityPanel';
import {savePanel} from './api';
import {CustomerPanel} from './CustomerPanel';
import {FulfillmentPanel,type OverrideDraft} from './FulfillmentPanel';
import {NotesPanel} from './NotesPanel';
import {TermsPanel} from './TermsPanel';
import type {SavePanel} from './types';
import q from '../QuoteDetail.module.css';
import p from './Panels.module.css';

// Quote details (plan U4; C_QEBase closed, C_QE4 open; spec §4, task 3.4): one card under the icon
// buttons holding everything the old side panels had. Closed, its title bar sums it up ("Net 30, will
// call SLC, valid until Oct 25"); open, it lists Customer, Pickup or delivery, Quote terms, Internal
// notes and Activity, scrolling inside 520px. `figures` are the page's live totals, so the credit used
// and freight follow prices, qty and freight as the rep edits. Saves go through the editor's queue
// (saveQuote), behind any line edits, and their fresh detail refreshes the whole page.

/** The section a send blocker points at (decision 44): it is highlighted while Quote details is open. */
export type DetailsSection='fulfillment'|'freight'|'terms';

export function QuoteDetails({editor,figures,open,onToggle,flash=null}:{editor:QuoteEditor;figures:QuoteFigures;open:boolean;onToggle:()=>void;flash?:DetailsSection|null}){
  const {detail,saveQuote}=editor;
  const {quote}=detail;
  const quoteId=quote.id;
  const bodyId=useId();
  // Half-typed drafts survive closing the card: the freight override and the internal note.
  const [override,setOverride]=useState<OverrideDraft|null>(null);
  const [note,setNote]=useState('');
  const save=useCallback<SavePanel>((endpoint,method,body)=>saveQuote(()=>savePanel(quoteId,endpoint,method,body)),[saveQuote,quoteId]);
  const terms=detail.panels.customer.terms;
  const where=quote.fulfillment==='delivery'?`delivery from ${quote.branch_code}`:`will call ${quote.branch_code}`;
  const summary=[terms,where,`valid until ${day(detail.valid_until,detail.as_of)}`].filter(Boolean).join(', ');
  const onKey=(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onToggle();}};
  return <section className={q.card} aria-label="Quote details">
    <div className={q.detailsHead} role="button" tabIndex={0} aria-expanded={open} aria-controls={bodyId} onClick={onToggle} onKeyDown={onKey}>
      <span className={q.cardTitle}>Quote details</span>
      <span className={q.detailsSummary}>{summary}</span>
      <span className={q.chev}><Chevron open={open}/></span>
    </div>
    {open&&<div id={bodyId} className={p.body}>
      <CustomerPanel detail={detail} quoteTotal={figures.total??figures.items}/>
      <FulfillmentPanel detail={detail} items={figures.goods} save={save} flash={flash==='fulfillment'||flash==='freight'} override={override} setOverride={setOverride}/>
      <TermsPanel detail={detail} save={save} flash={flash==='terms'}/>
      <NotesPanel detail={detail} save={save} text={note} setText={setNote}/>
      <ActivityPanel detail={detail}/>
    </div>}
  </section>;
}
