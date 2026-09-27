'use client';
import {Fragment,useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {useModal} from '@/components/rep/quote-detail/send/use-modal';

// The customer's Confirm dialog (spec §3, task 5.2), for Accept and for Request changes: centered on
// screen over the PDF preview modal, it repeats what will be sent ("Accept Q-24817 rev 2 for $X,
// pickup Thu at SLC, PO 7781?") with a red Cancel and a Querent-green Send, as the rep's Confirm
// send does (task 3.7). It is narrow and its buttons sit in its middle, away from the form's button
// at the bottom right of the modal, so the second click of a double click can't land on Send.
// Clicking outside does nothing: only Cancel, Escape or Send close it.

export interface ConfirmFact {label:string;value:string;
  /** A quieter second line under the value. */
  detail?:string;
  /** Keep the value's line breaks (the change request note). */
  multiline?:boolean}

export interface ConfirmResponseProps {
  /** "Confirm acceptance", "Confirm change request". */
  title:string;
  /** The sentence that says what will be sent. */
  question:string;
  facts:readonly ConfirmFact[];
  /** The answer is in flight. */
  busy:boolean;
  /** Why the last try didn't go: no answer from the server. */
  error:string|null;
  onCancel:()=>void;
  onSend:()=>void;
}

export function ConfirmResponse({title,question,facts,busy,error,onCancel,onSend}:ConfirmResponseProps){
  const titleId=useId(),questionId=useId();
  const dialog=useRef<HTMLDivElement>(null);
  useModal(dialog,{onEscape:()=>{if(!busy)onCancel();}});
  return createPortal(<div className="qc-backdrop">
    <div ref={dialog} className="qc-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={questionId} tabIndex={-1}>
      <header className="qc-head">
        <h2 id={titleId}>{title}</h2>
        <p id={questionId} className="qc-question">{question}</p>
      </header>
      <dl className="qc-facts">
        {facts.map(f=><Fragment key={f.label}>
          <dt>{f.label}</dt>
          <dd data-multiline={f.multiline||undefined}>{f.value}{f.detail&&<span>{f.detail}</span>}</dd>
        </Fragment>)}
      </dl>
      {error&&<p className="qc-problem" role="alert">{error}</p>}
      <footer className="qc-foot">
        <button type="button" className="qc-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="qc-send" onClick={onSend} disabled={busy}>{busy?'Sending…':'Send'}</button>
      </footer>
    </div>
  </div>,document.body);
}
