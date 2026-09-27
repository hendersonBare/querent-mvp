'use client';
import {useState,type FormEvent} from 'react';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {saveError} from './api';
import {count,firstName,stamp} from './format';
import {Panel} from './Panel';
import type {SavePanel} from './types';
import p from './Panels.module.css';

// Internal notes (spec §4, task 3.4; mockup #accNotes): notes for Herrick's team on this quote.
// Only the rep portal shows them. They are never in the customer's snapshot, routes or PDF (the
// internal worksheet, task 4.2, prints them for the team). Adding one is logged in Activity,
// without its text. Like every other edit, notes are added while the quote is a draft.

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
    {notes.length>0&&<ul className={p.notes} aria-label="Internal notes">
      {notes.map(n=><li key={n.id}>{n.body}<span>{firstName(n.rep_name)} · {stamp(n.created_at,as_of)}</span></li>)}
    </ul>}
    {editable
      ?<form className={p.noteForm} onSubmit={add}>
        <label className={p.field}>Only your team sees these
          <textarea value={text} onChange={event=>setText(event.target.value)} placeholder="Add a note for your team" maxLength={2000}/>
        </label>
        {error&&<p className={p.error} role="alert">{error}</p>}
        <button type="submit" className={p.btn} disabled={busy}>{busy?'Adding…':'Add note'}</button>
      </form>
      :!notes.length&&<p className={p.fnote}>No internal notes on this quote.</p>}
  </Panel>;
}
