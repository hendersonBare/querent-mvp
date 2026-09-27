'use client';
import {useCallback,useRef,useState} from 'react';
import {defaultSendMessage,draftPdfUrl,quoteReadyHeadline} from '@/server/quotes';
import type {QuoteCheck,QuoteFigures} from '@/server/rep/quote-math';
import {day,itemCount,money} from '../format';
import {QuoteToast,type ToastMessage} from '../more-menu/QuoteToast';
import {dayWithWeekday} from '../panels/format';
import type {QuoteEditor} from '../use-quote-editor';
import {newSendKey,postSend,SendRefused,type SendAnswer} from './api';
import {ConfirmSendDialog} from './ConfirmSendDialog';
import {SendDialog} from './SendDialog';

// Approve & send (spec §4, §5.4; task 3.7): the send dialog, then Confirm send, then the send.
//
// One send per click: the Confirm's Send runs once at a time (a ref set before the request, so a
// double click can't start a second), and each attempt carries an Idempotency-Key. A retry after
// no answer reuses the key, so the server replays the first send if it went through; after any
// answer the next attempt gets a new one. The server also refuses a second send by status.
//
// The send goes through the editor's queue (saveQuote), so it follows any edit still saving, and
// its answer, the quote as sent, replaces the page's copy: the status chip, the banner and the
// Activity follow. Confirm send shows the server's numbers for the saved draft (send_check), the
// same ones the send is held to (revision and total): if the quote changed in between, the
// server refuses (conflict), the page reloads the quote, and the rep can send again.

const firstName=(name:string)=>name.trim().split(/\s+/)[0];

export interface ApproveAndSendProps {
  open:boolean;
  editor:QuoteEditor;
  /** The live totals (the page's summary card). */
  figures:QuoteFigures;
  /** "Things to check before sending": blockers and warnings, live. */
  checks:readonly QuoteCheck[];
  onClose:()=>void;
}

export function ApproveAndSend({open,editor,figures,checks,onClose}:ApproveAndSendProps){
  const {detail}=editor;
  const {quote,send_check:check}=detail;
  const [step,setStep]=useState<'compose'|'confirm'>('compose');
  /** The rep's own message; null while they haven't changed the suggested one (which follows the quote). */
  const [typed,setTyped]=useState<string|null>(null);
  const [attachPdf,setAttachPdf]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<{step:'compose'|'confirm';text:string}|null>(null);
  const [returned,setReturned]=useState(false);
  const [toast,setToast]=useState<ToastMessage|null>(null);
  const running=useRef(false);
  /** The key of a send that got no answer: trying again reuses it, so the server can't send twice. */
  const unanswered=useRef<string|null>(null);
  const dismissToast=useCallback(()=>setToast(null),[]);

  const recipient=quote.contact_name??quote.customer_name;
  const who=firstName(recipient);
  const suggested=defaultSendMessage({customerFirstName:who,repFirstName:firstName(quote.rep_name),lineCount:editor.lines.length,total:figures.total,
    fulfillment:quote.fulfillment,branchCode:quote.branch_code,requestedDate:quote.requested_date});
  const message=typed??suggested;
  const total=figures.total??figures.items;
  const validUntil=day(detail.valid_until,detail.as_of);
  const place=quote.fulfillment==='delivery'?`Delivery from ${quote.branch_code}`:`Will call at ${quote.branch_code}`;
  const summary=[itemCount(editor.lines.length),figures.total===null?`${money(figures.items)} before freight and tax`:`${money(figures.total)} before tax`,
    quote.requested_date?`${place}, ${dayWithWeekday(quote.requested_date)}`:place,`valid until ${validUntil}`].join(' · ');
  const blockers=[...(detail.editable?[]:[check.status_problem??`${quote.quote_number} can’t be sent now.`]),
    ...checks.filter(c=>c.kind==='blocker').map(c=>c.text)];
  const warnings=checks.filter(c=>c.kind!=='blocker');
  const saving=editor.pending>0;
  const canSend=detail.editable&&check.can_send&&check.total!==null&&!blockers.length;

  function close(){
    if(busy)return;
    setStep('compose');setError(null);setReturned(false);
    onClose();
  }
  function toConfirm(){
    if(blockers.length||saving)return;
    setError(null);setStep('confirm');
  }
  function backToCompose(){
    if(busy)return;
    setError(null);setReturned(true);setStep('compose');
  }

  async function send(){
    if(running.current||!canSend||check.total===null)return;
    running.current=true;
    setBusy(true);setError(null);
    const key=unanswered.current??=newSendKey();
    const body={message,attach_pdf:attachPdf,revision:check.revision,total:check.total};
    const result:{answer?:SendAnswer}={};
    try{
      await editor.saveQuote(async()=>{
        try{result.answer=await postSend(quote.id,body,key);}
        catch(caught){
          // Any answer, even a refusal, means the next attempt is a new send: a new key.
          if(caught instanceof SendRefused)unanswered.current=null;
          throw caught;
        }
        unanswered.current=null;
        return result.answer.detail;
      });
      const sent=result.answer?.sent;
      setTyped(null);setStep('compose');setReturned(false);
      onClose();
      setToast({text:`Sent ${sent?.quote_number??quote.quote_number} rev ${sent?.revision??body.revision} to ${who} in Querent chat`,tone:'done'});
    }catch(caught){
      if(caught instanceof SendRefused){
        if(caught.status===422||caught.status===400){
          // Unfinished after all (or a bad message): back to the send dialog, where the reasons show.
          if(caught.status===422)await editor.refresh();
          setError({step:'compose',text:caught.message});setReturned(true);setStep('compose');
        }else setError({step:'confirm',text:caught.message});
      }else setError({step:'confirm',text:`No answer from the server, so ${quote.quote_number} may not have gone yet. Press Send again: it won’t be sent twice.`});
    }finally{
      running.current=false;
      setBusy(false);
    }
  }

  return <>
    {open&&step==='compose'&&<SendDialog recipient={recipient} recipientFirstName={who} summary={summary} warnings={warnings} blockers={blockers} saving={saving}
      message={message} onMessage={setTyped} attachPdf={attachPdf} onAttachPdf={setAttachPdf} previewUrl={draftPdfUrl(quote.id)}
      headline={quoteReadyHeadline({quoteNumber:quote.quote_number,total,validUntil:detail.valid_until,sentAt:detail.as_of})}
      error={error?.step==='compose'?error.text:null} focusSend={returned} onCancel={close} onSend={toConfirm}/>}
    {open&&step==='confirm'&&<ConfirmSendDialog quoteNumber={quote.quote_number} revision={check.revision} recipient={recipient} company={quote.customer_name}
      total={check.total??total} belowFloor={check.below_floor_count} attachPdf={attachPdf} busy={busy} canSend={canSend}
      error={error?.step==='confirm'?error.text:null} onCancel={backToCompose} onSend={()=>void send()}/>}
    <QuoteToast message={toast} onDismiss={dismissToast}/>
  </>;
}
