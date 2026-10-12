'use client';
import {useEffect,useId,useRef,useState,type FormEvent} from 'react';
import {Lock} from 'lucide-react';
import type {CustomerQuotePreview,DeclineReason} from '@/domain';
import {
  checkFulfillmentTime,cleanDeclineNote,cleanNote,cleanPo,declineNoteProblem,earliestDay,fulfillmentTimeLabel,latestDay,NOTE_MAX,noteProblem,PO_MAX,poProblem,slotLabel,slotsOn,TIME_SLOTS,
} from '@/server/quotes';
import {emitQuotesChanged} from '../quotes-changed';
import {acceptQuestion,actionNote,canRespond,changesQuestion,declineQuestion,fulfillmentWord,lockedSummary,placeText,repFirstName} from './copy';
import {ConfirmResponse,type ConfirmFact} from './ConfirmResponse';
import {DeclineDialog} from './DeclineDialog';
import {newResponseKey,postResponse,ResponseRefused,type AcceptBody,type ChangesBody,type DeclineBody} from './respond';

// The preview modal's action bar (spec §3, §5.4; task 5.2): Decline (A1), Request changes and Accept,
// enabled only on the latest revision the rep sent while it waits for an answer and hasn't expired.
//
//   Accept          -> a form: pickup or delivery day and time, and the PO. Branch and pickup or
//                      delivery show as the rep approved them, locked (changing them needs Request
//                      changes). The date field starts at the earliest day with a slot left.
//   Request changes -> a form: the note, required.
//   Decline         -> straight to the centered Decline dialog (./DeclineDialog): an optional reason,
//                      and for Other an optional note for the rep; its Decline button answers.
//
// Each form's button opens the centered Confirm dialog (./ConfirmResponse), whose Send answers.
// One answer per click: Send runs once at a time, and each attempt carries an Idempotency-Key that a
// retry after no answer reuses, so the server replays instead of answering twice. A refusal of the
// input (400) goes back to the form; any other refusal (expired, already answered, a newer revision)
// closes the form and reloads the quote to show where it stands. On success the modal shows the
// quote as answered and the sidebar's chip follows.
//
// No chat message is posted (a flagged 5.2 default): the modal and the sidebar confirm the answer.

export type ResponseStep='idle'|'accept'|'changes';

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const capitalized=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);

type Pending=
  |{kind:'accept';body:AcceptBody;at:string;po:string}
  |{kind:'changes';body:ChangesBody;note:string}
  |{kind:'decline';body:DeclineBody};
const WHAT:Record<Pending['kind'],string>={accept:'acceptance',changes:'change request',decline:'decline'};

export interface ResponseBarProps {
  preview:CustomerQuotePreview|null;
  now:string;
  step:ResponseStep;
  onStep:(step:ResponseStep)=>void;
  /** The quote as it stands after the answer. */
  onAnswered:(quote:CustomerQuotePreview)=>void;
  /** The server refused because the quote moved on (expired, answered, revised): reload it. */
  onStale:()=>void;
}

export function ResponseBar({preview,now,step,onStep,onAnswered,onStale}:ResponseBarProps){
  const noteId=useId();
  const [day,setDay]=useState('');
  const [time,setTime]=useState('');
  /** null until typed: then the rep's PO on the quote, if any, is the starting value. */
  const [po,setPo]=useState<string|null>(null);
  const [note,setNote]=useState('');
  const [formProblem,setFormProblem]=useState<string|null>(null);
  const [barProblem,setBarProblem]=useState<string|null>(null);
  const [pending,setPending]=useState<Exclude<Pending,{kind:'decline'}>|null>(null);
  const [busy,setBusy]=useState(false);
  const [confirmProblem,setConfirmProblem]=useState<string|null>(null);
  /** The Decline dialog: open, the reason picked (none at first) and the Other note. */
  const [declining,setDeclining]=useState(false);
  const [reason,setReason]=useState<DeclineReason|null>(null);
  const [declineNote,setDeclineNote]=useState('');
  const running=useRef(false);
  /** The key of an answer that got no reply: trying again reuses it, so the server can't take it twice. */
  const unanswered=useRef<string|null>(null);
  const acceptButton=useRef<HTMLButtonElement>(null),changesButton=useRef<HTMLButtonElement>(null),noteRef=useRef<HTMLSpanElement>(null);
  const previous=useRef<ResponseStep>(step);
  const focusNote=useRef(false);

  // Back from a form: focus the button that opened it. After an answer: the note that says what was sent.
  useEffect(()=>{
    if(step==='idle'&&focusNote.current){focusNote.current=false;noteRef.current?.focus();}
    else if(step==='idle'&&previous.current!=='idle')(previous.current==='accept'?acceptButton:changesButton).current?.focus();
    previous.current=step;
  },[step]);
  // After a decline (the bar never left idle): the note that says it was declined.
  useEffect(()=>{if(!declining&&step==='idle'&&focusNote.current){focusNote.current=false;noteRef.current?.focus();}},[declining,step]);

  const shown=preview?.shown??null;
  const open=!!preview&&canRespond(preview,now);
  /** The rep's first name, or "your rep", as it reads mid-sentence. */
  const rep=preview?repFirstName(preview):'your rep';

  // A form whose quote can no longer be answered (it expired while open, or a reload moved it on) closes.
  useEffect(()=>{if(!open&&step!=='idle')onStep('idle');},[open,step,onStep]);
  useEffect(()=>{if(!open&&declining&&!busy)setDeclining(false);},[open,declining,busy]);

  function start(next:'accept'|'changes'){
    setFormProblem(null);setBarProblem(null);
    onStep(next);
  }
  function back(){
    setFormProblem(null);
    onStep('idle');
  }

  function reviewAccept(event:FormEvent){
    event.preventDefault();
    if(!preview||!shown)return;
    const chosen=checkFulfillmentTime({day,time,fulfillment:shown.fulfillment,now});
    if('problem' in chosen){setFormProblem(chosen.problem);return;}
    const cleaned=cleanPo(po??shown.customer_po??''),problem=poProblem(cleaned);
    if(problem){setFormProblem(problem);return;}
    setFormProblem(null);setConfirmProblem(null);
    setPending({kind:'accept',body:{revision:shown.revision,day,time,po:cleaned},at:chosen.at,po:cleaned});
  }
  function reviewChanges(event:FormEvent){
    event.preventDefault();
    if(!preview||!shown)return;
    const cleaned=cleanNote(note),problem=noteProblem(cleaned);
    if(problem){setFormProblem(problem);return;}
    setFormProblem(null);setConfirmProblem(null);
    setPending({kind:'changes',body:{revision:shown.revision,note:cleaned},note:cleaned});
  }

  function startDecline(){
    setBarProblem(null);setConfirmProblem(null);setReason(null);setDeclineNote('');
    setDeclining(true);
  }
  function cancelDecline(){
    if(busy)return;
    setDeclining(false);setConfirmProblem(null);
  }
  function decline(){
    if(!shown)return;
    const note=reason==='other'?cleanDeclineNote(declineNote):'',problem=declineNoteProblem(note);
    if(problem){setConfirmProblem(problem);return;}
    void send({kind:'decline',body:{revision:shown.revision,reason,...(note?{note}:{})}});
  }

  async function send(pending:Pending|null){
    if(running.current||!preview||!pending)return;
    running.current=true;
    setBusy(true);setConfirmProblem(null);
    const key=unanswered.current??=newResponseKey();
    try{
      const answer=pending.kind==='accept'?await postResponse(preview.id,'accept',pending.body,key)
        :pending.kind==='changes'?await postResponse(preview.id,'request-changes',pending.body,key)
        :await postResponse(preview.id,'decline',pending.body,key);
      unanswered.current=null;
      setPending(null);setNote('');setDeclining(false);
      focusNote.current=true;
      onAnswered(answer.quote);
      onStep('idle');
      emitQuotesChanged();
    }catch(caught){
      if(caught instanceof ResponseRefused){
        // Any answer, even a refusal, means the next attempt is a new one: a new key.
        unanswered.current=null;
        setPending(null);
        // A refused decline note stays in its dialog; a refused form input goes back to the form.
        if(caught.status===400&&pending.kind==='decline')setConfirmProblem(caught.message);
        else if(caught.status===400)setFormProblem(caught.message);
        else{setDeclining(false);setBarProblem(caught.message);onStep('idle');onStale();}
      }else setConfirmProblem(`No answer from the server, so your ${WHAT[pending.kind]} may not have gone through. Press ${pending.kind==='decline'?'Decline':'Send'} again: it won’t be sent twice.`);
    }finally{
      running.current=false;
      setBusy(false);
    }
  }

  const confirm=pending&&preview&&shown?confirmOf(pending,preview,shown,rep):null;

  return <>
    <footer className="qp-actions" data-step={step} aria-label="Respond to this quote" role="group">
      {step==='accept'&&open&&shown&&preview
        ?<AcceptForm preview={preview} shown={shown} now={now} rep={rep} day={day} time={time} po={po??shown.customer_po??''} problem={formProblem}
          onDay={value=>{setDay(value);if(!slotsOn(value,now).includes(time))setTime('');}} onTime={setTime} onPo={setPo} onBack={back} onReview={reviewAccept}/>
        :step==='changes'&&open&&shown&&preview
        ?<ChangesForm preview={preview} rep={rep} note={note} problem={formProblem} onNote={value=>{setNote(value);setFormProblem(null);}} onBack={back} onReview={reviewChanges}/>
        :<>
          <div className="qp-status">
            {preview&&<span className="qp-note" id={noteId} ref={noteRef} tabIndex={-1} aria-live="polite">{actionNote(preview,now)}</span>}
            {preview?.status==='changes_requested'&&preview.response?.kind==='changes_requested'&&<q className="qp-said">{preview.response.note}</q>}
            {barProblem&&<p className="qp-problem" role="alert">{barProblem}</p>}
          </div>
          <div className="qp-buttons">
            <button type="button" className="qp-decline" disabled={!open} aria-describedby={preview?noteId:undefined} onClick={startDecline}>Decline</button>
            <button type="button" ref={changesButton} className="qp-changes" disabled={!open} aria-describedby={preview?noteId:undefined} onClick={()=>start('changes')}>Request changes</button>
            <button type="button" ref={acceptButton} className="qp-accept" disabled={!open} aria-describedby={preview?noteId:undefined} onClick={()=>start('accept')}>Accept</button>
          </div>
        </>}
    </footer>
    {confirm&&<ConfirmResponse {...confirm} busy={busy} error={confirmProblem} onCancel={()=>{if(!busy){setPending(null);setConfirmProblem(null);}}} onSend={()=>void send(pending)}/>}
    {declining&&preview&&<DeclineDialog question={declineQuestion(preview)} rep={rep} reason={reason} note={declineNote} busy={busy} error={confirmProblem}
      onReason={value=>{setReason(value);setConfirmProblem(null);}} onNote={setDeclineNote} onCancel={cancelDecline} onDecline={decline}/>}
  </>;
}

function confirmOf(pending:Exclude<Pending,{kind:'decline'}>,preview:CustomerQuotePreview,shown:NonNullable<CustomerQuotePreview['shown']>,rep:string){
  const quote={label:'Quote',value:`${preview.quote_number} rev ${shown.revision}`};
  const to={label:'To',value:preview.rep?.name??rep};
  if(pending.kind==='changes')return {title:'Confirm change request',question:changesQuestion(preview),
    facts:[quote,to,{label:'Note',value:pending.note,multiline:true}] satisfies ConfirmFact[]};
  const when=capitalized(fulfillmentWord(shown.fulfillment));
  return {title:'Confirm acceptance',
    question:acceptQuestion({quoteNumber:preview.quote_number,revision:shown.revision,total:shown.total,fulfillment:shown.fulfillment,branch:shown.branch,at:pending.at,po:pending.po}),
    facts:[quote,{label:'Total',value:usd.format(shown.total),detail:'before tax'},
      {label:when,value:`${fulfillmentTimeLabel(pending.at)} ${placeText(shown)}`,detail:shown.fulfillment==='delivery'&&shown.ship_to?`to ${shown.ship_to}`:undefined},
      {label:'PO',value:pending.po},to] satisfies ConfirmFact[]};
}

interface AcceptFormProps {
  preview:CustomerQuotePreview;shown:NonNullable<CustomerQuotePreview['shown']>;now:string;rep:string;
  day:string;time:string;po:string;problem:string|null;
  onDay:(day:string)=>void;onTime:(time:string)=>void;onPo:(po:string)=>void;onBack:()=>void;onReview:(event:FormEvent)=>void;
}

function AcceptForm({preview,shown,now,rep,day,time,po,problem,onDay,onTime,onPo,onBack,onReview}:AcceptFormProps){
  const id=useId();
  const first=useRef<HTMLInputElement>(null);
  useEffect(()=>{first.current?.focus();},[]);
  const what=fulfillmentWord(shown.fulfillment),What=capitalized(what);
  const slots=day&&slotsOn(day,now).length?slotsOn(day,now):TIME_SLOTS;
  // A day with no slot left says why at once (a weekend, a past day, too late today).
  const dayProblem=day&&!slotsOn(day,now).length?(()=>{const c=checkFulfillmentTime({day,time:TIME_SLOTS.at(-1)!,fulfillment:shown.fulfillment,now});return 'problem' in c?c.problem:null;})():null;
  return <form className="qp-form" aria-labelledby={`${id}-title`} onSubmit={onReview} noValidate>
    <div className="qp-form-head">
      <h3 id={`${id}-title`}>Accept {preview.quote_number} rev {shown.revision}</h3>
      <span className="qp-form-total">{usd.format(shown.total)} before tax</span>
    </div>
    <fieldset className="qp-locked" disabled aria-describedby={`${id}-locked`}>
      <legend className="qp-sr">{lockedSummary(shown)}, locked</legend>
      <div className="ip-segment" role="radiogroup" aria-label="Pickup or delivery">
        {([['will_call','Pickup'],['delivery','Delivery']] as const).map(([value,label])=><label key={value} className="ip-option">
          <input type="radio" name={`${id}-mode`} value={value} checked={shown.fulfillment===value} readOnly/><span>{label}</span>
        </label>)}
      </div>
      <label className="ip-branch">Branch
        <select value={shown.branch} onChange={()=>undefined}><option value={shown.branch}>{shown.branch}</option></select>
      </label>
      <p className="qp-locked-note" id={`${id}-locked`}><Lock size={14} aria-hidden="true"/>
        <span>{shown.fulfillment==='delivery'&&shown.ship_to?`Delivers to ${shown.ship_to}. `:''}Set by {rep} on this quote. To change the branch or {what}, use Request changes.</span></p>
    </fieldset>
    <div className="qp-fields">
      <label className="qp-field"><span>{What} day</span>
        <input ref={first} type="date" value={day} min={earliestDay(now)} max={latestDay(now)} required aria-describedby={`${id}-hours`}
          aria-invalid={dayProblem?true:undefined} onChange={event=>onDay(event.target.value)}/>
      </label>
      <label className="qp-field"><span>{What} time</span>
        <select value={time} required aria-describedby={`${id}-hours`} onChange={event=>onTime(event.target.value)}>
          <option value="">Choose a time</option>
          {slots.map(slot=><option key={slot} value={slot}>{slotLabel(slot)}</option>)}
        </select>
      </label>
      <label className="qp-field"><span>PO number</span>
        <input value={po} maxLength={PO_MAX} autoComplete="off" required spellCheck={false} onChange={event=>onPo(event.target.value)}/>
      </label>
    </div>
    <p className="qp-hint" id={`${id}-hours`}>Weekdays, 7:00 AM to 4:00 PM Mountain time, at least an hour from now.</p>
    {(dayProblem??problem)&&<p className="qp-problem" role="alert">{dayProblem??problem}</p>}
    <div className="qp-form-buttons">
      <button type="button" className="ip-secondary" onClick={onBack}>Back</button>
      <button type="submit" className="ip-primary">Review and accept</button>
    </div>
  </form>;
}

interface ChangesFormProps {
  preview:CustomerQuotePreview;rep:string;note:string;problem:string|null;
  onNote:(note:string)=>void;onBack:()=>void;onReview:(event:FormEvent)=>void;
}

function ChangesForm({preview,rep,note,problem,onNote,onBack,onReview}:ChangesFormProps){
  const id=useId();
  const field=useRef<HTMLTextAreaElement>(null);
  useEffect(()=>{field.current?.focus();},[]);
  const revision=preview.shown?.revision??preview.latest_revision;
  return <form className="qp-form" aria-labelledby={`${id}-title`} onSubmit={onReview} noValidate>
    <div className="qp-form-head">
      <h3 id={`${id}-title`}>Request changes to {preview.quote_number} rev {revision}</h3>
    </div>
    <label className="qp-field"><span>What should {rep} change?</span>
      <textarea ref={field} value={note} rows={4} maxLength={NOTE_MAX} required aria-describedby={`${id}-hint`}
        placeholder="For example: make the bolts 12 boxes, or deliver to the job site instead." onChange={event=>onNote(event.target.value)}/>
    </label>
    <p className="qp-hint" id={`${id}-hint`}>{capitalized(rep)} revises the quote and sends it back here in chat. <span className="qp-count">{note.length.toLocaleString('en-US')}/{NOTE_MAX.toLocaleString('en-US')}</span></p>
    {problem&&<p className="qp-problem" role="alert">{problem}</p>}
    <div className="qp-form-buttons">
      <button type="button" className="ip-secondary" onClick={onBack}>Back</button>
      <button type="submit" className="ip-primary">Review request</button>
    </div>
  </form>;
}
