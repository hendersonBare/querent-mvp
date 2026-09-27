'use client';
import {useId,useRef} from 'react';
import {QUOTE_MESSAGE_MAX} from '@/server/quotes';
import type {QuoteCheck} from '@/server/rep/quote-math';
import {useModal} from './use-modal';
import q from '../QuoteDetail.module.css';
import s from './Send.module.css';

// Approve & send, step 1 (spec §4, docs/design/screens/07; task 3.7): who it goes to and what,
// what is still open (warnings only: "You can send anyway"), what blocks it (Send quote stays
// disabled), the channel (Querent chat is the only one built), Attach PDF (on by default, with a
// preview of the draft as the customer PDF), and the message, which the rep can edit. Send quote
// doesn't send: it opens the separate Confirm send.

export interface SendDialogProps {
  /** "Dana Ortiz" (the contact, else the company). */
  recipient:string;
  /** "Dana", for the message label. */
  recipientFirstName:string;
  /** "4 items · $1,122.40 before tax · Will call at SLC, Thu Sep 24 · valid until Oct 9". */
  summary:string;
  /** What only warns (margin, stock, match): the open-issues callout. */
  warnings:readonly QuoteCheck[];
  /** What blocks the send (sendBlockers), plus why the quote can't be sent at all (its status). */
  blockers:readonly string[];
  /** Edits are still being saved: wait before sending. */
  saving:boolean;
  message:string;onMessage:(text:string)=>void;
  attachPdf:boolean;onAttachPdf:(on:boolean)=>void;
  /** The draft as the customer PDF, stamped "Draft preview · not sent" (task 4.1). */
  previewUrl:string;
  /** "Quote Q-24817 is ready: $1,122.40, valid until Oct 9": what the chat shows with the message. */
  headline:string;
  /** Why the last send didn't go, when it came back here (e.g. it was blocked). */
  error:string|null;
  /** Focus the Send quote button instead of the message (coming back from Confirm send). */
  focusSend?:boolean;
  onCancel:()=>void;
  onSend:()=>void;
}

const issueText=(c:QuoteCheck)=>`${c.subject?`${c.subject}: `:''}${c.text}`;

export function SendDialog({recipient,recipientFirstName,summary,warnings,blockers,saving,message,onMessage,attachPdf,onAttachPdf,previewUrl,headline,error,focusSend,onCancel,onSend}:SendDialogProps){
  const titleId=useId(),summaryId=useId(),blockedId=useId(),viaId=useId(),messageId=useId(),noteId=useId();
  const dialog=useRef<HTMLDivElement>(null),field=useRef<HTMLTextAreaElement>(null),send=useRef<HTMLButtonElement>(null);
  useModal(dialog,{onEscape:onCancel,initialFocus:focusSend?send:field});
  const blocked=blockers.length>0;
  return <div className={s.backdrop} onPointerDown={event=>{if(event.target===event.currentTarget)onCancel();}}>
    <div ref={dialog} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={summaryId} tabIndex={-1}>
      <header className={s.head}>
        <h2 id={titleId}>Send quote to {recipient}</h2>
        <p id={summaryId} className={s.sum}>{summary}</p>
      </header>
      <div className={s.body}>
        {blocked&&<div id={blockedId} className={s.blocked} role="alert"><strong>Can’t send yet:</strong>
          <ul>{blockers.map((text,i)=><li key={i}>{text}</li>)}</ul></div>}
        {warnings.length>0&&<p className={s.open}>Still open: {warnings.map(issueText).join('; ')}. You can send anyway.</p>}
        {error&&<p className={s.problem} role="alert">{error}</p>}
        <div className={s.via} role="group" aria-labelledby={viaId}>
          <span id={viaId} className={s.viaLabel}>Send by</span>
          <label title="Querent chat is the only channel in this demo"><input type="checkbox" checked disabled readOnly/>Querent chat</label>
          <label><input type="checkbox" checked={attachPdf} onChange={event=>onAttachPdf(event.target.checked)}/>Attach PDF</label>
          <a className={s.preview} href={previewUrl} target="_blank" rel="noopener noreferrer">Preview PDF</a>
        </div>
        <div className={s.field}>
          <label htmlFor={messageId}>Message to {recipientFirstName}</label>
          <textarea ref={field} id={messageId} rows={5} maxLength={QUOTE_MESSAGE_MAX} value={message} aria-describedby={noteId}
            onChange={event=>onMessage(event.target.value)}/>
          <p id={noteId} className={s.note}>{recipientFirstName}’s chat shows it under “{headline} — View quote”.</p>
        </div>
      </div>
      <footer className={s.foot}>
        {saving&&<span className={s.saving} role="status">Saving your changes…</span>}
        <button type="button" className={q.btn} onClick={onCancel}>Cancel</button>
        <button ref={send} type="button" className={`${q.btn} ${q.primary}`} onClick={onSend} disabled={blocked||saving}
          aria-describedby={blocked?blockedId:undefined}>Send quote</button>
      </footer>
    </div>
  </div>;
}
