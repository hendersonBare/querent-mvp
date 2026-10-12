'use client';
import {useState,type FormEvent} from 'react';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {saveError} from './api';
import {count,firstName,stamp} from './format';
import {Panel} from './Panel';
import type {SavePanel} from './types';
import p from './Panels.module.css';

// Quote details, Internal notes (plan U4, C_QE4; spec §4, task 3.4): notes for Herrick's team on this
// quote. Only the rep portal shows them. They are never in the customer's snapshot, routes or PDF (the
// internal worksheet, task 4.2, prints them for the team). Adding one is logged in Activity, without its
// text. Like every other edit, notes are added while the quote is a draft. No frame draws notes already
// written: each is a line with who and when under it.

export function NotesPanel({detail,save}:{detail:QuoteDetail;save:SavePanel}){
  const {editable,as_of,panels:{notes}}=detail;
  const [text,setText]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  async function add(event:FormEvent){
    event.preventDefault();
    if(!text.trim()){setError('Write a note first.');return;}
    setBusy(true);setError(null);
    try{await save('notes','POST',{body:text});setText('');}catch(caught){setError(saveError(caught));}finally{setBusy(false);}
  }
  return <Panel label="Internal notes" value={notes.length?count(notes.length,'note'):'None'}>
    <div className={p.muted}>Only your team sees these.</div>
    {notes.length>0&&<div role="list" aria-label="Internal notes">
      {notes.map(n=><div key={n.id} role="listitem" className={p.note}>{n.body}<div className={p.small}>{`${firstName(n.rep_name)}, ${stamp(n.created_at,as_of)}`}</div></div>)}
    </div>}
    {editable
      ?<form onSubmit={add}>
        <div className={p.field}>
          <div className={p.fieldLabel}/>
          <textarea className={`${p.box} ${p.area}`} aria-label="Internal note" value={text} onChange={event=>setText(event.target.value)} placeholder="Add a note for your team" maxLength={2000}/>
        </div>
        {error&&<div className={p.error} role="alert">{error}</div>}
        <div className={p.addRow}><button type="submit" className={p.go} disabled={busy}>{busy?'Adding…':'Add note'}</button></div>
      </form>
      :!notes.length&&<div className={p.line}>No internal notes on this quote.</div>}
  </Panel>;
}
