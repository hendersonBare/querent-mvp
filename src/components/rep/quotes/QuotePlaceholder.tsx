'use client';
import {useEffect,useRef} from 'react';
import Link from 'next/link';
import type {QuoteStatus} from '@/domain';
import {useRepPortal,useRepScope} from '../context';
import {repPageStyles as page} from '../RepPage';
import {StatusChip} from './QuotesList';
import {listDate,revisionLabel} from './labels';
import s from './QuotesList.module.css';

// /rep/quotes/<number> until task 3.3 builds the quote detail (docs/design/screens/03): the
// breadcrumb and header, and a note that the full quote comes next. Opening it clears the
// quote's unread flag, so the list's dot and the Quotes badge go.

export interface QuoteHeading {
  id:string;quote_number:string;revision:number;status:QuoteStatus;customer_name:string;contact_name:string|null;requested_at:string;is_sample:boolean;
}

/**
 * Marks the quote read for the rep once its page is on screen (a link prefetch never runs this),
 * then re-reads the nav badge instead of waiting for its poll.
 */
export function useMarkQuoteRead(quoteId:string){
  const {refreshBadges}=useRepPortal();
  const refresh=useRef(refreshBadges);
  useEffect(()=>{refresh.current=refreshBadges;},[refreshBadges]);
  useEffect(()=>{
    void fetch(`/api/rep/quotes/${encodeURIComponent(quoteId)}/read`,{method:'POST',cache:'no-store'}).then(response=>{
      if(response.status===401||response.status===403)window.location.assign('/');
      else if(response.ok)refresh.current();
    },()=>{/* Offline: the dot stays until the next visit. */});
  },[quoteId]);
}

export function QuotePlaceholder({quote,asOf}:{quote:QuoteHeading;asOf:string}){
  useMarkQuoteRead(quote.id);
  const scope=useRepScope();
  const back=scope.href('/rep/quotes');
  return <>
    <nav className={s.crumbs} aria-label="Breadcrumb">
      <Link href={back}>Quotes</Link><span aria-hidden="true">/</span><span aria-current="page" className={s.crumbHere}>{quote.quote_number}</span>
      {quote.is_sample&&<span className={s.tag}>Sample data</span>}
    </nav>
    <div className={page.top}>
      <div>
        <div className={s.titleRow}><h1 className={page.title}>{quote.customer_name}</h1><StatusChip status={quote.status}/></div>
        <p className={page.meta}>{quote.quote_number}{quote.revision>0?` ${revisionLabel(quote.revision)}`:` · ${revisionLabel(0)}`}{quote.contact_name&&<> · {quote.contact_name}</>} · Requested {listDate(quote.requested_at,asOf)}</p>
      </div>
    </div>
    <section className={page.card} aria-labelledby="quote-coming-next">
      <div className={page.empty}>
        <span className={page.pill}>Coming next</span>
        <h2 id="quote-coming-next">The full quote opens here</h2>
        <p>Its lines with price bases and floor warnings, freight, terms, activity, and Approve &amp; send.</p>
        <Link className={s.emptyAction} href={back}>Back to quotes</Link>
      </div>
    </section>
  </>;
}
