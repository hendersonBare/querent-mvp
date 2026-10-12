'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {FileClock,Mail,Phone} from 'lucide-react';
import type {CustomerQuotePreview} from '@/domain';
import type {API} from '@/lib/contracts';
import {useModal} from '@/components/rep/quote-detail/send/use-modal';
import {onOpenQuote,type OpenQuoteDetail} from '../open-quote';
import {SiteIcon} from '../site/icons';
import {STATUS_CHIPS} from '../quote-label';
import {awaitingCopy,isOlderRevision,previewFacts} from './copy';
import {PdfPages} from './PdfPages';
import {ResponseBar,type ResponseStep} from './ResponseBar';

// The PDF preview modal (spec §3, task 5.1; plan U10, C_CVL5). The bell's quote notifications
// (decision 41) and the chat's View quote open it (the open-quote event). It shows the customer PDF of
// the revision the rep sent, inline; Download sits at the top right when the rep left Attach PDF on;
// the action bar at the bottom holds Decline, Request changes and Accept (task 5.2, ./ResponseBar),
// each with its form or dialog and its centered Confirm dialog. Before the first send there is no
// PDF: the modal says the rep is pricing it.

const tel=(phone:string)=>`tel:${phone.replace(/\D/g,'')}`;
const previewPath=({id,revision}:OpenQuoteDetail)=>`customer/quotes/${encodeURIComponent(id)}${revision?`?rev=${revision}`:''}`;

interface DialogProps {api:API;request:OpenQuoteDetail;now?:string;onClose:()=>void;onOpen:(request:OpenQuoteDetail)=>void}

function QuotePreviewDialog({api,request,now,onClose,onOpen}:DialogProps){
  const [preview,setPreview]=useState<CustomerQuotePreview|null>(null);
  const [error,setError]=useState('');
  const [step,setStep]=useState<ResponseStep>('idle');
  /** Bumped to read the quote again (an answer the server refused because the quote moved on). */
  const [reads,setReads]=useState(0);
  const dialog=useRef<HTMLDivElement>(null);
  const close=useRef<HTMLButtonElement>(null);
  const title=useId();
  // Escape and a click outside back out of an open Accept or Request changes form first (what was
  // typed stays for next time), then close the modal.
  const dismiss=()=>{if(step==='idle')onClose();else setStep('idle');};
  useModal(dialog,{onEscape:dismiss,initialFocus:close});

  useEffect(()=>{
    let cancelled=false;
    api.get<CustomerQuotePreview>(previewPath(request))
      .then(result=>{if(!cancelled)setPreview(result);})
      .catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:'This quote couldn’t be loaded.');});
    return ()=>{cancelled=true;};
  },[api,request,reads]);

  const at=now??new Date().toISOString();
  const chip=preview&&STATUS_CHIPS[preview.status];
  const shown=preview?.shown??null;
  const older=preview?isOlderRevision(preview):false;

  return <div className="qp-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)dismiss();}}>
    <div className="qp-dialog" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1} ref={dialog}>
      <header className="qp-head">
        <div className="qp-title">
          <div className="qp-title-row">
            <span className="qp-quote" id={title}>Quote {preview?.quote_number??request.quote_number}</span>
            {chip&&<span className="qp-state" data-tone={chip.tone}>{chip.label}</span>}
          </div>
          {preview&&<div className="qp-facts">
            {previewFacts(preview,at).map(f=><div key={f.label}><div className="qp-fact-label">{f.label}</div><div className="qp-fact-value">{f.value}</div></div>)}
          </div>}
        </div>
        <div className="qp-tools">
          {shown?.attach_pdf&&<a className="qp-download" href={shown.pdf_url} download>
            <SiteIcon name="download" size={17}/>Download
          </a>}
          <button type="button" className="qp-close" aria-label="Close" onClick={onClose} ref={close}><SiteIcon name="close" size={20}/></button>
        </div>
      </header>

      <div className="qp-desk">
        {error?<div className="qp-empty" role="alert"><p className="qp-empty-title">{error}</p><p>Open it again from the bell, or ask your rep.</p></div>
          :!preview?<p className="qp-pdf-note" role="status">Loading the quote…</p>
          :!shown?<Awaiting preview={preview}/>
          :<>
            {older&&<div className="qp-older">
              <p>You’re looking at revision {shown.revision}. Revision {preview.latest_revision} is the latest.</p>
              <button type="button" className="qp-zoom" onClick={()=>onOpen({id:preview.id,quote_number:preview.quote_number,revision:preview.latest_revision})}>
                View revision {preview.latest_revision}
              </button>
            </div>}
            <PdfPages url={shown.pdf_url} label={`Quote ${preview.quote_number}, revision ${shown.revision}`}/>
          </>}
      </div>

      <ResponseBar preview={error?null:preview} now={at} step={step} onStep={setStep} onAnswered={setPreview} onStale={()=>setReads(n=>n+1)}/>
    </div>
  </div>;
}

function Awaiting({preview}:{preview:CustomerQuotePreview}){
  const copy=awaitingCopy(preview);
  return <div className="qp-empty">
    <FileClock size={28} aria-hidden="true" className="qp-empty-icon"/>
    <p className="qp-empty-title">{copy.title}</p>
    <p>{copy.body}</p>
    {preview.rep&&<p className="qp-empty-links">
      <a href={tel(preview.rep.phone)}><Phone size={14} aria-hidden="true"/>{preview.rep.phone}</a>
      <a href={`mailto:${preview.rep.email}`}><Mail size={14} aria-hidden="true"/>{preview.rep.email}</a>
    </p>}
  </div>;
}

/**
 * The modal's place in the customer workspace: closed until an open-quote event names a quote. A
 * second event (a revision link, another button) replaces what it shows.
 */
export function QuotePreview({api,now}:{api:API;now?:string}){
  const [request,setRequest]=useState<OpenQuoteDetail|null>(null);
  useEffect(()=>onOpenQuote(setRequest),[]);
  if(!request)return null;
  return createPortal(<QuotePreviewDialog key={`${request.id}:${request.revision??'latest'}`} api={api} request={request} now={now}
    onClose={()=>setRequest(null)} onOpen={setRequest}/>,document.body);
}
