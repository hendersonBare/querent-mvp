'use client';
import {Fragment,useId,useState,type FormEvent} from 'react';
import type {Fulfillment} from '@/domain';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {parseMoney} from '@/server/rep/quote-math';
import {freightDisplay,type FreightDisplay} from '@/server/rep/quote-panels-math';
import {money,priceInput} from '../format';
import {saveError} from './api';
import {dayWithWeekday} from './format';
import {Panel} from './Panel';
import type {SavePanel} from './types';
import p from './Panels.module.css';

// The Pickup or delivery panel (spec §4, §5.3; task 3.4; mockup #accFul): will call or delivery,
// the branch (the freight origin and the stock the grid shows), the ship-to, and freight with its
// road miles and formula (task 1.3), re-priced on the live items subtotal like the totals. The rep
// can set freight by hand with a required reason (logged in Activity), or go back to distance-based
// freight. An override resolves "call for freight" but never a delivery with no ship-to.

const MODES:{value:Fulfillment;label:string}[]=[{value:'will_call',label:'Will call'},{value:'delivery',label:'Delivery'}];
const REASON_REQUIRED='Say why freight is set by hand.';

function FreightDetails({freight}:{freight:FreightDisplay}){
  const {computed}=freight;
  const rows:[string,string][]=[];
  if(computed.miles!==null)rows.push(['Distance',`${computed.miles.toFixed(1)} road mi`]);
  if(computed.formula)rows.push(['Formula',computed.formula]);
  // The distance rule's sentence is the two rows above; every other rule says something they don't.
  const sentence=computed.rule==='distance'?null:computed.explanation;
  const tone=computed.rule==='no_ship_to'||computed.rule==='no_distance'||computed.rule==='beyond_radius'?'warn':undefined;
  return <>
    {rows.length>0&&<dl className={p.kv}>{rows.map(([term,value])=><Fragment key={term}><dt>{term}</dt><dd className={term==='Formula'?p.formula:undefined}>{value}</dd></Fragment>)}</dl>}
    {sentence&&<p className={p.fnote} data-tone={freight.source==='computed'?tone:undefined}>{sentence}</p>}
  </>;
}

function OverrideForm({freight,busy,onSave,onCancel}:{freight:FreightDisplay;busy:boolean;onSave:(amount:number,reason:string)=>Promise<string|null>;onCancel:()=>void}){
  const id=useId();
  const [amount,setAmount]=useState(()=>priceInput(freight.override?.amount??freight.computedAmount));
  const [reason,setReason]=useState(freight.override?.reason??'');
  const [problem,setProblem]=useState<string|null>(null);
  async function submit(event:FormEvent){
    event.preventDefault();
    const value=parseMoney(amount);
    if(value===null){setProblem('Enter freight in dollars and cents, like 80.00.');return;}
    if(!reason.trim()){setProblem(REASON_REQUIRED);return;}
    setProblem(await onSave(value,reason.trim()));
  }
  return <form className={p.override} onSubmit={submit} aria-label="Set freight by hand" noValidate>
    <div className={p.field}>
      <label htmlFor={`${id}-amount`}>Freight amount</label>
      <span className={p.money}><span aria-hidden="true">$</span><input id={`${id}-amount`} inputMode="decimal" autoComplete="off" value={amount} onChange={event=>setAmount(event.target.value)} autoFocus/></span>
    </div>
    <label className={p.field}>Reason (required, logged in Activity)
      <textarea value={reason} onChange={event=>setReason(event.target.value)} maxLength={300} rows={2} required aria-required="true"
        placeholder="e.g. Liftgate truck needed at the job site"/>
    </label>
    {problem&&<p className={p.error} role="alert">{problem}</p>}
    <div className={p.actions}>
      <button type="submit" className={`${p.btn} ${p.primary}`} disabled={busy}>Save freight</button>
      <button type="button" className={p.btn} onClick={onCancel} disabled={busy}>Cancel</button>
    </div>
  </form>;
}

export function FulfillmentPanel({detail,items,save}:{detail:QuoteDetail;items:number;save:SavePanel}){
  const {quote,editable,panels}=detail;
  const radioName=useId();
  const [pending,setPending]=useState<{fulfillment?:Fulfillment;branchId?:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [overriding,setOverriding]=useState(false);
  const fulfillment=pending?.fulfillment??quote.fulfillment;
  const branchId=pending?.branchId??quote.branch_id;
  const freight=freightDisplay(detail.freight,items,detail.delivery_rates,quote.branch_code);
  const locked=!editable||busy;

  async function run(action:()=>Promise<unknown>){
    setBusy(true);setError(null);
    try{await action();return null;}
    catch(caught){const message=saveError(caught);setError(message);return message;}
    finally{setBusy(false);setPending(null);}
  }
  const change=(patch:{fulfillment?:Fulfillment;branchId?:string})=>{setPending(patch);void run(()=>save('fulfillment','PATCH',patch));};
  async function saveOverride(amount:number,reason:string){
    const problem=await run(()=>save('freight','PUT',{amount,reason}));
    if(!problem)setOverriding(false);
    return problem;
  }

  const mode=quote.fulfillment==='delivery'?'Delivery':'Will call';
  const unresolved=quote.fulfillment==='delivery'&&freight.callForFreight;
  const value=[mode,quote.branch_code,unresolved?'Call for freight':quote.requested_date&&dayWithWeekday(quote.requested_date)].filter(Boolean).join(' · ');
  const noShipTo=quote.fulfillment==='delivery'&&!quote.ship_to_address?.trim();

  return <Panel label="Pickup or delivery" value={value} tone={unresolved||noShipTo?'bad':undefined}>
    <fieldset className={p.seg} role="radiogroup" aria-label="Pickup or delivery" disabled={locked}>
      {MODES.map(m=><label key={m.value}>
        <input type="radio" name={radioName} value={m.value} checked={fulfillment===m.value} onChange={()=>change({fulfillment:m.value})}/><span>{m.label}</span>
      </label>)}
    </fieldset>
    <label className={p.field}>Branch
      <select value={branchId} onChange={event=>change({branchId:event.target.value})} disabled={locked}>
        {panels.branches.map(b=><option key={b.id} value={b.id}>{b.code===b.name?b.code:`${b.code} · ${b.name}`}</option>)}
      </select>
    </label>
    {quote.fulfillment==='delivery'&&(noShipTo
      ?<p className={p.fnote} data-tone="bad">No ship-to address on the quote: it can’t be sent as a delivery. Switch to will call.</p>
      :<p className={p.fnote}><span className={p.muted}>Ship to </span>{quote.ship_to_address}</p>)}
    {quote.requested_date&&<p className={p.fnote}><span className={p.muted}>{quote.fulfillment==='delivery'?'Delivery':'Pickup'} requested for </span>{dayWithWeekday(quote.requested_date)}</p>}

    <section className={p.freight} aria-label="Freight">
      <p className={p.freightTotal}>
        <span>Freight{freight.source==='override'&&<span className={p.muted}> (set by rep)</span>}</span>
        {freight.callForFreight?<b data-tone="warn">Call for freight</b>:<b>{money(freight.amount)}</b>}
      </p>
      {freight.override&&<p className={p.fnote}><span className={p.tag}>Override</span>{freight.override.reason}</p>}
      {freight.override&&<p className={p.fnote}><span className={p.muted}>Distance-based freight would be </span>{freight.computedAmount===null?'call for freight':money(freight.computedAmount)}.</p>}
      <FreightDetails freight={freight}/>
      {editable&&(overriding
        ?<OverrideForm freight={freight} busy={busy} onSave={saveOverride} onCancel={()=>setOverriding(false)}/>
        :<div className={p.actions}>
          <button type="button" className={p.miniBtn} onClick={()=>{setError(null);setOverriding(true);}} disabled={busy}>{freight.override?'Change freight':'Set freight by hand'}</button>
          {freight.override&&<button type="button" className={p.linkBtn} onClick={()=>void run(()=>save('freight','DELETE'))} disabled={busy}>Use distance-based freight</button>}
        </div>)}
    </section>
    {busy&&<p className={p.saving} role="status">Saving…</p>}
    {error&&!overriding&&<p className={p.error} role="alert">{error}</p>}
  </Panel>;
}
