'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import type {RepQuoteRow} from '@/server/rep/quotes';
import {noteTime,replyTo} from './labels';
import s from './Quotes.module.css';

// View note (plan U3; C_QOB6 from the board, C_QOT4 from the table): the customer's change request note
// in a centered dialog over the dimmed page, with a reply box, Close and Send reply. Send reply posts
// to /api/rep/quotes/<number>/reply (recorded on the quote's Activity until the product owner says where
// a reply reaches the customer, docs/plans/status.md "No frame") and closes. Escape, the x, Close or a
// press on the backdrop close it with nothing sent. Focus starts in the reply box and stays in the dialog.

export function NoteDialog({row,onClose}:{row:RepQuoteRow|null;onClose:()=>void}){
  const [mounted,setMounted]=useState(false);
  useEffect(()=>setMounted(true),[]);
  if(!row?.change_request||!mounted)return null;
  return createPortal(<div className={`ui-root ${s.layer}`}><NoteBody key={row.id} row={row} onClose={onClose}/></div>,document.body);
}

function NoteBody({row,onClose}:{row:RepQuoteRow;onClose:()=>void}){
  const titleId=useId(),replyId=useId();
  const dialog=useRef<HTMLDivElement>(null),reply=useRef<HTMLTextAreaElement>(null);
  const [text,setText]=useState('');
  const [sending,setSending]=useState(false);
  const [problem,setProblem]=useState('');
  const close=useRef(onClose);
  useEffect(()=>{close.current=onClose;});
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null;
    reply.current?.focus({preventScroll:true});
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close.current();};
    document.addEventListener('keydown',key);
    return()=>{document.removeEventListener('keydown',key);before?.focus({preventScroll:true});};
  },[]);
  // Tab and Shift+Tab cycle through the dialog's controls.
  function trap(event:ReactKeyboardEvent){
    if(event.key!=='Tab')return;
    const focusable=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),textarea')];
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  async function send(){
    // Nothing written yet: back to the reply box (C_QOB6 draws Send reply ready before any text).
    if(!text.trim()){reply.current?.focus();return;}
    setSending(true);setProblem('');
    try{
      const response=await fetch(`/api/rep/quotes/${encodeURIComponent(row.quote_number)}/reply`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({body:text})});
      if(!response.ok)throw new Error(((await response.json().catch(()=>null)) as {detail?:string}|null)?.detail??'Unable to send the reply.');
      onClose();
    }catch(error){setProblem(error instanceof Error?error.message:'Unable to send the reply.');setSending(false);}
  }
  const note=row.change_request!;
  const to=replyTo(row);
  return <>
    <div className={s.backdrop} data-ui="note-backdrop" onClick={onClose}/>
    <div ref={dialog} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} data-ui="note-dialog" onKeyDown={trap}>
      <div className={s.dialogHead}>
        <div>
          <div id={titleId} className={s.dialogTitle}>{`Note on ${row.quote_number}`}</div>
          <div className={s.dialogWho}>{[note.by??row.customer_name,note.at?noteTime(note.at):null].filter(Boolean).join(', ')}</div>
        </div>
        <button type="button" className={s.close} aria-label="Close" onClick={onClose}>x</button>
      </div>
      <div className={s.dialogNote}>{`"${note.note}"`}</div>
      <label htmlFor={replyId} className={s.replyLabel}>{`Reply to ${to}`}</label>
      <textarea ref={reply} id={replyId} className={s.reply} placeholder="Write a reply" value={text} maxLength={2000} onChange={e=>setText(e.target.value)}/>
      {problem&&<p role="alert" className={s.problem}>{problem}</p>}
      <div className={s.dialogActions}>
        <button type="button" className={s.dialogClose} onClick={onClose}>Close</button>
        <button type="button" className={s.send} disabled={sending} onClick={()=>void send()}>Send reply</button>
      </div>
    </div>
  </>;
}
