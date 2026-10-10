'use client';
import {useId,useRef} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
import {DECLINE_REASONS,type DeclineReason} from '@/domain';
import {DECLINE_NOTE_MAX,DECLINE_REASON_LABELS} from '@/server/quotes';
import {useModal} from '@/components/rep/quote-detail/send/use-modal';

// The customer's Decline dialog (v3 spec §2.1, §6; decisions 13 to 15; task A1). It looks and sits
// like the Confirm dialog (./ConfirmResponse): centered over the PDF preview modal, narrow, a red
// Cancel and a Querent-green confirm button, here labelled Decline. The five reasons are radio
// buttons, none chosen at first; there is no "no response" option. Other opens a plain-text field
// of up to 250 characters, which goes to the rep only. Decline records the decline with or without
// a reason. Cancel, the X and Escape close it with no change; a click outside does nothing.

export interface DeclineDialogProps {
  /** "Decline Q-24817 rev 1? Telling Brandi why is optional." */
  question:string;
  /** The rep's first name, for the Other field's label. */
  rep:string;
  reason:DeclineReason|null;
  note:string;
  /** The decline is in flight. */
  busy:boolean;
  /** Why the last try didn't go: refused input, or no answer from the server. */
  error:string|null;
  onReason:(reason:DeclineReason)=>void;
  onNote:(note:string)=>void;
  onCancel:()=>void;
  onDecline:()=>void;
}

export function DeclineDialog({question,rep,reason,note,busy,error,onReason,onNote,onCancel,onDecline}:DeclineDialogProps){
  const id=useId();
  const dialog=useRef<HTMLDivElement>(null);
  useModal(dialog,{onEscape:()=>{if(!busy)onCancel();}});
  return createPortal(<div className="qc-backdrop">
    <div ref={dialog} className="qc-dialog qd-dialog" role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-question`} tabIndex={-1}>
      <button type="button" className="qd-close" aria-label="Close" onClick={onCancel} disabled={busy}><X size={18} aria-hidden="true"/></button>
      <header className="qc-head">
        <h2 id={`${id}-title`}>Decline quote</h2>
        <p id={`${id}-question`} className="qc-question">{question}</p>
      </header>
      <fieldset className="qd-reasons" disabled={busy}>
        <legend className="qp-sr">Reason for declining (optional)</legend>
        {DECLINE_REASONS.map(value=><label key={value} className="qd-reason">
          <input type="radio" name={`${id}-reason`} value={value} checked={reason===value} onChange={()=>onReason(value)}/><span>{DECLINE_REASON_LABELS[value]}</span>
        </label>)}
      </fieldset>
      {reason==='other'&&<div className="qd-other">
        <label className="qd-other-label" htmlFor={`${id}-note`}>Tell {rep} more (optional)</label>
        <textarea id={`${id}-note`} value={note} rows={3} maxLength={DECLINE_NOTE_MAX} disabled={busy} aria-describedby={`${id}-count`} onChange={event=>onNote(event.target.value)}/>
        <p className="qp-hint" id={`${id}-count`}>Plain text, seen only by {rep}. <span className="qp-count">{note.length}/{DECLINE_NOTE_MAX}</span></p>
      </div>}
      {error&&<p className="qc-problem" role="alert">{error}</p>}
      <footer className="qc-foot">
        <button type="button" className="qc-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="qc-send" onClick={onDecline} disabled={busy}>{busy?'Declining…':'Decline'}</button>
      </footer>
    </div>
  </div>,document.body);
}
