'use client';
import {useState,type KeyboardEvent} from 'react';
import type {ValidDays} from '@/domain';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {validUntilFor} from '@/server/quotes';
import {day} from '../format';
import {saveError} from './api';
import {Panel} from './Panel';
import type {SavePanel} from './types';
import p from './Panels.module.css';

// The Quote terms panel (spec §4, task 3.4; mockup #accTerms): valid for 7, 14 or 30 days, the
// customer's PO and the note printed on the quote. The choice saves at once; the texts save when
// the field is left (or on Enter in the PO), each logged in Activity.

const VALID_DAYS:ValidDays[]=[7,14,30];

/** A text field's draft, reset whenever the saved value changes (after a save, or someone else's). */
function useSavedText(saved:string|null){
  const [text,setText]=useState(saved??'');
  const [base,setBase]=useState(saved);
  if(saved!==base){setBase(saved);setText(saved??'');}
  return [text,setText] as const;
}

export function TermsPanel({detail,save}:{detail:QuoteDetail;save:SavePanel}){
  const {quote,editable,as_of}=detail;
  const [po,setPo]=useSavedText(quote.customer_po);
  const [note,setNote]=useSavedText(quote.customer_note);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);

  async function saveTerms(patch:{validDays?:ValidDays;customerPo?:string;customerNote?:string}){
    setBusy(true);setError(null);
    try{await save('terms','PATCH',patch);}catch(caught){setError(saveError(caught));}finally{setBusy(false);}
  }
  const commitPo=()=>{if(po.trim()!==(quote.customer_po??''))void saveTerms({customerPo:po});};
  const commitNote=()=>{if(note.trim()!==(quote.customer_note??''))void saveTerms({customerNote:note});};
  const enterSaves=(event:KeyboardEvent<HTMLInputElement>)=>{if(event.key==='Enter'){event.preventDefault();event.currentTarget.blur();}};

  // A draft runs from the day it is sent; a sent quote keeps the valid-until it went out with.
  const until=(days:ValidDays)=>editable?validUntilFor(as_of,days):detail.valid_until;
  const value=`Valid until ${day(detail.valid_until,as_of)}${quote.customer_po?` · PO ${quote.customer_po}`:''}`;

  return <Panel label="Quote terms" value={value}>
    <label className={p.field}>Valid for
      <select value={quote.valid_days} onChange={event=>void saveTerms({validDays:Number(event.target.value) as ValidDays})} disabled={!editable||busy}>
        {VALID_DAYS.map(days=><option key={days} value={days}>{days} days ({day(until(days),as_of)})</option>)}
      </select>
    </label>
    <label className={p.field}>Customer PO number
      <input value={po} onChange={event=>setPo(event.target.value)} onBlur={commitPo} onKeyDown={enterSaves} maxLength={40} disabled={!editable}
        placeholder={editable?'Optional, customer can add at acceptance':undefined} autoComplete="off"/>
    </label>
    <label className={p.field}>Note printed on the quote
      <textarea value={note} onChange={event=>setNote(event.target.value)} onBlur={commitNote} maxLength={1000} disabled={!editable}
        placeholder={editable?'The customer sees this on the quote and its PDF':undefined}/>
    </label>
    {busy&&<p className={p.saving} role="status">Saving…</p>}
    {error&&<p className={p.error} role="alert">{error}</p>}
  </Panel>;
}
