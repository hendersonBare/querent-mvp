'use client';
import {useEffect,useRef,type RefObject} from 'react';
import type {PriceBasis} from '@/domain';
import {formatMargin,margin,type FloorContext} from '@/server/floors';
import {formatRateBp} from '@/server/freight/recovery';
import {fromCents} from '@/lib/money';
import {BASIS_LABELS} from '@/server/pricing';
import {lineFigures,parseMoney,parseQty,priceForMargin,shortName,type DetailLine,type LineFigures} from '@/server/rep/quote-math';
import {InfoTip} from '../InfoTip';
import t from '../InfoTip.module.css';
import {lineNotes} from './line-notes';
import {NumberField} from './NumberField';
import {PriceBasisSelect} from './PriceBasisSelect';
import {day,money,priceInput} from './format';
import type {QuoteEditor} from './use-quote-editor';
import s from './QuoteDetail.module.css';

// The quote editor's lines (plan U4; C_QEBase, C_QE7 Show cost and stock, C_QE9 Line details, C_QE10
// Price source). Each line is one grid row on the frame's fixed columns (Qty 60, Unit price 118, Margin
// 78, Total 82; Available 92 and Cost 66 between Qty and Unit price while Show cost and stock is on),
// its text and inputs on one 34px centre line: the item with its SKU, pack, tags and Details; qty; the
// unit price with its price source and the "?" telling why Querent suggests its price; margin; total;
// remove. A line below floor[rep][category] gets the red note directly above its price field (never
// blocking); stock short and a low-confidence match get the same note on the item (decision 44).
// Details opens the line's three columns: Why this price? (with what the customer asked for under it),
// Price options with Use, and Stock by branch. Under free delivery pricing, Why this price? also shows
// the line's freight recovery per unit with the quote's frozen rate and ramp step (spec §4.6); the unit
// price field stays the rep's price and the total is at the customer-facing price.
//
// It is an ARIA table on divs (the frame's grid): a rowgroup per line holds its row and its details.

/** The quote's frozen recovery rate and ramp step (spec §4.6), or null when it carries no recovery. */
export interface QuoteRecovery {rateBp:number;step:number|null;steps:number|null}

export interface LineGridProps {
  lines:readonly DetailLine[];
  editor:Pick<QuoteEditor,'draft'|'edit'|'remove'>;
  floor:FloorContext;
  /** The customer's first name, for "What Dana asked for". */
  customerFirstName:string;
  asOf:string;
  showCost:boolean;
  editable:boolean;
  /** Lines whose details are open. */
  open:ReadonlySet<string>;
  /** The quote's freight recovery rate, when it carries recovery. */
  recovery?:QuoteRecovery|null;
  onToggle:(lineId:string)=>void;
  /** An added line whose qty field should take focus. */
  focusLineId?:string|null;
  onFocused?:()=>void;
  /** A line a send blocker points at (decision 44): it shows the highlight. */
  flashLineId?:string|null;
}

export const qtyFieldId=(lineId:string)=>`qty-${lineId}`;
export const priceFieldId=(lineId:string)=>`price-${lineId}`;
export const lineRowId=(lineId:string)=>`line-${lineId}`;

/** The column headers, with the frame's "::" handles. */
const HEAD=[':: Item',':: Qty',':: Unit price',':: Margin',':: Total'];
const HEAD_COST=[':: Item',':: Qty',':: Available',':: Cost',':: Unit price',':: Margin',':: Total'];

export function LineGrid({lines,showCost,...props}:LineGridProps){
  const cost=showCost||undefined;
  return <div role="table" aria-label="Quote lines">
    <div role="row" className={`${s.cols} ${s.thead}`} data-cost={cost}>
      {(showCost?HEAD_COST:HEAD).map(h=><div key={h} role="columnheader" className={h===':: Item'||h===':: Available'||h===':: Cost'?s.left:undefined}>{h}</div>)}
      <div role="columnheader" aria-label="Remove"/>
    </div>
    {lines.map(line=><LineRow key={line.id} line={line} showCost={showCost} {...props}/>)}
    {!lines.length&&<div className={s.noLines}>No items on this quote.</div>}
  </div>;
}

const firstName=(name:string)=>name.trim().split(/\s+/)[0];

function LineRow({line,editor,floor,customerFirstName,asOf,showCost,editable,open,onToggle,focusLineId,onFocused,recovery=null,flashLineId}:Omit<LineGridProps,'lines'>&{line:DetailLine}){
  const figures=lineFigures(line,floor);
  const name=shortName(line.description);
  const isOpen=open.has(line.id);
  const detailsId=`details-${line.id}`,warnId=`floor-${line.id}`;
  const qtyRef=useRef<HTMLInputElement>(null),priceRef=useRef<HTMLInputElement>(null);
  useFocusWhen(focusLineId===line.id,qtyRef,onFocused);
  const {floor:status,stock,priced}=figures;
  const low=status.belowFloor||undefined;
  const tags=lineTags(line,figures);
  const notes=lineNotes(line,floor);
  const floorLabel=`${firstName(floor.repName)}'s ${status.floorPct}% ${line.category_name} floor`;

  function pickBasis(basis:PriceBasis){
    editor.edit(line.id,{basis});
    if(basis==='custom')requestAnimationFrame(()=>{priceRef.current?.focus();priceRef.current?.select();});
  }

  return <div role="rowgroup" className={s.line} id={lineRowId(line.id)} data-flash={flashLineId===line.id||undefined}>
    <div role="row" className={`${s.cols} ${s.lineRow}`} data-cost={showCost||undefined}>
      <div role="rowheader" aria-label={`${line.description} ${line.sku}`}>
        <div className={s.itemName} data-ui="item-name">{line.description}</div>
        <div className={s.itemMeta}>
          <span className={s.sku}>{line.sku}</span><span className={s.pack}>{line.pack}</span>
          {tags.map(tag=><span key={tag} className={s.tag}>{tag}</span>)}
          <button type="button" className={s.detailsLink} aria-expanded={isOpen} aria-controls={detailsId} aria-label={`Line details for ${name}`}
            onClick={()=>onToggle(line.id)}>Details</button>
        </div>
        {notes.map(note=><div key={note.kind} className={`${s.note} ${s.lineNote}`} data-note={note.kind}>{note.text}</div>)}
      </div>
      <div role="cell" className={s.qtyCell}>
        <NumberField ref={qtyRef} id={qtyFieldId(line.id)} className={s.input} value={String(line.qty)} parse={parseQty} disabled={!editable}
          aria-label={`Quantity for ${line.sku}`} onDraft={qty=>editor.draft(line.id,qty===null?null:{qty})} onCommit={(qty,session)=>editor.edit(line.id,{qty},session)}/>
      </div>
      {showCost&&<div role="cell" className={s.avail}>
        {stock.available===null?<div>-</div>:<><div>{`${stock.available} at ${stock.branchCode}`}</div>{stock.short>0&&<div className={s.short}>{`Short ${stock.short}`}</div>}</>}
      </div>}
      {showCost&&<div role="cell" className={s.cost}>{money(line.unit_cost)}</div>}
      <div role="cell" className={s.priceCell}>
        {status.label&&<div className={`${s.note} ${s.floorNote}`} id={warnId}>{status.label}</div>}
        <div className={s.priceRow}>
          <span>$</span>
          <NumberField ref={priceRef} id={priceFieldId(line.id)} className={`${s.input} ${s.price}`} data-low={low} value={priceInput(line.unit_price)} parse={parseMoney}
            disabled={!editable} placeholder="0.00" aria-label={`Unit price for ${line.sku}`} aria-describedby={status.label?warnId:undefined}
            onDraft={price=>editor.draft(line.id,price===null?null:{unitPrice:price})} onCommit={(unitPrice,session)=>editor.edit(line.id,{unitPrice},session)}/>
        </div>
        {priced&&<div className={s.basisRow}>
          <PriceBasisSelect options={priced.options} value={line.price_basis} onChange={pickBasis} label={`Price basis for ${line.sku}`} disabled={!editable} asOf={asOf}/>
          <PriceReasons line={line} priced={priced} floorLabel={floorLabel}/>
        </div>}
      </div>
      <div role="cell" className={s.marginCell}>
        <NumberField className={`${s.input} ${s.margin}`} data-low={low} value={figures.margin===null?'':figures.marginLabel.replace('%','')}
          parse={marginText} disabled={!editable||line.unit_cost<=0} aria-label={`Margin for ${line.sku}`} aria-describedby={status.label?warnId:undefined}
          onDraft={pct=>{const price=pct===null?null:priceForMargin(line.unit_cost,pct);editor.draft(line.id,price===null?null:{unitPrice:price});}}
          onCommit={(pct,session)=>{const price=priceForMargin(line.unit_cost,pct);if(price!==null)editor.edit(line.id,{unitPrice:price},session);}}/>
        <span>%</span>
      </div>
      <div role="cell" className={s.total} data-ui="line-total">{money(figures.total)}</div>
      <div role="cell">
        {editable&&<button type="button" className={s.remove} aria-label={`Remove ${name}`} title="Remove item" onClick={()=>editor.remove(line.id)}>x</button>}
      </div>
    </div>
    {isOpen&&<LineDetails id={detailsId} name={name} line={line} figures={figures} floorLabel={floorLabel} recovery={recovery}
      customerFirstName={customerFirstName} asOf={asOf} editable={editable} onUse={basis=>editor.edit(line.id,{basis})}/>}
  </div>;
}

/** A margin the rep typed ("33.0"), in percent, below 100. */
function marginText(text:string){
  const trimmed=text.trim().replace(/%$/,'');
  if(!/^-?\d+(\.\d*)?$|^-?\.\d+$/.test(trimmed))return null;
  const pct=Number(trimmed);
  return pct<100&&pct>-1000?pct:null;
}

/** The line's tags beside its pack (C_QEBase draws CONTRACT; the others are the same tag for who added the line). */
function lineTags(line:DetailLine,figures:LineFigures){
  const tags:string[]=[];
  if(figures.priced?.options.find(o=>o.basis==='contract')?.available)tags.push('CONTRACT');
  if(line.added_by==='rep')tags.push('ADDED');
  if(line.added_by==='upsell')tags.push('SUGGESTED');
  // The customer added it from the item pop-up's "Frequently bought together" (task E1).
  if(line.added_by==='suggestion')tags.push('CHAT SUGGESTION');
  return tags;
}

function useFocusWhen(when:boolean,ref:RefObject<HTMLInputElement|null>,done?:()=>void){
  useEffect(()=>{
    if(!when||!ref.current)return;
    ref.current.focus();ref.current.select();
    done?.();
  },[when,ref,done]);
}

/**
 * The "?" beside the price source: hover, focus or tap lists why Querent suggests its price
 * (priceReasons: the deciding fact, every other fact checked, the GP), what that price's margin is
 * against the rep's floor, and the rep's own price when it differs.
 */
function PriceReasons({line,priced,floorLabel}:{line:DetailLine;priced:NonNullable<LineFigures['priced']>;floorLabel:string}){
  const pick=priced.suggestion;
  if(pick.price===null||pick.basis===null)return null;
  const offPick=line.price_basis!==pick.basis||line.unit_price!==pick.price;
  return <InfoTip icon="help" size="sm" label={`Why Querent suggests ${money(pick.price)} for ${line.sku}`} buttonClassName={s.helpButton} glyph={<span className={s.help}>?</span>}>
    <span className={t.tipHead}>Querent’s pick: {money(pick.price)} ({BASIS_LABELS[pick.basis]})</span>
    {priced.reasons.map(reason=><span key={reason} className={t.tipLine}>• {reason}</span>)}
    {pick.margin!==null&&<span className={t.tipFoot}>{formatMargin(pick.margin)} margin at this price, {pick.belowFloor?'below':'at or above'} {floorLabel}.</span>}
    {offPick&&line.unit_price!==null&&<span className={t.tipFoot}>You priced it at {line.price_basis?BASIS_LABELS[line.price_basis]:'Custom'}, {money(line.unit_price)}.</span>}
  </InfoTip>;
}

/** "Freight recovery +$2.40 (rate 5.0%, ramp step 2 of 3)": the line's recovery per unit at the quote's frozen rate (spec §4.6). */
export function recoveryText(recoveryCents:number,{rateBp,step,steps}:QuoteRecovery){
  const ramp=step!==null&&steps!==null?`, ramp step ${step} of ${steps}`:'';
  return `Freight recovery +${money(fromCents(recoveryCents))} (rate ${formatRateBp(rateBp)}${ramp})`;
}

/** Line details (C_QE9): Why this price? with what the customer asked for, Price options with Use, and Stock by branch. */
function LineDetails({id,name,line,figures,floorLabel,recovery,customerFirstName,asOf,editable,onUse}:{id:string;name:string;line:DetailLine;figures:LineFigures;floorLabel:string;
  recovery:QuoteRecovery|null;customerFirstName:string;asOf:string;editable:boolean;onUse:(basis:PriceBasis)=>void}){
  const {priced,stock,lastPaid}=figures;
  const pick=priced?.suggestion;
  const offPick=pick&&pick.basis!==null&&(line.price_basis!==pick.basis||line.unit_price!==pick.price);
  const branches=line.pricing?.stock?.branches??[];
  return <div id={id} role="region" aria-label={`Line details for ${name}`} className={s.lineDetails}>
    <div>
      <div className={s.dHead}>Why this price?</div>
      <div className={s.dText}>{priced?priced.explanation:'No price facts on file for this item. Price it by hand.'}</div>
      {offPick&&line.unit_price!==null&&<div className={s.dNote}>{`You priced it at ${line.price_basis?BASIS_LABELS[line.price_basis]:'Custom'}, ${money(line.unit_price)}.`}</div>}
      <div className={s.dNote}>{`${floorLabel}.${lastPaid?` Last paid ${money(lastPaid.price)} on ${day(lastPaid.date,asOf)}.`:''}`}</div>
      {recovery&&line.freight_recovery>0&&<div className={s.dNote}>{recoveryText(line.freight_recovery,recovery)}</div>}
      {line.requested_text&&<div className={s.dAsked}>
        <div className={s.dHead}>{`What ${customerFirstName} asked for`}</div>
        <div className={s.dText}>{`"${line.requested_text}"`}</div>
      </div>}
    </div>
    <div>
      <div className={s.dHead}>Price options</div>
      {priced?<>
        <div className={`${s.optGrid} ${s.dTh}`}><span>Basis</span><span>Price</span><span>Margin</span><span/></div>
        {priced.options.filter(o=>o.price!==null&&o.basis!=='custom').map(o=>{
          const current=line.price_basis===o.basis&&line.unit_price===o.price;
          return <div key={o.basis} className={`${s.optGrid} ${s.dRow}`} data-strong={current||undefined}>
            <span>{o.label}</span><span className={s.num}>{money(o.price)}</span><span className={s.num}>{formatMargin(margin(o.price,line.unit_cost))}</span>
            {editable?<button type="button" className={s.use} disabled={current} onClick={()=>onUse(o.basis)}
              aria-label={current?`${o.label} is the current price`:`Use ${o.label} for ${line.sku}`}>{current?'Current':'Use'}</button>:<span/>}
          </div>;
        })}
      </>:<div className={s.dText}>None on file.</div>}
    </div>
    <div>
      <div className={s.dHead}>Stock by branch</div>
      {branches.length?<>
        <div className={`${s.stockGrid} ${s.dTh}`}><span>Branch</span><span className={s.nowrap}>On hand</span><span className={s.nowrap}>On order</span></div>
        {branches.map(b=><div key={b.branch_id} className={`${s.stockGrid} ${s.dRow}`} data-strong={b.branch_code===stock.branchCode||undefined}>
          <span>{b.branch_code}</span><span>{b.available}</span>
          <span className={s.muted}>{b.on_order?`${b.on_order}${b.next_receipt_on?`, due ${day(b.next_receipt_on,asOf)}`:''}`:'-'}</span>
        </div>)}
      </>:<div className={s.dText}>No stock on file.</div>}
    </div>
  </div>;
}
