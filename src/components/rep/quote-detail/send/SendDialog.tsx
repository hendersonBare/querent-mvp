'use client';
import {useId,useRef,type KeyboardEvent} from 'react';
import {QUOTE_MESSAGE_MAX} from '@/server/quotes';
import type {QuoteCheck} from '@/server/rep/quote-math';
import {useModal} from './use-modal';
import s from './Send.module.css';

// Approve and send, step 1 (plan U4, C_QE1; spec §4; task 3.7): who it goes to and what, what is still
// open (warnings only: "You can send anyway"), the channel (Querent chat is the only one built, so its
// box is checked and greyed), Attach PDF (on by default) with Preview PDF (the draft as the customer
// PDF), and the message, which the rep can edit. Send quote doesn't send: it opens Confirm send.
// No frame draws what blocks a send here (Approve and send is disabled while anything does, decision
// 44), nor a send the server refused: those are plain red lines (decision 52).

export interface SendDialogProps {
  /** "Dana Ortiz" (the contact, else the company). */
  recipient:string;
  /** "Dana", for the message label. */
  recipientFirstName:string;
  /** "4 items, $1,122.40 before tax. Will call at SLC, Thu Sep 24. Valid until Oct 9." */
  summary:string;
  /** What only warns (margin, stock, match): the Still open callout. */
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

/** "Nitrile disposable gloves: 26.6% margin, below Brandi's 30% Safety & PPE floor" */
const issueText=(c:QuoteCheck)=>`${c.subject?`${c.subject}: `:''}${c.text}`;
/** Every warning as its sentence, then "You can send anyway." (C_QE1). */
export const stillOpenText=(warnings:readonly QuoteCheck[])=>`${warnings.map(issueText).join('. ')}. You can send anyway.`;

export function SendDialog({recipient,recipientFirstName,summary,warnings,blockers,saving,message,onMessage,attachPdf,onAttachPdf,previewUrl,headline,error,focusSend,onCancel,onSend}:SendDialogProps){
  const titleId=useId(),summaryId=useId(),blockedId=useId(),viaId=useId(),labelId=useId(),noteId=useId();
  const dialog=useRef<HTMLDivElement>(null),field=useRef<HTMLTextAreaElement>(null),send=useRef<HTMLButtonElement>(null);
  useModal(dialog,{onEscape:onCancel,initialFocus:focusSend?send:field});
  const blocked=blockers.length>0;
  const toggleKey=(event:KeyboardEvent)=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();onAttachPdf(!attachPdf);}};
  return <div className={s.backdrop} onPointerDown={event=>{if(event.target===event.currentTarget)onCancel();}}>
    <div ref={dialog} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={summaryId} tabIndex={-1}>
      <div id={titleId} className={s.title} role="heading" aria-level={2}>Send quote to {recipient}</div>
      <div id={summaryId} className={s.sum}>{summary}</div>
      {blocked&&<div id={blockedId} className={s.blocked} role="alert">Can&apos;t send yet:
        <ul>{blockers.map((text,i)=><li key={i}>{text}</li>)}</ul></div>}
      {warnings.length>0&&<div className={s.open}><b>Still open:</b> {stillOpenText(warnings)}</div>}
      {error&&<p className={s.problem} role="alert">{error}</p>}
      <div className={s.via} role="group" aria-labelledby={viaId}>
        <span id={viaId} className={s.viaLabel}>Send by</span>
        <span className={s.check} role="checkbox" aria-checked="true" aria-disabled="true" title="Querent chat is the only channel in this demo"><span className={s.box}/>Querent chat</span>
        <span className={s.check} role="checkbox" aria-checked={attachPdf} tabIndex={0} onClick={()=>onAttachPdf(!attachPdf)} onKeyDown={toggleKey}><span className={s.box}/>Attach PDF</span>
        <a className={s.preview} href={previewUrl} target="_blank" rel="noopener noreferrer">Preview PDF</a>
      </div>
      <div id={labelId} className={s.fieldLabel}>Message to {recipientFirstName}</div>
      <textarea ref={field} aria-labelledby={labelId} className={s.message} rows={3} maxLength={QUOTE_MESSAGE_MAX} value={message} aria-describedby={noteId}
        onChange={event=>onMessage(event.target.value)}/>
      <div id={noteId} className={s.note}>{recipientFirstName}&apos;s chat shows it under &quot;{headline} - View quote&quot;.</div>
      <div className={s.foot}>
        {saving&&<span className={s.saving} role="status">Saving your changes…</span>}
        <button type="button" className={s.cancel} onClick={onCancel}>Cancel</button>
        <button ref={send} type="button" className={s.go} onClick={onSend} disabled={blocked||saving}
          aria-describedby={blocked?blockedId:undefined}>Send quote</button>
      </div>
    </div>
  </div>;
}
