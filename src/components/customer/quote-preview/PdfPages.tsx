'use client';
import {useEffect,useRef,useState} from 'react';
import {SiteIcon} from '../site/icons';
import {renderPdf,renderScale} from './render-pdf';

// The customer PDF inline in the preview modal (spec §3, task 5.1): its pages drawn on canvases
// (see ./render-pdf), with the pages' text kept for screen readers.

type State={status:'loading'}|{status:'ready';text:string[]}|{status:'error';message:string};

/** The PDF request failed; the message says why in the customer's words. */
class PdfLoadError extends Error {}

/** What went wrong loading the PDF, in the customer's words. */
export function pdfLoadError(status:number){
  return status===404?'This quote’s PDF isn’t available.':'The quote PDF couldn’t be loaded. Check your connection and try again.';
}

export function PdfPages({url,label}:{url:string;
  /** Names the document for screen readers: "Quote Q-24817, revision 1". */
  label:string}){
  const sheets=useRef<HTMLDivElement>(null);
  const [state,setState]=useState<State>({status:'loading'});
  const [attempt,setAttempt]=useState(0);
  const [zoomed,setZoomed]=useState(false);

  useEffect(()=>{
    const into=sheets.current;
    if(!into)return;
    let cancelled=false;
    setState({status:'loading'});
    into.replaceChildren();
    (async()=>{
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)throw new PdfLoadError(pdfLoadError(response.status));
      const data=new Uint8Array(await response.arrayBuffer());
      if(cancelled)return;
      const {text}=await renderPdf(data,into,{scale:renderScale(window.devicePixelRatio),cancelled:()=>cancelled});
      if(!cancelled)setState({status:'ready',text});
    })().catch(error=>{
      if(cancelled)return;
      into.replaceChildren();
      setState({status:'error',message:error instanceof PdfLoadError?error.message:'The quote PDF couldn’t be shown here.'});
    });
    return ()=>{cancelled=true;};
  },[url,attempt]);

  return <div className="qp-pdf" role="document" aria-label={label} aria-busy={state.status==='loading'} data-state={state.status} data-zoom={zoomed?'in':'fit'}>
    {state.status==='ready'&&<div className="qp-pdf-bar">
      <span>{state.text.length===1?'1 page':`${state.text.length} pages`}</span>
      {/* Zooming in makes the print larger; the desk scrolls both ways. */}
      <button type="button" className="qp-zoom" aria-pressed={zoomed} onClick={()=>setZoomed(z=>!z)}>
        <SiteIcon name={zoomed?'zoomOut':'zoomIn'} size={16}/>{zoomed?'Fit to width':'Zoom in'}
      </button>
    </div>}
    <div className="qp-sheets" ref={sheets}/>
    {state.status==='ready'&&<div className="qp-sr">{state.text.map((page,i)=><p key={i}>{page}</p>)}</div>}
    {state.status==='loading'&&<p className="qp-pdf-note" role="status">Loading the PDF…</p>}
    {state.status==='error'&&<div className="qp-pdf-note" role="alert">
      <p>{state.message}</p>
      <button type="button" className="qp-zoom" onClick={()=>setAttempt(n=>n+1)}>Try again</button>
    </div>}
  </div>;
}
