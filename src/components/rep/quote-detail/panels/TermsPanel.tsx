'use client';
import {useId,useState,type KeyboardEvent} from 'react';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {MAX_EXPIRATION_DAYS,dayAfter,daysUntil,expirationProblem} from '@/server/quotes';
import {day} from '../format';
import {saveError} from './api';
import {Panel} from './Panel';
import type {SavePanel} from './types';
import p from './Panels.module.css';

// Quote details, Quote terms (plan U4, C_QE4; spec §4, task 3.4): the valid-until date, the customer's
// PO and the note printed on the quote. The rep picks any date after today (within a year); until they
// do, the quote runs valid_days (14) from the day it is sent. A picked date saves as soon as it is
// complete; the texts save when the field is left (or on Enter in the PO), each logged in Activity.

/** A text field's draft, reset whenever the saved value changes (after a save, or someone else's). */
function useSavedText(saved:string|null){
  const [text,setText]=useState(saved??'');
  const [base,setBase]=useState(saved);
  if(saved!==base){setBase(saved);setText(saved??'');}
  return [text,setText] as const;
}

export function TermsPanel({detail,save,flash=false}:{detail:QuoteDetail;save:SavePanel;flash?:boolean}){
  const {quote,editable,as_of}=detail;
  // The date on screen: the rep's pick, else the default if sent today; a sent quote keeps the one it went out with.
  const shownDate=editable?quote.expires_on??dayAfter(as_of,quote.valid_days):detail.valid_until;
  const [date,setDate]=useSavedText(shownDate);
  const [po,setPo]=useSavedText(quote.customer_po);
  const [note,setNote]=useSavedText(quote.customer_note);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const id=useId();

  async function saveTerms(patch:{expiresOn?:string|null;customerPo?:string;customerNote?:string}){
    setBusy(true);setError(null);
    try{await save('terms','PATCH',patch);}catch(caught){setError(saveError(caught));}finally{setBusy(false);}
  }
  const commitPo=()=>{if(po.trim()!==(quote.customer_po??''))void saveTerms({customerPo:po});};
  const commitNote=()=>{if(note.trim()!==(quote.customer_note??''))void saveTerms({customerNote:note});};
  const enterSaves=(event:KeyboardEvent<HTMLInputElement>)=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}};
  // A complete date saves at once (the picker, or the last digit typed); an impossible one says why when the field is left.
  const changeDate=(next:string)=>{
    setDate(next);
    if(next&&next!==shownDate&&!expirationProblem(next,as_of))void saveTerms({expiresOn:next});
  };
  const commitDate=()=>{
    if(!date){setDate(shownDate);return;}
    if(date===shownDate)return;
    const problem=expirationProblem(date,as_of);
    if(problem)setError(problem);
  };

  const value=`Valid until ${day(detail.valid_until,as_of)}${quote.customer_po?`, PO ${quote.customer_po}`:''}`;
  const daysLeft=date&&!expirationProblem(date,as_of)?daysUntil(as_of,date):null;

  return <Panel label="Quote terms" value={value} flash={flash}>
    <div className={p.field}>
      <div id={`${id}-date`} className={p.fieldLabel}>Valid until</div>
      <input type="date" aria-labelledby={`${id}-date`} className={p.box} value={date} min={dayAfter(as_of,1)} max={dayAfter(as_of,MAX_EXPIRATION_DAYS)} disabled={!editable||busy}
        aria-describedby={editable?`${id}-note`:undefined} onChange={event=>changeDate(event.target.value)} onBlur={commitDate}/>
    </div>
    {editable&&<div className={p.small} id={`${id}-note`}>
      {quote.expires_on
        ?<>{daysLeft===null?'Pick a date after today.':`${daysLeft} ${daysLeft===1?'day':'days'} from today.`}<button type="button" className={p.linkButton} disabled={busy} onClick={()=>void saveTerms({expiresOn:null})}>Use the default ({quote.valid_days} days after sending)</button></>
        :`Default: ${quote.valid_days} days after it is sent. Pick any date to change it.`}
    </div>}
    <div className={p.field}>
      <div id={`${id}-po`} className={p.fieldLabel}>Customer PO number</div>
      <input aria-labelledby={`${id}-po`} className={p.box} value={po} onChange={event=>setPo(event.target.value)} onBlur={commitPo} onKeyDown={enterSaves} maxLength={40} disabled={!editable}
        placeholder={editable?'Optional, customer can add at acceptance':undefined} autoComplete="off"/>
    </div>
    <div className={p.field}>
      <div id={`${id}-printed`} className={p.fieldLabel}>Note printed on the quote</div>
      <textarea aria-labelledby={`${id}-printed`} className={`${p.box} ${p.area}`} value={note} onChange={event=>setNote(event.target.value)} onBlur={commitNote} maxLength={1000} disabled={!editable}
        placeholder={editable?'The customer sees this on the quote and in its PDF':undefined}/>
    </div>
    {busy&&<div className={p.saving} role="status">Saving…</div>}
    {error&&<div className={p.error} role="alert">{error}</div>}
  </Panel>;
}
