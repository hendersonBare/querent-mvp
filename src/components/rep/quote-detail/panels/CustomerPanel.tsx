'use client';
import {useEffect,useRef,useState} from 'react';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import type {PanelContact,PanelCustomer} from '@/server/rep/quote-panels';
import {creditBar,creditPercent} from '@/server/rep/quote-panels-math';
import {day,money} from '../format';
import {Panel,Row} from './Panel';
import {wholePercent} from './format';
import p from './Panels.module.css';

// Quote details, Customer (plan U4, C_QE4; spec §4, task 3.4): who asked, with Copy for their phone,
// then the account's number, terms, open balance, credit limit, last order, win rate, tax status, and
// the credit used with this quote. `quoteTotal` is the page's live total, so the credit used follows
// prices, qty and freight. Over the limit, the value turns red and says by how much (no frame: a plain
// red line, a warning only).

function termsText(c:PanelCustomer){
  if(!c.terms)return '-';
  if(c.past_due_balance===null)return c.terms;
  return c.past_due_balance>0?`${c.terms}, ${money(c.past_due_balance)} past due`:`${c.terms}, nothing past due`;
}

function taxText(c:PanelCustomer){
  if(c.tax_status==='exempt')return 'Tax exempt';
  if(c.tax_status==='taxable')return c.tax_state?`Taxable, ${c.tax_state}`:'Taxable';
  return '-';
}

/** "71% over 12 months": quotes requested in the last WIN_RATE_MONTHS (server/rep/quote-panels). */
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
  const sub=[contact.title,contact.phone].filter(Boolean).join(', ');
  return <div className={p.contact}>
    <div>
      <div className={p.contactName}>{contact.name}</div>
      {sub&&<div className={p.muted}>{sub}</div>}
    </div>
    {contact.phone&&<button type="button" className={p.mini} onClick={copy} aria-label={`Copy ${contact.name}'s phone number`}>{copied==='copied'?'Copied':'Copy'}</button>}
    <span role="status" className={p.srOnly}>{copied==='copied'?`Copied ${contact.phone}`:copied==='blocked'?'Copy was blocked. Select the number instead.':''}</span>
  </div>;
}

export function CustomerPanel({detail,quoteTotal}:{detail:QuoteDetail;quoteTotal:number}){
  const c=detail.panels.customer;
  const bar=creditBar(c.credit_limit,c.open_balance,quoteTotal);
  const value=[c.terms,bar&&`${creditPercent(bar.withQuote)} of credit`].filter(Boolean).join(', ')||'-';
  return <Panel label="Customer" value={value} tone={bar?.over?'bad':undefined}>
    {c.contact&&<ContactRow contact={c.contact}/>}
    <Row label="Account"><span className={p.mono}>{c.account_number}</span></Row>
    <Row label="Terms" tone={c.past_due_balance?'bad':undefined}>{termsText(c)}</Row>
    <Row label="Open balance">{money(c.open_balance)}</Row>
    <Row label="Credit limit">{c.credit_limit===null?'None on file':money(c.credit_limit)}</Row>
    <Row label="Last order">{c.last_order?`${day(c.last_order.order_date,detail.as_of)}, ${c.last_order.order_number}`:'None yet'}</Row>
    <Row label="Wins on quotes">{winText(c)}</Row>
    <Row label="Tax status">{taxText(c)}</Row>
    {bar&&<Row label="Credit used, with this quote" tone={bar.over?'bad':undefined}>{creditPercent(bar.withQuote)}</Row>}
    {bar?.overLabel&&<div className={p.line} data-tone="bad">{bar.overLabel}</div>}
  </Panel>;
}
