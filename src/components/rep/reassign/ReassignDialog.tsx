'use client';
import {useId,useRef,useState,type FormEvent} from 'react';
import type {ReassignResult} from '@/server/rep/reassign';
import {useModal} from '../quote-detail/send/use-modal';
import d from '../quote-detail/send/Send.module.css';
import s from './Reassign.module.css';

// Reassign (v3 spec §5, §6, §8; decisions 21, 22; task D2): the manager picks an active rep for one
// quote (the quote page's read-only banner and ⋯ menu) or several (the Quotes list's bulk action),
// then POST /api/rep/quotes/reassign moves them, each with an Activity row. A centered dialog like
// Confirm send: a red Cancel and a Querent-green Reassign. Escape or Cancel closes it with nothing
// sent. A try that got no answer reuses its Idempotency-Key, so a retry never moves twice.

export interface ReassignTarget {id:string;name:string}

export interface ReassignDialogProps {
  quotes:readonly {id:string;quote_number:string}[];
  /** The active reps a quote can go to (OA-27), by name. */
  targets:readonly ReassignTarget[];
  /** The signed-in manager: offered first, marked "(you)". */
  me:string;
  /** The rep who already has every one of these quotes: not offered. */
  currentRep?:string|null;
  /** The rep chosen when the dialog opens (the manager, on another rep's quote); none by default. */
  initial?:string|null;
  onClose:()=>void;
  /** The quotes moved: the server's answer. */
  onDone:(result:ReassignResult)=>void;
}

const newKey=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():`k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;

/** "Q-24817", or "3 quotes". */
export const reassignSubject=(quotes:readonly {quote_number:string}[])=>quotes.length===1?quotes[0].quote_number:`${quotes.length} quotes`;

export function ReassignDialog({quotes,targets,me,currentRep=null,initial=null,onClose,onDone}:ReassignDialogProps){
  const titleId=useId(),selectId=useId();
  const dialog=useRef<HTMLFormElement>(null),select=useRef<HTMLSelectElement>(null);
  const options=[...targets.filter(t=>t.id===me),...targets.filter(t=>t.id!==me)].filter(t=>t.id!==currentRep);
  const [to,setTo]=useState(()=>options.some(t=>t.id===initial)?initial!:'');
  const [busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null);
  const unanswered=useRef<string|null>(null);
  useModal(dialog,{onEscape:()=>{if(!busy)onClose();},initialFocus:select});

  async function submit(event:FormEvent){
    event.preventDefault();
    if(!to||busy)return;
    setBusy(true);setError(null);
    const key=unanswered.current??=newKey();
    let response:Response;
    try{
      response=await fetch('/api/rep/quotes/reassign',{method:'POST',cache:'no-store',headers:{'content-type':'application/json','idempotency-key':key},
        body:JSON.stringify({quoteIds:quotes.map(q=>q.id),toRepId:to})});
    }catch{
      setBusy(false);setError('No answer from the server. Check your connection and try again.');
      return;
    }
    unanswered.current=null;
    if(response.status===401){window.location.assign('/');return;}
    const body=await response.json().catch(()=>null);
    if(!response.ok){setBusy(false);setError(typeof body?.detail==='string'?body.detail:'The quotes weren’t reassigned. Try again.');return;}
    onDone(body as ReassignResult);
  }

  const subject=reassignSubject(quotes);
  return <div className={d.backdrop}>
    <form ref={dialog} className={`${d.dialog} ${d.confirm}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onSubmit={submit}>
      <header className={d.head}>
        <h2 id={titleId}>Reassign {subject}</h2>
        <p className={d.sum}>The new rep owns {quotes.length===1?'it':'them'} from now on. Activity records the move.</p>
      </header>
      <div className={d.body}>
        {quotes.length>1&&<p className={s.list}>{quotes.map(q=>q.quote_number).join(', ')}</p>}
        <label className={s.label} htmlFor={selectId}>New rep
          <select ref={select} id={selectId} className={s.select} value={to} disabled={busy} onChange={event=>setTo(event.target.value)}>
            <option value="" disabled>Choose a rep</option>
            {options.map(t=><option key={t.id} value={t.id}>{t.name}{t.id===me?' (you)':''}</option>)}
          </select>
        </label>
      </div>
      {error&&<p className={`${d.problem} ${d.confirmProblem}`} role="alert">{error}</p>}
      <footer className={d.confirmFoot}>
        <button type="button" className={d.cancel} onClick={onClose} disabled={busy}>Cancel</button>
        <button type="submit" className={d.go} disabled={busy||!to}>{busy?'Reassigning…':'Reassign'}</button>
      </footer>
    </form>
  </div>;
}
