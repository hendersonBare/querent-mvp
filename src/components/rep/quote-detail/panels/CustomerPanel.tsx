'use client';
import {useEffect,useRef,useState} from 'react';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import type {PanelContact,PanelCustomer} from '@/server/rep/quote-panels';
import {creditBar,creditPercent} from '@/server/rep/quote-panels-math';
import {day,money} from '../format';
import {CreditBar} from './CreditBar';
import {Panel} from './Panel';
import {wholePercent} from './format';
import p from './Panels.module.css';

// The Customer panel (spec §4, task 3.4; mockup #accCust): who asked, with a copy-phone button,
// then the account's terms, open balance, credit limit, last order, win rate and tax status, and
// the credit bar with this quote. `quoteTotal` is the page's live total (the summary card's), so
// the bar moves as prices, qty and freight change.

function termsText(c:PanelCustomer){
  if(!c.terms)return '—';
  if(c.past_due_balance===null)return c.terms;
  return c.past_due_balance>0?`${c.terms} · ${money(c.past_due_balance)} past due`:`${c.terms} · nothing past due`;
}

function taxText(c:PanelCustomer){
  if(c.tax_status==='exempt')return 'Tax exempt';
  if(c.tax_status==='taxable')return c.tax_state?`Taxable, ${c.tax_state}`:'Taxable';
  return '—';
}

/** "71% over 12 months", as in the mockup: quotes requested in the last WIN_RATE_MONTHS (server/rep/quote-panels). */
function winText({win_rate:w}:PanelCustomer){
  return w.rate===null?'No decided quotes in 12 months':`${wholePercent(w.rate)} over 12 months`;
}

type Copied='copied'|'blocked'|null;

function ContactRow({contact}:{contact:PanelContact}){
  const [copied,setCopied]=useState<Copied>(null);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  async function copy(){
    clearTimeout(timer.current);
    try{
      await navigator.clipboard.writeText(contact.phone!);
      setCopied('copied');
    }catch{
      setCopied('blocked');
    }
    timer.current=setTimeout(()=>setCopied(null),2500);
  }
  return <div className={p.contact}>
    <div>
      <div className={p.contactName}>{contact.name}</div>
      {contact.title&&<span className={p.muted}>{contact.title}{contact.phone&&' · '}</span>}
      {contact.phone&&<span className={p.phone}>{contact.phone}</span>}
    </div>
    {contact.phone&&<button type="button" className={p.miniBtn} onClick={copy} aria-label={`Copy ${contact.name}’s phone number`}>{copied==='copied'?'Copied':'Copy'}</button>}
    <span role="status" className={p.srOnly}>{copied==='copied'?`Copied ${contact.phone}`:copied==='blocked'?'Copy was blocked. Select the number instead.':''}</span>
  </div>;
}

export function CustomerPanel({detail,quoteTotal}:{detail:QuoteDetail;quoteTotal:number}){
  const c=detail.panels.customer;
  const bar=creditBar(c.credit_limit,c.open_balance,quoteTotal);
  const value=[c.terms,bar&&`${creditPercent(bar.withQuote)} of credit`].filter(Boolean).join(' · ')||'—';
  return <Panel label="Customer" value={value} tone={bar?.over?'bad':undefined}>
    {c.contact&&<ContactRow contact={c.contact}/>}
    <dl className={p.kv}>
      <dt>Account</dt><dd>{c.account_number}</dd>
      <dt>Terms</dt><dd data-tone={c.past_due_balance?'bad':undefined}>{termsText(c)}</dd>
      <dt>Open balance</dt><dd>{money(c.open_balance)}</dd>
      <dt>Credit limit</dt><dd>{c.credit_limit===null?'None on file':money(c.credit_limit)}</dd>
      <dt>Last order</dt><dd>{c.last_order?`${day(c.last_order.order_date,detail.as_of)} · ${c.last_order.order_number}`:'None yet'}</dd>
      <dt>Wins on quotes</dt><dd>{winText(c)}</dd>
      <dt>Tax status</dt><dd>{taxText(c)}</dd>
    </dl>
    {bar&&c.credit_limit!==null
      ?<CreditBar bar={bar} openBalance={c.open_balance} quoteTotal={quoteTotal} limit={c.credit_limit}/>
      :<p className={p.fnote}>No credit limit on file, so there is no credit bar.</p>}
  </Panel>;
}
