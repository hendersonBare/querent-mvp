'use client';
import {useCallback,useMemo,useState} from 'react';
import Link from 'next/link';
import {ChevronRight} from 'lucide-react';
import {formatRateBp} from '@/server/freight/recovery';
import {DECLINE_REASON_LABELS,fulfillmentTimeLabel} from '@/server/quotes';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {quoteChecks,quoteFigures,type CheckKind,type QuoteCheck,type QuoteFigures} from '@/server/rep/quote-math';
import {useRepScope} from '../context';
import {StatusChip} from '../quotes/QuotesList';
import {ViewFullChat} from './chat-drawer/ViewFullChat';
import {ExportMenu} from './export-menu/ExportMenu';
import {AddItem} from './AddItem';
import {LineGrid,lineRowId} from './LineGrid';
import {MoreMenu} from './more-menu/MoreMenu';
import {QuotePanels} from './panels/QuotePanels';
import {ApproveAndSend} from './send/ApproveAndSend';
import {UpsellsSection} from './upsells/UpsellsSection';
import {day,itemCount,money,requestedAt,signedMoney,timeOfDay} from './format';
import {useMarkQuoteRead} from './use-mark-read';
import {useQuoteEditor,type QuoteEditor} from './use-quote-editor';
import list from '../quotes/QuotesList.module.css';
import s from './QuoteDetail.module.css';

// The rep's quote detail (spec §4, docs/design/screens/03-04 and 08; task 3.3): the header with
// its actions, the customer's request, "things to check before sending", the line grid with
// the price-basis dropdowns and floor warnings, the totals and the summary card. Every edit
// autosaves (./use-quote-editor). The side panels (3.4), the ⋯ menu items (3.5), "Suggested by
// Querent" (3.6), the send dialog (3.7) and the Export menu (4.3) build on this page.

const firstName=(name:string)=>name.trim().split(/\s+/)[0];

export function QuoteDetailView({initial}:{initial:QuoteDetail}){
  const editor=useQuoteEditor(initial);
  const {detail,lines}=editor;
  const {quote,editable}=detail;
  useMarkQuoteRead(quote.id);
  const [showCost,setShowCost]=useState(false);
  const [open,setOpen]=useState<ReadonlySet<string>>(()=>new Set());
  const [sending,setSending]=useState(false);
  const floor=useMemo(()=>({repId:quote.rep_id,repName:quote.rep_name,floors:detail.floors}),[quote.rep_id,quote.rep_name,detail.floors]);
  const figures=useMemo(()=>quoteFigures(lines,{freight:detail.freight,rates:detail.delivery_rates,branchCode:quote.branch_code,floor}),
    [lines,detail.freight,detail.delivery_rates,quote.branch_code,floor]);
  const checks=useMemo(()=>quoteChecks(lines,quote,detail.freight.unresolved,floor,detail.as_of.slice(0,10)),[lines,quote,detail.freight.unresolved,floor,detail.as_of]);
  const toggle=useCallback((lineId:string)=>setOpen(current=>{const next=new Set(current);if(!next.delete(lineId))next.add(lineId);return next;}),[]);
  const review=useCallback((lineId:string)=>{
    setOpen(current=>new Set(current).add(lineId));
    requestAnimationFrame(()=>document.getElementById(lineRowId(lineId))?.scrollIntoView({behavior:'smooth',block:'center'}));
  },[]);
  const customer=quote.contact_name??quote.customer_name;
  const closeSend=useCallback(()=>setSending(false),[]);
  // The quote's frozen freight recovery rate (spec §4.6), for "Why this price?".
  const recovery=useMemo(()=>quote.freight_rate_bp===null?null:{rateBp:quote.freight_rate_bp,step:quote.freight_ramp_step,steps:quote.freight_ramp_steps},
    [quote.freight_rate_bp,quote.freight_ramp_step,quote.freight_ramp_steps]);

  return <>
    <QuoteHeader detail={detail} editor={editor} onApprove={()=>setSending(true)}/>
    <StatusBanner detail={detail}/>
    <div className={s.qgrid}>
      <div className={s.qmain}>
        {quote.request_text&&<RequestPanel detail={detail}/>}
        {editable&&<ChecksPanel checks={checks} branchCode={quote.branch_code} onReview={review}/>}
        <section className={s.card} aria-labelledby="quote-items">
          <div className={s.itoolbar}>
            <h2 id="quote-items">Items<span>{itemCount(lines.length)}</span></h2>
            {editable&&<AddItem quoteId={quote.id} busy={editor.adding} onAdd={item=>editor.add(item)}/>}
            <label className={s.switch}><input type="checkbox" role="switch" checked={showCost} onChange={event=>setShowCost(event.target.checked)}/>Show cost</label>
          </div>
          {editor.error&&<p className={s.problem} role="alert">{editor.error}<button type="button" className={s.link} onClick={editor.dismissError}>Dismiss</button></p>}
          {editable&&<UndoBar editor={editor}/>}
          <LineGrid lines={lines} editor={editor} floor={floor} customerFirstName={firstName(customer)} asOf={detail.as_of} showCost={showCost} editable={editable}
            open={open} onToggle={toggle} focusLineId={editor.focusLineId} onFocused={editor.clearFocus} recovery={recovery}/>
          <Totals figures={figures}/>
        </section>
        <UpsellsSection editor={editor} querentFound={figures.querentFoundLabel}/>
      </div>
      <aside className={s.rail} aria-label="Quote summary">
        <SummaryCard figures={figures} repName={quote.rep_name}/>
        <QuotePanels editor={editor} figures={figures}/>
      </aside>
    </div>
    <ApproveAndSend open={sending} editor={editor} figures={figures} checks={checks} onClose={closeSend}/>
  </>;
}

function QuoteHeader({detail,editor,onApprove}:{detail:QuoteDetail;editor:QuoteEditor;onApprove:()=>void}){
  const scope=useRepScope();
  const {quote,editable}=detail;
  const [savedNote,setSavedNote]=useState<string|null>(null);
  async function saveDraft(){
    setSavedNote(null);
    await editor.flush();
    setSavedNote(`Draft saved ${timeOfDay(new Date().toISOString())}`);
  }
  const who=[quote.contact_name,quote.contact_title].filter(Boolean).join(', ');
  const status=editor.pending?'Saving…':savedNote??(editor.savedAt?'All changes saved':null);
  return <>
    <nav className={list.crumbs} aria-label="Breadcrumb">
      <Link href={scope.href('/rep/quotes')}>Quotes</Link><span aria-hidden="true">/</span><span aria-current="page" className={list.crumbHere}>{quote.quote_number}</span>
      {quote.is_sample&&<span className={list.tag}>Sample data</span>}
    </nav>
    <div className={s.qtop}>
      <div className={s.qtitle}>
        <div className={list.titleRow}><h1 className={s.title}>{quote.customer_name}</h1><StatusChip status={quote.status}/>
          {quote.freight_rate_bp!==null&&<span className={list.tag} title="Free delivery pricing: this rate of the goods value is recovered in item prices (rep-only)">Freight recovery {formatRateBp(quote.freight_rate_bp)}</span>}</div>
        <p className={s.qmeta}>{quote.quote_number}{quote.revision>0&&` rev ${quote.revision}`}{who&&` · ${who}`} · Requested {requestedAt(quote.requested_at)} · Valid until {day(detail.valid_until,detail.as_of)}</p>
      </div>
      <div className={s.qactions}>
        <p className={s.saveState} role="status">{status}</p>
        <button type="button" className={s.btn} onClick={saveDraft} disabled={!editable}>Save draft</button>
        <ExportMenu detail={detail} lines={editor.lines} flush={editor.flush} buttonClassName={s.btn}/>
        <MoreMenu quote={quote} flush={editor.flush} buttonClassName={`${s.btn} ${s.sq}`}/>
        <button type="button" className={`${s.btn} ${s.primary}`} onClick={onApprove} disabled={!editable}>Approve &amp; send</button>
      </div>
    </div>
  </>;
}

/** Why the quote is read-only, or the customer's change request on a quote the rep is revising. */
function StatusBanner({detail}:{detail:QuoteDetail}){
  const {quote,as_of}=detail;
  const who=quote.contact_name?firstName(quote.contact_name):quote.customer_name;
  switch(quote.status){
    case 'changes_requested':
      return <p className={s.banner} data-tone="changes"><strong>{who} asked for changes{quote.responded_at&&` on ${day(quote.responded_at,as_of)}`}:</strong> <q>{quote.change_request_note}</q></p>;
    case 'sent':
      return <p className={s.banner}><strong>Sent to {who} as rev {quote.revision}{quote.sent_at&&` on ${day(quote.sent_at,as_of)}`}.</strong> It can’t be edited unless they ask for changes.</p>;
    case 'accepted':{
      // What the customer sent with Accept (task 5.2): their PO and the pickup or delivery time.
      const answer=[quote.customer_po&&`PO ${quote.customer_po}`,
        quote.fulfillment_time&&`${quote.fulfillment==='delivery'?'delivery':'pickup'} ${fulfillmentTimeLabel(quote.fulfillment_time)} ${quote.fulfillment==='delivery'?'from':'at'} ${quote.branch_code}`].filter(Boolean).join(', ');
      return <p className={s.banner} data-tone="accepted"><strong>{who} accepted rev {quote.revision}{quote.responded_at&&` on ${day(quote.responded_at,as_of)}`}{answer&&` with ${answer}`}.</strong> It can’t be edited. Duplicate it to quote again.</p>;
    }
    case 'declined':{
      // The customer's Decline (task A1): the reason, and the Other note, which only the rep sees.
      const why=quote.decline_reason?`: ${DECLINE_REASON_LABELS[quote.decline_reason]}.`:' without giving a reason.';
      const at=quote.declined_at??quote.responded_at;
      return <p className={s.banner} data-tone="declined"><strong>{who} declined rev {quote.revision}{at&&` on ${day(at,as_of)}`}{why}</strong>
        {quote.decline_note&&<> <q>{quote.decline_note}</q></>} It can’t be edited. Duplicate it to quote again.</p>;
    }
    case 'expired':
      return <p className={s.banner}><strong>Expired{quote.valid_until&&`: it was valid until ${day(quote.valid_until,as_of)}`}.</strong> It can’t be edited. Duplicate it to quote again.</p>;
    default:
      return null;
  }
}

function RequestPanel({detail}:{detail:QuoteDetail}){
  const {quote}=detail;
  const who=quote.contact_name??quote.customer_name;
  // The compact box stays as it was; "View full chat" (B1, decision 26) sits beside its summary when the request came from chat.
  return <div className={`${s.card} ${s.reqCard}`}>
    <details className={s.req}>
      <summary><ChevronRight aria-hidden="true" size={14} strokeWidth={2} className={s.chev}/><span className={s.lbl}>Customer request</span>
        <span className={s.reqSnip}>“{quote.request_text}”</span></summary>
      <div className={s.reqBody}>
        <blockquote>“{quote.request_text}”</blockquote>
        <p className={s.who}>{who}{quote.conversation_id?', via Querent chat':''} · {requestedAt(quote.requested_at)}</p>
      </div>
    </details>
    {quote.conversation_id&&<div className={s.reqChat}><ViewFullChat quoteId={quote.id} customer={who}/></div>}
  </div>;
}

const CHECK_LABELS:Record<CheckKind,string>={blocker:'Blocked',margin:'Margin',stock:'Stock',match:'Match'};

function ChecksPanel({checks,branchCode,onReview}:{checks:readonly QuoteCheck[];branchCode:string;onReview:(lineId:string)=>void}){
  const count=checks.length;
  return <section className={`${s.card} ${s.checks}`} data-ok={!count||undefined} aria-labelledby="quote-checks" aria-live="polite">
    <h2 id="quote-checks" className={s.chd}><i aria-hidden="true"/>{count?`${count} ${count===1?'thing':'things'} to check before sending`:'Ready to send'}</h2>
    {count?<ul className={s.checkList}>{checks.map((c,i)=><li key={`${c.kind}-${c.lineId}-${i}`} className={s.check}>
      <span><span className={s.sev} data-kind={c.kind}>{CHECK_LABELS[c.kind]}</span>{c.subject&&<><b>{c.subject}</b>: </>}{c.text}</span>
      {c.lineId&&<button type="button" className={s.link} onClick={()=>onReview(c.lineId!)} aria-label={`Review ${c.subject??'line'}`}>Review</button>}
    </li>)}</ul>
    :<p className={s.check}>Every line is priced, in stock at {branchCode} and at or above its floor.</p>}
  </section>;
}

function UndoBar({editor}:{editor:QuoteEditor}){
  const top=editor.undoStack[0];
  if(!top)return null;
  return <div className={s.undo} role="status"><span>{top.label}</span>
    <button type="button" onClick={editor.undo} disabled={!top.inverse}>Undo</button></div>;
}

function Totals({figures}:{figures:QuoteFigures}){
  const {freight}=figures;
  return <dl className={s.totals} aria-label="Quote totals">
    <dt>Items</dt><dd>{money(figures.items)}</dd>
    <dt>{freight.label}</dt><dd>{freight.callForFreight?'Call for freight':money(freight.amount)}</dd>
    <dt>Sales tax</dt><dd className={s.muted}>Added on invoice</dd>
    <dt className={s.grand}>Quote total</dt><dd className={s.grand}>{money(figures.total)}</dd>
  </dl>;
}

function SummaryCard({figures,repName}:{figures:QuoteFigures;repName:string}){
  const {floor,bar,lift}=figures;
  const marker=floor.uniform?`${firstName(repName)}’s ${floor.label} floor`:`the ${floor.label} blended floor`;
  const blendNote=floor.uniform?undefined:'Each line’s floor for its category, weighted by the line’s total';
  return <section className={`${s.card} ${s.summary}`} aria-label="Quote summary">
    <div className={s.big}>{money(figures.total)}</div>
    <div className={s.cap}>Quote total, before tax{figures.freight.callForFreight&&' (freight to set)'}</div>
    <div className={s.pair}>
      <div><b>{money(figures.gp)}</b><span>Gross profit</span></div>
      <div><b data-low={figures.belowFloor||undefined}>{figures.marginLabel}</b><span>Margin</span></div>
    </div>
    <div className={s.floorBox}>
      {lift!==null&&<p className={s.lift}>{lift===0?'Same as what they paid last time':<><span data-tone={lift>0?'good':'bad'}>{signedMoney(lift)}</span> vs. what they paid last time</>}</p>}
      {floor.value!==null&&<>
        <div className={s.fbar} role="img" aria-label={`Quote margin ${figures.marginLabel} against ${marker}`} title={blendNote}>
          <i style={{width:`${bar.width}%`}} data-low={figures.belowFloor||undefined}/>{bar.marker!==null&&<u style={{left:`${bar.marker}%`}}/>}
        </div>
        <p className={s.barNote} title={blendNote}>Bar shows quote margin. Marker is {marker}.</p>
      </>}
    </div>
  </section>;
}
