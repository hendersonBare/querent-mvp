'use client';
import {useId,useState,type FormEvent,type KeyboardEvent} from 'react';
import type {Fulfillment} from '@/domain';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {fulfillmentTimeLabel} from '@/server/quotes';
import {parseMoney} from '@/server/rep/quote-math';
import {freightDisplay,type FreightDisplay} from '@/server/rep/quote-panels-math';
import {money,priceInput} from '../format';
import {saveError} from './api';
import {dayWithWeekday} from './format';
import {Panel,Row} from './Panel';
import type {SavePanel} from './types';
import p from './Panels.module.css';

// Quote details, Pickup or delivery (plan U4, C_QE4; spec §4, §5.3; task 3.4): will call or delivery,
// the branch (the freight origin and the stock the lines show), the ship-to, the day asked for, and
// freight with its road miles and formula (task 1.3), re-priced on the live items subtotal. The rep can
// set freight by hand with a required reason (logged in Activity), or go back to distance-based
// freight. An override resolves "call for freight" but never a delivery with no ship-to. Once the
// customer accepts (task 5.2), the pickup or delivery time they chose shows here.
// No frame: the ship-to line, the override form, the distance and formula rows, saving and errors;
// they use the section's rows and fields.

const MODES:{value:Fulfillment;label:string}[]=[{value:'will_call',label:'Will call'},{value:'delivery',label:'Delivery'}];
const REASON_REQUIRED='Say why freight is set by hand.';

function FreightDetails({freight,origin}:{freight:FreightDisplay;origin:string}){
  const {computed}=freight;
  // The distance rule's sentence is the two rows; every other rule says something they don't.
  const sentence=computed.rule==='distance'?null:computed.explanation;
  const warn=freight.source==='computed'&&(computed.rule==='no_ship_to'||computed.rule==='no_distance'||computed.rule==='beyond_radius');
  return <>
    {computed.miles!==null&&<Row label="Distance">{`${computed.miles.toFixed(1)} road mi from ${origin}`}</Row>}
    {computed.formula&&<Row label="Formula">{computed.formula}</Row>}
    {sentence&&<div className={p.line} data-tone={warn?'bad':undefined}>{sentence}</div>}
  </>;
}

/** What the rep has typed in the override form. FulfillmentPanel keeps it, so closing Quote details doesn't lose it. */
interface OverrideDraft {amount:string;reason:string}
const draftFor=(freight:FreightDisplay):OverrideDraft=>({amount:priceInput(freight.override?.amount??freight.computedAmount),reason:freight.override?.reason??''});

function OverrideForm({draft,onChange,busy,onSave,onCancel}:{draft:OverrideDraft;onChange:(draft:OverrideDraft)=>void;busy:boolean;
  onSave:(amount:number,reason:string)=>Promise<string|null>;onCancel:()=>void}){
  const id=useId();
  const {amount,reason}=draft;
  const [problem,setProblem]=useState<string|null>(null);
  async function submit(event:FormEvent){
    event.preventDefault();
    const value=parseMoney(amount);
    if(value===null){setProblem('Enter freight in dollars and cents, like 80.00.');return;}
    if(!reason.trim()){setProblem(REASON_REQUIRED);return;}
    setProblem(await onSave(value,reason.trim()));
  }
  return <form onSubmit={submit} aria-label="Set freight by hand" noValidate>
    <div className={p.field}>
      <div id={`${id}-amount`} className={p.fieldLabel}>Freight amount</div>
      <input aria-labelledby={`${id}-amount`} className={p.box} inputMode="decimal" autoComplete="off" value={amount} onChange={event=>onChange({...draft,amount:event.target.value})} autoFocus/>
    </div>
    <div className={p.field}>
      <div id={`${id}-reason`} className={p.fieldLabel}>Reason (required, logged in Activity)</div>
      <textarea aria-labelledby={`${id}-reason`} className={`${p.box} ${p.area}`} value={reason} onChange={event=>onChange({...draft,reason:event.target.value})} maxLength={300} required aria-required="true"
        placeholder="e.g. Liftgate truck needed at the job site"/>
    </div>
    {problem&&<div className={p.error} role="alert">{problem}</div>}
    <div className={p.addRow}>
      <button type="button" className={p.handButton} onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="submit" className={p.go} disabled={busy}>Save freight</button>
    </div>
  </form>;
}

export function FulfillmentPanel({detail,items,save,flash=false}:{detail:QuoteDetail;items:number;save:SavePanel;flash?:boolean}){
  const {quote,editable,panels}=detail;
  const branchLabel=useId();
  const [pending,setPending]=useState<{fulfillment?:Fulfillment;branchId?:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  // The override form's draft while it is open (null when closed); kept here so closing Quote details keeps it.
  const [override,setOverride]=useState<OverrideDraft|null>(null);
  const overriding=override!==null;
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
  const pickMode=(mode:Fulfillment)=>{if(!locked&&mode!==fulfillment)change({fulfillment:mode});};
  function modeKey(event:KeyboardEvent,mode:Fulfillment){
    if(event.key===' '||event.key==='Enter'){event.preventDefault();pickMode(mode);}
    else if(event.key==='ArrowLeft'||event.key==='ArrowRight'||event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();pickMode(mode==='will_call'?'delivery':'will_call');}
  }
  async function saveOverride(amount:number,reason:string){
    const problem=await run(()=>save('freight','PUT',{amount,reason}));
    if(!problem)setOverride(null);
    return problem;
  }

  const mode=quote.fulfillment==='delivery'?'Delivery':'Will call';
  const unresolved=quote.fulfillment==='delivery'&&freight.callForFreight;
  const confirmed=quote.fulfillment_time?fulfillmentTimeLabel(quote.fulfillment_time):null;
  const value=[mode,quote.branch_code,confirmed??(unresolved?'Call for freight':quote.requested_date&&dayWithWeekday(quote.requested_date))].filter(Boolean).join(', ');
  const who=quote.contact_name?.trim().split(/\s+/)[0]??quote.customer_name;
  const noShipTo=quote.fulfillment==='delivery'&&!quote.ship_to_address?.trim();
  const kind=quote.fulfillment==='delivery'?'Delivery':'Pickup';

  return <Panel label="Pickup or delivery" value={value} tone={unresolved||noShipTo?'bad':undefined} flash={flash}>
    <div className={p.seg} role="radiogroup" aria-label="Pickup or delivery" aria-disabled={locked||undefined}>
      {MODES.map(m=><span key={m.value} className={p.segItem} role="radio" aria-checked={fulfillment===m.value} tabIndex={fulfillment===m.value&&!locked?0:-1}
        onClick={()=>pickMode(m.value)} onKeyDown={event=>modeKey(event,m.value)}>{m.label}</span>)}
    </div>
    <div className={p.field}>
      <div id={branchLabel} className={p.fieldLabel}>Branch</div>
      <select aria-labelledby={branchLabel} className={p.box} value={branchId} onChange={event=>change({branchId:event.target.value})} disabled={locked}>
        {panels.branches.map(b=><option key={b.id} value={b.id}>{b.code===b.name?b.code:`${b.code} - ${b.name}`}</option>)}
      </select>
    </div>
    {quote.fulfillment==='delivery'&&(noShipTo
      ?<div className={p.line} data-tone="bad">No ship-to address on the quote: it can&apos;t be sent as a delivery. Switch to will call.</div>
      :<Row label="Ship to">{quote.ship_to_address}</Row>)}
    {quote.requested_date&&<Row label={`${kind} requested for`}>{dayWithWeekday(quote.requested_date)}</Row>}
    {confirmed&&<Row label={`${kind} time ${who} chose on accepting`}>{confirmed}</Row>}
    <Row label={freight.source==='override'?'Freight (set by rep)':'Freight'} tone={freight.callForFreight?'bad':undefined}>{freight.callForFreight?'Call for freight':money(freight.amount)}</Row>
    {freight.override&&<div className={p.line}>Override: {freight.override.reason}</div>}
    {freight.override&&<div className={p.line}>Distance-based freight would be {freight.computedAmount===null?'call for freight':money(freight.computedAmount)}.</div>}
    <FreightDetails freight={freight} origin={quote.branch_code}/>
    {editable&&(overriding
      ?<OverrideForm draft={override} onChange={setOverride} busy={busy} onSave={saveOverride} onCancel={()=>setOverride(null)}/>
      :<div className={p.actions}>
        <button type="button" className={p.handButton} onClick={()=>{setError(null);setOverride(draftFor(freight));}} disabled={busy}>{freight.override?'Change freight':'Set freight by hand'}</button>
        {freight.override&&<button type="button" className={p.linkButton} onClick={()=>void run(()=>save('freight','DELETE'))} disabled={busy}>Use distance-based freight</button>}
      </div>)}
    {busy&&<div className={p.saving} role="status">Saving…</div>}
    {error&&!overriding&&<div className={p.error} role="alert">{error}</div>}
  </Panel>;
}
