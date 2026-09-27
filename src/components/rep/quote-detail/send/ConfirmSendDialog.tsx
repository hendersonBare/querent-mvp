'use client';
import {useId,useRef} from 'react';
import {money} from '../format';
import {useModal} from './use-modal';
import s from './Send.module.css';

// Approve & send, step 2 (spec §4; task 3.7): Confirm send, a separate dialog centered on screen
// that repeats what will go out (the quote number and revision, who gets it, the total and how many
// lines are below floor) with a red Cancel and a Querent-green Send. It is narrower than the send
// dialog and its buttons sit in the middle, so the second click of a double click on Send quote
// (bottom right of the send dialog) can't land on Send. Clicking outside it does nothing: only
// Cancel, Escape or Send close it.

export interface ConfirmSendDialogProps {
  quoteNumber:string;
  /** The revision this send stores (1 on a first send). */
  revision:number;
  /** "Dana Ortiz" and "Wasatch Mechanical Contractors". */
  recipient:string;company:string;
  /** Before tax. */
  total:number;
  belowFloor:number;
  attachPdf:boolean;
  /** The send is in flight. */
  busy:boolean;
  /** The quote can go now (still editable, nothing blocking it). */
  canSend:boolean;
  /** Why the last try didn't send: a conflict to retry, no answer, or a refusal. */
  error:string|null;
  onCancel:()=>void;
  onSend:()=>void;
}

export function ConfirmSendDialog({quoteNumber,revision,recipient,company,total,belowFloor,attachPdf,busy,canSend,error,onCancel,onSend}:ConfirmSendDialogProps){
  const titleId=useId(),summaryId=useId();
  const dialog=useRef<HTMLDivElement>(null);
  useModal(dialog,{onEscape:()=>{if(!busy)onCancel();}});
  return <div className={`${s.backdrop} ${s.confirmBackdrop}`}>
    <div ref={dialog} className={`${s.dialog} ${s.confirm}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={summaryId} tabIndex={-1}>
      <header className={s.head}>
        <h2 id={titleId}>Confirm send</h2>
        <p className={s.sum}>This goes to the customer now.</p>
      </header>
      <dl id={summaryId} className={s.facts}>
        <dt>Quote</dt><dd>{quoteNumber} rev {revision}</dd>
        <dt>To</dt><dd>{recipient}, {company}<span>Querent chat{attachPdf?', PDF attached':''}</span></dd>
        <dt>Total</dt><dd>{money(total)}<span>before tax</span></dd>
        <dt>Below floor</dt><dd data-warn={belowFloor>0||undefined}>{belowFloor===0?'None':`${belowFloor} ${belowFloor===1?'line':'lines'}`}{belowFloor>0&&<span>a warning only</span>}</dd>
      </dl>
      {error&&<p className={`${s.problem} ${s.confirmProblem}`} role="alert">{error}</p>}
      <footer className={s.confirmFoot}>
        <button type="button" className={s.cancel} onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className={s.go} onClick={onSend} disabled={busy||!canSend}>{busy?'Sending…':'Send'}</button>
      </footer>
    </div>
  </div>;
}
