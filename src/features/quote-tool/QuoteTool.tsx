'use client';
import {useEffect,useId,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {requestMatch,saveQuote,searchCatalog,type MatchOutcome} from './client';
import {QuoteReviewDialog} from './QuoteReviewDialog';
import {MAX_LIST_CHARS,MAX_LIST_LINES,MAX_PDF_BYTES,countListLines,type MatchRun,type ProgressEvent,type SaveQuoteRequest,type ScoredItem} from './types';
import s from './QuoteTool.module.css';

// The quote creation tool's input (docs/boxt/plan.md B5): the customer's list pasted (one item per line,
// up to 200 non-empty lines) or a PDF (up to 4 MB), then Find matches. While the server streams progress
// a bar shows the stage in words; a result opens the review dialog, and a saved quote opens its page.
// Errors are one plain line. The list never leaves this page except to the match API.

export interface QuoteToolProps {
  /** Injected in tests; the app uses the match API. */
  match?:(form:FormData,onProgress:(event:ProgressEvent)=>void)=>Promise<MatchOutcome>;
  save?:(body:SaveQuoteRequest)=>Promise<{id:string}>;
  search?:(q:string)=>Promise<ScoredItem[]>;
}

export const NOT_PDF_MESSAGE='Only PDF files can be uploaded. Paste the list as text instead.';
export const PDF_TOO_LARGE_MESSAGE='That PDF is larger than 4 MB. Upload a smaller file, or paste the list as text.';

/** The stage in words. */
export function progressText({stage,done,total}:ProgressEvent):string{
  if(stage==='parse')return 'Reading the list…';
  if(stage==='match')return `Matching ${done} of ${total}…`;
  return `Checking ${done} of ${total} with Claude…`;
}

/** How far along the run is, 0 to 100: reading 0 to 10, matching 10 to 50, checking 50 to 100. */
export function progressPercent({stage,done,total}:ProgressEvent):number{
  const part=total>0?Math.min(1,done/total):0;
  const [from,span]=stage==='parse'?[0,10]:stage==='match'?[10,40]:[50,50];
  return Math.round(from+span*part);
}

const kb=(bytes:number)=>bytes<1024*1024?`${Math.max(1,Math.round(bytes/1024))} KB`:`${(bytes/1024/1024).toFixed(1)} MB`;

export function QuoteTool({match,save=body=>saveQuote(body),search=q=>searchCatalog(q)}:QuoteToolProps){
  const router=useRouter();
  const [text,setText]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [fileError,setFileError]=useState('');
  const [runError,setRunError]=useState('');
  const [running,setRunning]=useState(false);
  const [progress,setProgress]=useState<ProgressEvent|null>(null);
  const [run,setRun]=useState<MatchRun|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const abort=useRef<AbortController|null>(null);
  const listId=useId(),counterId=useId();

  useEffect(()=>()=>abort.current?.abort(),[]);

  const lines=countListLines(text);
  const capError=file?'':lines>MAX_LIST_LINES
    ?`This list has ${lines} lines. The limit is ${MAX_LIST_LINES}, so split it into smaller lists.`
    :text.length>MAX_LIST_CHARS?'This list is too long. Paste up to 200 lines of up to a few hundred characters each.':'';
  const error=fileError||capError||runError;
  const canRun=!running&&!capError&&(file!==null||lines>0);

  function choose(chosen:File|undefined){
    setRunError('');
    if(!chosen)return;
    if(chosen.type!=='application/pdf'){setFileError(NOT_PDF_MESSAGE);return;}
    if(chosen.size>MAX_PDF_BYTES){setFileError(PDF_TOO_LARGE_MESSAGE);return;}
    setFileError('');
    setFile(chosen);
  }

  function clearFile(){
    setFile(null);setFileError('');setRunError('');
    if(fileInput.current)fileInput.current.value='';
  }

  async function findMatches(){
    if(!canRun)return;
    const form=new FormData();
    if(file)form.set('file',file);else form.set('text',text);
    setRunning(true);setRunError('');setProgress({stage:'parse',done:0,total:1});
    const controller=new AbortController();
    abort.current=controller;
    const outcome=await (match??((f,onProgress)=>requestMatch(f,onProgress,{signal:controller.signal})))(form,event=>setProgress(event));
    if(controller.signal.aborted)return;
    setRunning(false);setProgress(null);
    if(outcome.ok)setRun(outcome.run);else setRunError(outcome.error);
  }

  return <div className={s.tool}>
    <div className={s.card}>
      <div className={s.cardHead}>
        {file
          ?<span className={s.label}>Customer&apos;s list (PDF)</span>
          :<label className={s.label} htmlFor={listId}>Paste the customer&apos;s list, one item per line</label>}
        <label className={`${s.upload}${running?` ${s.disabled}`:''}`}>
          <input ref={fileInput} type="file" className={s.srOnly} accept="application/pdf,.pdf" aria-label="Upload PDF" disabled={running}
            onChange={e=>choose(e.target.files?.[0])}/>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5l5 5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span aria-hidden="true">Upload PDF</span>
        </label>
      </div>

      {file
        ?<div className={s.file}>
          <svg className={s.fileIcon} width="28" height="28" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
          <div className={s.fileText}>
            <span className={s.fileName}>{file.name}</span>
            <span className={s.fileMeta}>PDF, {kb(file.size)}. Every product line in it is read and matched.</span>
          </div>
          <button type="button" className={s.secondary} onClick={clearFile} disabled={running}>Remove PDF</button>
        </div>
        :<textarea id={listId} className={s.list} value={text} rows={14} spellCheck={false} disabled={running}
          aria-describedby={counterId} aria-invalid={capError!==''}
          placeholder={'S-4128   12 x 10 x 8" Corrugated Boxes, 32 ECT   10 bundles\nS-1734   Cast Stretch Wrap 18" x 1500\' 80 Gauge   4 rolls\nReclosable Poly Bags 30 x 30" 2 Mil, qty 2 cases'}
          onChange={e=>{setText(e.target.value);setRunError('');}}/>}

      <div className={s.cardFoot}>
        <span id={counterId} className={`${s.counter}${capError?` ${s.over}`:''}`}>
          {file?'Up to 200 product lines are read from the PDF.':`${lines} of ${MAX_LIST_LINES} lines`}
        </span>
        <button type="button" className={s.primary} disabled={!canRun} onClick={()=>void findMatches()}>Find matches</button>
      </div>
    </div>

    {running&&progress&&<div className={s.progress}>
      <div className={s.track} role="progressbar" aria-label="Matching progress" aria-valuemin={0} aria-valuemax={100}
        aria-valuenow={progressPercent(progress)} aria-valuetext={progressText(progress)}>
        <div className={`${s.bar}${progress.stage==='parse'?` ${s.reading}`:''}`} style={{width:`${Math.max(4,progressPercent(progress))}%`}}/>
      </div>
      <p className={s.stage} aria-live="polite">{progressText(progress)}</p>
    </div>}

    {error&&<p className={s.error} role="alert">{error}</p>}

    {run&&<QuoteReviewDialog run={run} save={save} search={search}
      onClose={()=>setRun(null)}
      onSaved={id=>router.push(`/quotes/${encodeURIComponent(id)}`)}/>}
  </div>;
}
