'use client';
import {useCallback,useEffect,useId,useMemo,useRef,useState,type ReactNode} from 'react';
import {useRouter} from 'next/navigation';
import {Toggle,PageHeader} from '@/components/ui';
import {formatRateBp} from '@/server/freight/recovery';
import {canEditDraft,sendBlockers,type SendBlocker} from '@/server/quotes';
import {AGING_LABELS} from '@/server/quotes/aging';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {quoteChecks,quoteFigures,type QuoteFigures} from '@/server/rep/quote-math';
import {HeaderAlerts} from '../HeaderAlerts';
import {REP_STATUS} from '../quotes/labels';
import {ReassignDialog,type ReassignTarget} from '../reassign/ReassignDialog';
import {ChatButton} from './chat-drawer/ViewFullChat';
import {ExportMenu} from './export-menu/ExportMenu';
import {AddItem} from './AddItem';
import {SaveIcon} from './icons';
import {LineGrid,lineRowId,priceFieldId,qtyFieldId} from './LineGrid';
import {MoreMenu} from './more-menu/MoreMenu';
import {TOAST_STACK,Toast,ToastSlot} from './more-menu/QuoteToast';
import {QuoteDetails,type DetailsSection} from './panels/QuotePanels';
import {blockerSummary,blockerTarget} from './send/blockers';
import {ApproveAndSend} from './send/ApproveAndSend';
import {UpsellsSection} from './upsells/UpsellsSection';
import {day,money,requestedAt,timeOfDay} from './format';
import {useMarkQuoteRead} from './use-mark-read';
import {useQuoteEditor,type QuoteEditor} from './use-quote-editor';
import s from './QuoteDetail.module.css';

// The rep's quote editor (plan U4; C_QEBase and its states C_QE1 to C_QE11): the minimal header
// (customer, quote number, status with Overdue or Aging, purchasing agent, requested, valid until, and
// on a quote that carries freight recovery the "Freight recovery N%" chip, decision 64) with the caution
// and bell; the Items card (Show cost and stock, the lines, + Add item); Suggested by
// Querent; and on the right the total box with Approve and send, the Save draft, Export, Chat and More
// icon buttons, and Quote details. Every edit autosaves (./use-quote-editor); Undo takes the last one
// back. Pricing, margin math, freight and the send rules are the server's (Appendix F).
//
// Send blockers (decision 44, no frame): Approve and send is disabled while sendBlockers() finds
// anything; the first is named under it in red with "+N more", and clicking it jumps to the line or
// field (a quote-level one opens Quote details). The server still refuses a blocked send (422).
//
// The manager (task D2; decision 22) reads any rep's quote: on another rep's it is read-only
// (`read_only`): every edit control is off, one plain line under Approve and send says whose it is, the
// More menu offers Reassign, and the quote isn't marked read for its rep. After a move the page reloads
// as the new owner sees it.

const firstName=(name:string)=>name.trim().split(/\s+/)[0];
/** How long a jump target stays highlighted. */
const FLASH_MS=2400;

/** What the manager's Reassign needs (task D2): who she is and the active reps. Absent for a rep. */
export interface QuoteReassign {me:string;targets:ReassignTarget[]}

type Flash={kind:'line';lineId:string}|{kind:'details';section:DetailsSection}|{kind:'add-item'};

export function QuoteDetailView({initial,reassign}:{initial:QuoteDetail;reassign?:QuoteReassign}){
  const editor=useQuoteEditor(initial);
  const {detail,lines}=editor;
  const {quote,editable}=detail;
  const readOnly=detail.read_only!==null;
  useMarkQuoteRead(quote.id,!readOnly);
  const router=useRouter();
  const [moving,setMoving]=useState(false);
  const startReassign=useMemo(()=>reassign?()=>setMoving(true):undefined,[reassign]);
  const [showCost,setShowCost]=useState(false);
  const [open,setOpen]=useState<ReadonlySet<string>>(()=>new Set());
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [sending,setSending]=useState(false);
  const [flash,setFlash]=useState<Flash|null>(null);
  const flashTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  useEffect(()=>()=>clearTimeout(flashTimer.current),[]);
  const floor=useMemo(()=>({repId:quote.rep_id,repName:quote.rep_name,floors:detail.floors}),[quote.rep_id,quote.rep_name,detail.floors]);
  const figures=useMemo(()=>quoteFigures(lines,{freight:detail.freight,rates:detail.delivery_rates,branchCode:quote.branch_code,floor}),
    [lines,detail.freight,detail.delivery_rates,quote.branch_code,floor]);
  const checks=useMemo(()=>quoteChecks(lines,quote,detail.freight.unresolved,floor,detail.as_of.slice(0,10)),[lines,quote,detail.freight.unresolved,floor,detail.as_of]);
  const blockers=useMemo(()=>editable?sendBlockers({fulfillment:quote.fulfillment,ship_to_address:quote.ship_to_address,expires_on:quote.expires_on,lines},
    detail.freight,{today:detail.as_of.slice(0,10)}):[],[editable,quote.fulfillment,quote.ship_to_address,quote.expires_on,lines,detail.freight,detail.as_of]);
  const toggle=useCallback((lineId:string)=>setOpen(current=>{const next=new Set(current);if(!next.delete(lineId))next.add(lineId);return next;}),[]);
  const customer=quote.contact_name??quote.customer_name;
  const closeSend=useCallback(()=>setSending(false),[]);
  // The quote's frozen freight recovery rate (spec §4.6), for line details.
  const recovery=useMemo(()=>quote.freight_rate_bp===null?null:{rateBp:quote.freight_rate_bp,step:quote.freight_ramp_step,steps:quote.freight_ramp_steps},
    [quote.freight_rate_bp,quote.freight_ramp_step,quote.freight_ramp_steps]);

  /** A send blocker's jump (decision 44): scroll to the line or field at fault and highlight it. */
  const jump=useCallback((blocker:SendBlocker)=>{
    const target=blockerTarget(blocker);
    clearTimeout(flashTimer.current);
    if(target.kind==='details'){setDetailsOpen(true);setFlash({kind:'details',section:target.section});}
    else setFlash(target.kind==='line'?{kind:'line',lineId:target.lineId}:{kind:'add-item'});
    if(target.kind==='line'){
      document.getElementById(lineRowId(target.lineId))?.scrollIntoView({behavior:'smooth',block:'center'});
      document.getElementById(target.field==='qty'?qtyFieldId(target.lineId):priceFieldId(target.lineId))?.focus({preventScroll:true});
    }else if(target.kind==='add-item')document.querySelector('[data-ui="add-item"]')?.scrollIntoView({behavior:'smooth',block:'center'});
    // Quote details opens first, then its section scrolls into view.
    else requestAnimationFrame(()=>document.querySelector('[data-ui="total-column"] [data-flash="true"]')?.scrollIntoView({behavior:'smooth',block:'center'}));
    flashTimer.current=setTimeout(()=>setFlash(null),FLASH_MS);
  },[]);

  return <div className={`ui-root ${s.editor}`}>
    <PageHeader className={s.head} title={quote.customer_name} right={<HeaderAlerts/>}/>
    <Facts detail={detail}/>
    <div className={s.body}>
      <div className={s.main}>
        <section className={`${s.card} ${s.itemsCard}`} aria-labelledby="quote-items" data-ui="items-card">
          <div className={s.titlebar}>
            <div id="quote-items" className={s.cardTitle}>Items <span className={s.count} data-ui="item-count">{lines.length}</span></div>
            <div>
              <div className={s.switchRow}>
                <span className={s.switchLabel}>Show cost and stock</span>
                <Toggle checked={showCost} onChange={setShowCost} label="Show cost and stock"/>
              </div>
            </div>
          </div>
          <LineGrid lines={lines} editor={editor} floor={floor} customerFirstName={firstName(customer)} asOf={detail.as_of} showCost={showCost} editable={editable}
            open={open} onToggle={toggle} focusLineId={editor.focusLineId} onFocused={editor.clearFocus} recovery={recovery}
            flashLineId={flash?.kind==='line'?flash.lineId:null}/>
          {editable&&<div data-ui="add-item"><AddItem quoteId={quote.id} onAdd={item=>editor.add(item)} flash={flash?.kind==='add-item'}/></div>}
        </section>
        <UpsellsSection editor={editor} querentFound={figures.querentFoundLabel}/>
      </div>
      <div className={s.side} data-ui="total-column">
        <TotalBox figures={figures} editable={editable} blockers={blockers} readOnlyRep={detail.read_only?.rep_name??null}
          onApprove={()=>setSending(true)} onJump={jump}/>
        <div className={s.actions}>
          <SaveDraft editor={editor} disabled={!editable}/>
          {/* A read-only draft (the manager's view, task D2) still exports as the draft, as its owner would see it. */}
          <ExportMenu detail={detail.read_only?{...detail,editable:canEditDraft(quote.status)}:detail} lines={editor.lines} flush={editor.flush} buttonClassName={s.iconButton}/>
          <div className={s.actionWrap}><ChatButton quoteId={quote.id} customer={customer} hasChat={quote.conversation_id!==null} className={s.iconButton}/></div>
          <MoreMenu quote={quote} flush={editor.flush} buttonClassName={s.iconButton} readOnly={readOnly} onReassign={startReassign}/>
        </div>
        <div className={s.spacer}/>
        <QuoteDetails editor={editor} figures={figures} open={detailsOpen} onToggle={()=>setDetailsOpen(o=>!o)} flash={flash?.kind==='details'?flash.section:null}/>
      </div>
    </div>
    <EditorToasts editor={editor}/>
    <div id={TOAST_STACK} className={s.toasts}/>
    <ApproveAndSend open={sending} editor={editor} figures={figures} checks={checks} onClose={closeSend}/>
    {moving&&reassign&&<ReassignDialog quotes={[{id:quote.id,quote_number:quote.quote_number}]} targets={reassign.targets} me={reassign.me}
      currentRep={quote.rep_id} initial={readOnly?reassign.me:null} onClose={()=>setMoving(false)}
      onDone={()=>{setMoving(false);router.refresh();}}/>}
  </div>;
}

/**
 * Quote, Status (with Overdue or Aging), Purchasing agent, Requested, Valid until (C_QEBase), and on a
 * quote that carries freight recovery its frozen rate as a small chip (decision 64, decision 36).
 */
function Facts({detail}:{detail:QuoteDetail}){
  const {quote,aging}=detail;
  const id=useId();
  const late=aging&&aging.level!=='ok'?aging:null;
  return <div className={s.facts} role="group" aria-label="Quote facts">
    <Fact id={`${id}-q`} label="Quote"><span className={s.quoteNo}>{quote.quote_number}</span></Fact>
    <Fact id={`${id}-s`} label="Status"><span className={s.status}>{REP_STATUS[quote.status].label}</span>
      {late&&<span className={s.aging} data-level={late.level} title={late.reason}>{AGING_LABELS[late.level as 'amber'|'red']}</span>}</Fact>
    <Fact id={`${id}-a`} label="Purchasing agent">{quote.contact_name??'-'}</Fact>
    <Fact id={`${id}-r`} label="Requested">{requestedAt(quote.requested_at)}</Fact>
    <Fact id={`${id}-v`} label="Valid until">{day(detail.valid_until,detail.as_of)}</Fact>
    {quote.freight_rate_bp!==null&&<div className={s.factChip}>
      <span className={s.tag} title="Free delivery pricing: this rate of the goods value is recovered in item prices (rep-only)">{`Freight recovery ${formatRateBp(quote.freight_rate_bp)}`}</span>
    </div>}
  </div>;
}

function Fact({id,label,children}:{id:string;label:string;children:ReactNode}){
  return <div role="group" aria-labelledby={id}>
    <div id={id} className={s.factLabel}>{label}</div>
    <div className={s.factValue}>{children}</div>
  </div>;
}

/** The total box (C_QEBase): total, gross profit, margin with the floor, and Approve and send with what blocks it. */
function TotalBox({figures,editable,blockers,readOnlyRep,onApprove,onJump}:{figures:QuoteFigures;editable:boolean;blockers:readonly SendBlocker[];
  readOnlyRep:string|null;onApprove:()=>void;onJump:(blocker:SendBlocker)=>void}){
  const reasonId=useId();
  const blocked=blockerSummary(blockers);
  const floor=figures.floor.value===null?null:`Margin, floor ${figures.floor.label}`;
  return <section className={s.totalBox} aria-label="Quote summary">
    <div className={s.big}>{money(figures.total)}</div>
    <div className={s.cap}>Quote total, before tax</div>
    <div className={s.pair}>
      <div className={s.stat}><div className={s.statValue}>{money(figures.gp)}</div><div className={s.statLabel}>Gross profit</div></div>
      <div className={s.stat}><div className={s.statValue} data-low={figures.belowFloor||undefined}>{figures.marginLabel}</div><div className={s.statLabel}>{floor??'Margin'}</div></div>
    </div>
    <div className={s.approveWrap}>
      <button type="button" className={s.approve} onClick={onApprove} disabled={!editable||blocked!==null} aria-describedby={blocked?reasonId:undefined}>Approve and send</button>
      {blocked&&<button type="button" id={reasonId} className={s.blocker} onClick={()=>onJump(blockers[0])}>{`${blocked.first}${blocked.more?` ${blocked.more}`:''}`}</button>}
      {readOnlyRep&&<div className={s.readOnly}>{`Read only: ${readOnlyRep}'s quote. Reassign it to edit.`}</div>}
    </div>
  </section>;
}

/** Save draft (C_QEBase): waits for every queued edit, then says so (C_QE11 "Draft saved at 10:26 PM"). */
function SaveDraft({editor,disabled}:{editor:QuoteEditor;disabled:boolean}){
  const [saved,setSaved]=useState<string|null>(null);
  useEffect(()=>{
    if(!saved)return;
    const timer=setTimeout(()=>setSaved(null),3200);
    return()=>clearTimeout(timer);
  },[saved]);
  async function save(){
    setSaved(null);
    await editor.flush();
    setSaved(`Draft saved at ${timeOfDay(new Date().toISOString())}`);
  }
  return <div className={s.actionWrap}>
    <button type="button" className={s.iconButton} aria-label="Save draft" onClick={()=>void save()} disabled={disabled}><SaveIcon/></button>
    <ToastSlot><div role="status" aria-live="polite">{saved&&<Toast text={saved} done/>}</div></ToastSlot>
  </div>;
}

/**
 * What the editor says as edits save (no frame): the save state for screen readers, a refused save
 * (an alert toast with Dismiss), and Undo for the last edit ("Removed Ratchet strap 2 in x 27 ft").
 */
function EditorToasts({editor}:{editor:QuoteEditor}){
  const top=editor.undoStack[0];
  const status=editor.pending?'Saving…':editor.savedAt?'All changes saved':'';
  return <>
    <span className={s.srOnly} role="status">{status}</span>
    <ToastSlot>
      {editor.error&&<div className={s.toast} data-tone="error" role="alert"><span className={s.toastText}>{editor.error}</span>
        <button type="button" className={s.toastAction} onClick={editor.dismissError}>Dismiss</button></div>}
      {top&&<Toast text={top.label} action={<button type="button" className={s.toastAction} onClick={editor.undo} disabled={!top.inverse}>Undo</button>}/>}
    </ToastSlot>
  </>;
}
