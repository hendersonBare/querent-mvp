'use client';
import {useId,useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {perUnitLabel,unitLabel} from '@/features/quote-tool/units';
import type {Quote,QuoteLine} from '@/server/repository/types';
import {QUOTE_COPY} from './copy';
import {DeleteQuoteDialog} from './DeleteQuoteDialog';
import {checkDraft,draftFrom,draftTotal,parsePrice,parseQuantity,toPatch,type LineDraft,type QuoteDraft} from './draft';
import {formatMoney,formatQuantity,formatSimilarity,formatUnitPrice,lineTotal} from './format';
import {LocalDateTime} from './LocalDateTime';
import s from './Quotes.module.css';

// A saved quote (docs/boxt/plan.md B6, product rule 6): the header (customer, reference, who created it
// and when); the matched lines (item with the customer's original text under it, SKU, qty, unit price,
// line total, and "Picked by rep" when the rep picked the item); the unmatched lines with their
// original text, qty and the closest items stored with them and their similarity (read-only); the
// total. Each line's qty and unit price read in its unit ("250 each", "$0.95 per each"): a matched
// line's unit is its item's pricing unit, saved with it (src/features/quote-tool/units.ts).
//
// Edit quote turns the customer, reference, quantities and unit prices into inputs and adds Remove to
// each line; Save changes stays disabled while anything is invalid (./draft.ts) and sends
// PATCH /api/quotes/[id]. Delete asks first (./DeleteQuoteDialog) and goes back to /quotes. The example
// quote offers neither and says so.

type Mode={kind:'read'}|{kind:'edit';draft:QuoteDraft};

async function readError(response:Response,fallback:string):Promise<string>{
  try{
    const body=await response.json() as {error?:unknown};
    return typeof body.error==='string'&&body.error?body.error:fallback;
  }catch{
    return fallback;
  }
}

const None=({children=QUOTE_COPY.none}:{children?:string})=><span className={s.none}>{children}</span>;

export function QuoteDetail({initial}:{initial:Quote}){
  const router=useRouter();
  const [quote,setQuote]=useState(initial);
  const [mode,setMode]=useState<Mode>({kind:'read'});
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState<string|null>(null);
  const [confirming,setConfirming]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState<string|null>(null);
  const ids={customer:useId(),reference:useId(),unmatched:useId()};

  const draft=mode.kind==='edit'?mode.draft:null;
  const check=useMemo(()=>draft?checkDraft(draft):null,[draft]);
  const byId=useMemo(()=>new Map(quote.lines.map(l=>[l.id,l])),[quote.lines]);
  // The lines on screen: in edit mode the draft's (removed ones are gone), else the saved ones.
  const shown:{line:QuoteLine;edit:LineDraft|null}[]=draft
    ?draft.lines.flatMap(e=>{const line=byId.get(e.id);return line?[{line,edit:e}]:[];})
    :quote.lines.map(line=>({line,edit:null}));
  const matched=shown.filter(x=>!x.line.unmatched);
  const unmatched=shown.filter(x=>x.line.unmatched);
  const total=draft?draftTotal(draft):quote.total;

  const setDraft=(next:(d:QuoteDraft)=>QuoteDraft)=>setMode(m=>m.kind==='edit'?{kind:'edit',draft:next(m.draft)}:m);
  const setLine=(id:string,over:Partial<LineDraft>)=>setDraft(d=>({...d,lines:d.lines.map(l=>l.id===id?{...l,...over}:l)}));
  const removeLine=(id:string)=>setDraft(d=>({...d,lines:d.lines.filter(l=>l.id!==id)}));

  const startEditing=()=>{setSaveError(null);setMode({kind:'edit',draft:draftFrom(quote)});};
  const cancelEditing=()=>{setSaveError(null);setMode({kind:'read'});};

  async function save(){
    if(!draft||!check?.ok)return;
    setSaving(true);
    setSaveError(null);
    try{
      const response=await fetch(`/api/quotes/${quote.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(toPatch(draft))});
      if(!response.ok){setSaveError(await readError(response,QUOTE_COPY.saveFailed));return;}
      const body=await response.json() as {quote:Quote};
      setQuote(body.quote);
      setMode({kind:'read'});
      router.refresh();
    }catch{
      setSaveError(QUOTE_COPY.saveFailed);
    }finally{
      setSaving(false);
    }
  }

  async function remove(){
    setDeleting(true);
    setDeleteError(null);
    try{
      const response=await fetch(`/api/quotes/${quote.id}`,{method:'DELETE'});
      if(!response.ok){setDeleteError(await readError(response,QUOTE_COPY.deleteFailed));setDeleting(false);return;}
      router.push('/quotes');
      router.refresh();
    }catch{
      setDeleteError(QUOTE_COPY.deleteFailed);
      setDeleting(false);
    }
  }

  const editing=draft!==null;
  return <div className={`ui-root ${s.detail}`}>
    <Link href="/quotes" className={s.back}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
      {QUOTE_COPY.backToQuotes}
    </Link>

    <header className={s.header}>
      <div className={s.headerText}>
        <div className={s.titleRow}>
          <h1 className={s.title}>{quote.customerName||QUOTE_COPY.noCustomer}</h1>
          {quote.isExample&&<span className={s.tag}>{QUOTE_COPY.example}</span>}
        </div>
        <dl className={s.meta}>
          <div><dt>Reference</dt><dd>{quote.reference||<None/>}</dd></div>
          <div><dt>Created by</dt><dd>{quote.createdByEmail||(quote.isExample?QUOTE_COPY.exampleCreator:<None/>)}</dd></div>
          <div><dt>Created</dt><dd><LocalDateTime iso={quote.createdAt}/></dd></div>
        </dl>
      </div>
      {!quote.isExample&&<div className={s.actions}>
        {editing
          ?<>
            <button type="button" className={s.secondaryButton} onClick={cancelEditing} disabled={saving}>{QUOTE_COPY.cancel}</button>
            <button type="button" className={s.primaryButton} onClick={save} disabled={saving||!check?.ok}>{saving?QUOTE_COPY.saving:QUOTE_COPY.save}</button>
          </>
          :<>
            <button type="button" className={s.secondaryButton} onClick={startEditing}>{QUOTE_COPY.edit}</button>
            <button type="button" className={s.deleteButton} onClick={()=>{setDeleteError(null);setConfirming(true);}}>{QUOTE_COPY.delete}</button>
          </>}
      </div>}
    </header>

    {quote.isExample&&<p className={s.note}>{QUOTE_COPY.exampleNote}</p>}
    {saveError&&<p className={s.error} role="alert">{saveError}</p>}
    {check?.form&&<p className={s.formProblem}>{check.form}</p>}

    {draft&&<section className={`${s.card} ${s.fields}`} aria-label="Quote details">
      <TextField id={ids.customer} label="Customer" value={draft.customerName} error={check?.customerName} onChange={customerName=>setDraft(d=>({...d,customerName}))}/>
      <TextField id={ids.reference} label="Reference" value={draft.reference} error={check?.reference} onChange={reference=>setDraft(d=>({...d,reference}))}/>
    </section>}

    <div className={`${s.card} ${s.itemsCard}`}>
      <div className={s.scroll}>
        <table className={`${s.table} ${s.items}`} aria-label="Items">
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">SKU</th>
              <th scope="col" className={s.num}>Qty</th>
              <th scope="col" className={s.num}>Unit price</th>
              <th scope="col" className={s.num}>Line total</th>
              {editing&&<th scope="col" className={s.removeCol}><span className={s.srOnly}>{QUOTE_COPY.remove}</span></th>}
            </tr>
          </thead>
          <tbody>
            {matched.map(({line,edit})=><MatchedRow key={line.id} line={line} edit={edit} errors={check?.lines[line.id]}
              onChange={over=>setLine(line.id,over)} onRemove={()=>removeLine(line.id)}/>)}
          </tbody>
        </table>
      </div>
      {matched.length===0&&<p className={s.noLines}>No matched lines.</p>}
      <div className={s.totalRow}>
        <span className={s.totalLabel}>{QUOTE_COPY.total}</span>
        <span className={s.totalValue} data-testid="quote-total">{formatMoney(total)}</span>
      </div>
    </div>

    {unmatched.length>0&&<section className={s.unmatched} aria-labelledby={ids.unmatched}>
      <h2 className={s.sectionTitle} id={ids.unmatched}>{QUOTE_COPY.unmatchedTitle} <span className={s.count}>{unmatched.length}</span></h2>
      <ul className={s.unmatchedList}>
        {unmatched.map(({line})=><li key={line.id} className={`${s.card} ${s.unmatchedLine}`}>
          <div className={s.unmatchedHead}>
            <div className={s.unmatchedText}>
              <span className={s.label}>{QUOTE_COPY.unmatchedLabel}</span>
              <p className={s.originalBig}>{line.originalText}</p>
              <span className={s.muted} data-qty="">{line.quantity===null?'Qty not given':`Qty ${formatQuantity(line.quantity)}${line.unit?` ${unitLabel(line.quantity,line.unit)}`:''}`}</span>
            </div>
            {editing&&<RemoveButton label={`${QUOTE_COPY.remove} unmatched line ${line.position}`} onClick={()=>removeLine(line.id)}/>}
          </div>
          {line.nearMisses.length>0&&<table className={s.nearMisses} aria-label={`${QUOTE_COPY.nearMissesTitle} for line ${line.position}`}>
            <caption className={s.caption}>{QUOTE_COPY.nearMissesTitle}</caption>
            <thead><tr><th scope="col">Item</th><th scope="col">SKU</th><th scope="col" className={s.num}>{QUOTE_COPY.similarity}</th></tr></thead>
            <tbody>
              {line.nearMisses.map((n,i)=><tr key={`${n.sku}-${i}`}>
                <td>{n.description}</td>
                <td className={s.sku}>{n.sku}</td>
                <td className={`${s.num} ${s.score}`}>{formatSimilarity(n.score)??<None/>}</td>
              </tr>)}
            </tbody>
          </table>}
        </li>)}
      </ul>
    </section>}

    {confirming&&<DeleteQuoteDialog busy={deleting} error={deleteError} onCancel={()=>setConfirming(false)} onConfirm={remove}/>}
  </div>;
}

function MatchedRow({line,edit,errors,onChange,onRemove}:{line:QuoteLine;edit:LineDraft|null;errors?:{quantity?:string;unitPrice?:string};onChange:(over:Partial<LineDraft>)=>void;onRemove:()=>void}){
  const qtyError=useId(),priceError=useId();
  const total=edit?lineTotal(parseQuantity(edit.quantity),parsePrice(edit.unitPrice)):lineTotal(line.quantity,line.unitPrice);
  const sku=line.sku??'';
  const unit=line.unit;
  const qtyUnit=unitLabel(edit?parseQuantity(edit.quantity):line.quantity,unit);
  const priceUnit=perUnitLabel(unit);
  return <tr>
    <td className={s.itemCell}>
      <div className={s.desc}>
        {line.description||sku}
        {line.matchedBy==='rep'&&<span className={s.repTag}>{QUOTE_COPY.matchedByRep}</span>}
      </div>
      <div className={s.original}>{line.originalText}</div>
      {quantityNote(line)&&<div className={line.quantityUnclear?s.qtyFlag:s.original}>{quantityNote(line)}</div>}
    </td>
    <td className={s.sku}>{sku}</td>
    <td className={s.num}>
      {edit
        ?<NumberInput label={`Quantity for ${sku}`} value={edit.quantity} error={errors?.quantity} errorId={qtyError} suffix={qtyUnit} onChange={quantity=>onChange({quantity})}/>
        :line.quantity===null?<None>{QUOTE_COPY.notSet}</None>:<><span>{formatQuantity(line.quantity)}</span>{qtyUnit&&<span className={s.unit}> {qtyUnit}</span>}</>}
    </td>
    <td className={s.num}>
      {edit
        ?<NumberInput label={`Unit price for ${sku}`} value={edit.unitPrice} error={errors?.unitPrice} errorId={priceError} prefix="$" suffix={priceUnit} onChange={unitPrice=>onChange({unitPrice})}/>
        :line.unitPrice===null?<None>{QUOTE_COPY.notPriced}</None>:<><span>{formatUnitPrice(line.unitPrice)}</span>{priceUnit&&<span className={s.unit}> {priceUnit}</span>}</>}
    </td>
    <td className={`${s.num} ${s.money}`}>{total===null?<None>{QUOTE_COPY.notPriced}</None>:formatMoney(total)}</td>
    {edit&&<td className={s.removeCol}><RemoveButton label={`${QUOTE_COPY.remove} ${sku}`} onClick={onRemove}/></td>}
  </tr>;
}

/** What the customer asked for when the line's quantity was flagged or converted from it; null when it was used as it stood. */
function quantityNote(line:QuoteLine):string|null{
  if(line.quantityUnclear)return line.customerQuantity?`${QUOTE_COPY.quantityFlagged}: customer wrote ${line.customerQuantity}`:QUOTE_COPY.quantityFlagged;
  return line.customerQuantity?`Customer asked for ${line.customerQuantity}`:null;
}

function NumberInput({label,value,error,errorId,prefix,suffix,onChange}:{label:string;value:string;error?:string;errorId:string;prefix?:string;suffix?:string|null;onChange:(value:string)=>void}){
  return <div className={s.numberField}>
    <span className={s.inputRow}>
      <span className={s.inputWrap}>
        {prefix&&<span className={s.prefix} aria-hidden="true">{prefix}</span>}
        <input type="text" inputMode="decimal" autoComplete="off" className={`${s.input} ${s.numberInput} ${prefix?s.withPrefix:''}`} aria-label={label} value={value}
          aria-invalid={error?true:undefined} aria-describedby={error?errorId:undefined} onChange={event=>onChange(event.target.value)}/>
      </span>
      {suffix&&<span className={s.unit}>{suffix}</span>}
    </span>
    {error&&<span className={s.fieldError} id={errorId}>{error}</span>}
  </div>;
}

function TextField({id,label,value,error,onChange}:{id:string;label:string;value:string;error?:string;onChange:(value:string)=>void}){
  return <div className={s.field}>
    <label className={s.fieldLabel} htmlFor={id}>{label}</label>
    <input id={id} type="text" className={s.input} value={value} maxLength={200} autoComplete="off"
      aria-invalid={error?true:undefined} aria-describedby={error?`${id}-error`:undefined} onChange={event=>onChange(event.target.value)}/>
    {error&&<span className={s.fieldError} id={`${id}-error`}>{error}</span>}
  </div>;
}

function RemoveButton({label,onClick}:{label:string;onClick:()=>void}){
  return <button type="button" className={s.removeButton} aria-label={label} title={label} onClick={onClick}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>
    </svg>
  </button>;
}
