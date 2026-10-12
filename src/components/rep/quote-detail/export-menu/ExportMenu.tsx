'use client';
import {useCallback,useRef,useState} from 'react';
import type {PdfRevision} from '@/server/pdf/request';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {quoteFigures,type DetailLine} from '@/server/rep/quote-math';
import {ActionMenu,type MenuItem} from '../ActionMenu';
import {ExportIcon} from '../icons';
import {QuoteToast,type ToastMessage} from '../more-menu/QuoteToast';
import {copyText} from './clipboard';
import {ExportRefused,downloadExport} from './download';
import {quoteSummaryText,summaryQuoteOf} from './summary';

// The quote editor's Export menu (plan U4, C_QE2; spec §4; task 4.3), under the Export icon button, in
// the frame's order and words:
//   Customer quote (PDF)     GET /api/quotes/<id>/pdf?variant=customer (task 4.1)
//   Internal worksheet (PDF) GET /api/quotes/<id>/pdf?variant=internal (task 4.2)
//   Line items (CSV)         GET /api/rep/quotes/<id>/lines.csv: the customer quote's columns
//   ──
//   Copy quote summary       plain text built from the page, onto the clipboard
//
// Every export reads the quote as it is on screen (exportRevision): the draft while the rep can
// edit it (ready for review, or changes requested: then the draft of the next revision, not the
// one the customer has), else the latest sent revision. Downloads first wait for queued edits to
// save, then fetch the file and save it under the server's name; one runs at a time. The summary
// is built from the lines on screen in the click itself, so the clipboard write counts as the
// rep's own.

export type ExportKind='customer'|'internal'|'csv';

/** Which revision the exports read: the draft while the rep can edit it, else the latest sent one. */
export const exportRevision=(detail:{editable:boolean;quote:{revision:number}}):Exclude<PdfRevision,null>=>detail.editable?'draft':detail.quote.revision;

/** Where each download comes from, for `rev`. */
export function exportUrl(kind:ExportKind,quoteId:string,rev:Exclude<PdfRevision,null>){
  const id=encodeURIComponent(quoteId);
  return kind==='csv'?`/api/rep/quotes/${id}/lines.csv?rev=${rev}`:`/api/quotes/${id}/pdf?variant=${kind}&rev=${rev}`;
}

const NOUNS:Record<ExportKind,string>={customer:'customer quote',internal:'internal worksheet',csv:'line items CSV'};
const capitalized=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);
const firstName=(name:string|null)=>name?.trim().split(/\s+/)[0]||null;

export interface ExportMenuProps {
  detail:Pick<QuoteDetail,'quote'|'editable'|'valid_until'|'floors'|'freight'|'delivery_rates'|'panels'>;
  /** The lines as on screen (queued edits and typing included): the summary copies these. */
  lines:readonly DetailLine[];
  /** Resolves once the page's queued edits are saved (the quote editor's flush). */
  flush:()=>Promise<void>;
  buttonClassName?:string;
}

export function ExportMenu({detail,lines,flush,buttonClassName}:ExportMenuProps){
  const {quote}=detail;
  const [busy,setBusy]=useState<ExportKind|null>(null);
  const [toast,setToast]=useState<ToastMessage|null>(null);
  /** Set synchronously, so a second choice in the same instant can't start a second download. */
  const running=useRef(false);
  const dismiss=useCallback(()=>setToast(null),[]);
  const rev=exportRevision(detail);

  async function download(kind:ExportKind){
    if(running.current)return;
    running.current=true;
    setBusy(kind);
    setToast({text:`Preparing the ${NOUNS[kind]}…`,tone:'progress'});
    try{
      await flush();
      const filename=await downloadExport(exportUrl(kind,quote.id,rev),`${quote.quote_number} ${NOUNS[kind]}${kind==='csv'?'.csv':'.pdf'}`);
      setToast({text:`Exported ${filename}`,tone:'done'});
    }catch(error){
      setToast({text:error instanceof ExportRefused?error.message:`${capitalized(`the ${NOUNS[kind]}`)} didn’t download. Check your connection and try again.`,tone:'error'});
    }finally{
      running.current=false;
      setBusy(null);
    }
  }

  function copySummary(){
    const figures=quoteFigures(lines,{freight:detail.freight,rates:detail.delivery_rates,branchCode:quote.branch_code,
      floor:{repId:quote.rep_id,repName:quote.rep_name,floors:detail.floors}});
    // The payment terms come from the Customer panel's account facts, as in the mockup ("Net 30").
    const text=quoteSummaryText(summaryQuoteOf(detail,lines,figures,detail.panels.customer.terms));
    void copyText(text).then(copied=>setToast(copied
      ?{text:'Quote summary copied',tone:'done'}
      :{text:'The browser blocked copying. Allow clipboard access for this site and try again.',tone:'error'}));
  }

  const downloadItem=(kind:ExportKind,label:string,hint:string):MenuItem=>({
    label:busy===kind?`Preparing the ${NOUNS[kind]}…`:label,hint,disabled:busy!==null,onSelect:()=>void download(kind)});
  const items:MenuItem[]=[
    downloadItem('customer','Customer quote (PDF)',`What ${firstName(quote.contact_name)??'the customer'} sees. No cost or margin.`),
    downloadItem('internal','Internal worksheet (PDF)','Adds cost, margin, last paid and open checks'),
    downloadItem('csv','Line items (CSV)','Opens in Excel or Google Sheets'),
    {label:'Copy quote summary',hint:'Plain text for an email or text message',separator:true,onSelect:copySummary},
  ];

  return <>
    <ActionMenu buttonClassName={buttonClassName} label="Export" menuLabel="Export" items={items}><ExportIcon/></ActionMenu>
    <QuoteToast message={toast} onDismiss={dismiss}/>
  </>;
}
