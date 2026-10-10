'use client';
import {useEffect,useRef,type RefObject} from 'react';
import {ChevronRight,X} from 'lucide-react';
import type {PriceBasis} from '@/domain';
import {formatMargin,margin,type FloorContext} from '@/server/floors';
import {BASIS_LABELS} from '@/server/pricing';
import {lineFigures,parseMoney,parseQty,priceForMargin,shortName,type DetailLine,type LineFigures} from '@/server/rep/quote-math';
import {CONFIDENCE} from '@/server/matching/score';
import {InfoTip} from '../InfoTip';
import t from '../InfoTip.module.css';
import {NumberField} from './NumberField';
import {PriceBasisSelect} from './PriceBasisSelect';
import {day,money,priceInput} from './format';
import type {QuoteEditor} from './use-quote-editor';
import s from './QuoteDetail.module.css';

// The line grid (spec §4, docs/design/screens/03-04; task 3.3): item with SKU and pack, qty,
// available at the quote branch, cost (Show cost), the unit price with its price-basis dropdown,
// margin, total and remove. A line below floor[rep][category] gets the red warning directly
// above its price field (never blocking); each line has a collapsed "Why this price?" row, and a
// "?" next to the price-basis dropdown whose tip lists why Querent suggests its price.

export interface LineGridProps {
  lines:readonly DetailLine[];
  editor:Pick<QuoteEditor,'draft'|'edit'|'remove'>;
  floor:FloorContext;
  /** The customer's first name, for "What Dana asked for". */
  customerFirstName:string;
  asOf:string;
  showCost:boolean;
  editable:boolean;
  /** Lines whose "Why this price?" row is open. */
  open:ReadonlySet<string>;
  onToggle:(lineId:string)=>void;
  /** An added line whose qty field should take focus. */
  focusLineId?:string|null;
  onFocused?:()=>void;
}

export const qtyFieldId=(lineId:string)=>`qty-${lineId}`;
export const lineRowId=(lineId:string)=>`line-${lineId}`;

export function LineGrid({lines,showCost,...props}:LineGridProps){
  const columns=showCost?9:8;
  return <div className={s.tableWrap}>
    <table className={s.lines} data-show-cost={showCost||undefined}>
      <caption className={s.srOnly}>Quote lines</caption>
      <thead>
        <tr>
          <th scope="col" className={s.expCol}><span className={s.srOnly}>Why this price?</span></th>
          <th scope="col" className={s.itemCol}>Item</th>
          <th scope="col">Qty</th>
          <th scope="col">Available</th>
          {showCost&&<th scope="col">Cost</th>}
          <th scope="col">Unit price</th>
          <th scope="col">Margin</th>
          <th scope="col">Total</th>
          <th scope="col" className={s.rmCol}><span className={s.srOnly}>Remove</span></th>
        </tr>
      </thead>
      {lines.map(line=><LineRow key={line.id} line={line} showCost={showCost} columns={columns} {...props}/>)}
      {!lines.length&&<tbody><tr><td colSpan={columns} className={s.noLines}>
        {props.editable?'No items on this quote. Add one above, or undo.':'No items on this quote.'}
      </td></tr></tbody>}
    </table>
  </div>;
}

function LineRow({line,editor,floor,customerFirstName,asOf,showCost,editable,open,onToggle,focusLineId,onFocused,columns}:Omit<LineGridProps,'lines'>&{line:DetailLine;columns:number}){
  const figures=lineFigures(line,floor);
  const name=shortName(line.description);
  const isOpen=open.has(line.id);
  const whyId=`why-${line.id}`,warnId=`floor-${line.id}`;
  const qtyRef=useRef<HTMLInputElement>(null),priceRef=useRef<HTMLInputElement>(null);
  useFocusWhen(focusLineId===line.id,qtyRef,onFocused);
  const {floor:status,stock,priced}=figures;
  const low=status.belowFloor;
  const tags=lineTags(line,figures);
  const floorLabel=`${firstName(floor.repName)}’s ${status.floorPct}% ${line.category_name} floor`;

  function pickBasis(basis:PriceBasis){
    editor.edit(line.id,{basis});
    if(basis==='custom')requestAnimationFrame(()=>{priceRef.current?.focus();priceRef.current?.select();});
  }

  return <tbody className={s.line} id={lineRowId(line.id)} data-open={isOpen||undefined} data-low={low||undefined}>
    <tr>
      <td className={s.expCol}>
        <button type="button" className={s.exp} aria-expanded={isOpen} aria-controls={whyId} title="Why this price?"
          aria-label={`Why this price? ${name}`} onClick={()=>onToggle(line.id)}><ChevronRight aria-hidden="true" size={14} strokeWidth={2}/></button>
      </td>
      <th scope="row" className={s.itemCol}>
        <span className={s.desc}>{line.description}</span>
        <span className={s.ititle}>
          <span className={s.sku}>{line.sku}</span><span className={s.pack}>{line.pack}</span>
          {tags.map(t=><span key={t.label} className={s.tag} data-tone={t.tone}>{t.label}</span>)}
        </span>
      </th>
      <td className={s.qtyCell} data-label="Qty">
        <NumberField ref={qtyRef} id={qtyFieldId(line.id)} className={`${s.cin} ${s.qty}`} value={String(line.qty)} parse={parseQty} disabled={!editable}
          aria-label={`Quantity for ${line.sku}`} onDraft={qty=>editor.draft(line.id,qty===null?null:{qty})} onCommit={(qty,session)=>editor.edit(line.id,{qty},session)}/>
      </td>
      <td className={s.avail} data-label="Available">
        {stock.available===null?<span className={s.muted}>—</span>:<>
          <span className={s.dot} data-short={stock.short>0||undefined} aria-hidden="true"/>{stock.available} at {stock.branchCode}
          {stock.short>0&&<small className={s.short}>Short {stock.short}</small>}
        </>}
      </td>
      {showCost&&<td className={s.num} data-label="Cost">{money(line.unit_cost)}</td>}
      <td className={s.priceCell} data-label="Unit price">
        {status.label&&<p className={s.floorWarn} id={warnId} role="note">{status.label}</p>}
        <span className={s.cwrap}>$<NumberField ref={priceRef} className={s.cin} data-low={low||undefined} value={priceInput(line.unit_price)} parse={parseMoney}
          disabled={!editable} placeholder="0.00" aria-label={`Unit price for ${line.sku}`} aria-describedby={status.label?warnId:undefined}
          onDraft={price=>editor.draft(line.id,price===null?null:{unitPrice:price})} onCommit={(unitPrice,session)=>editor.edit(line.id,{unitPrice},session)}/></span>
        {priced&&<div className={s.pickRow}>
          <PriceBasisSelect options={priced.options} value={line.price_basis} onChange={pickBasis} label={`Price basis for ${line.sku}`} disabled={!editable} asOf={asOf}/>
          <PriceReasons line={line} priced={priced} floorLabel={floorLabel}/>
        </div>}
      </td>
      <td className={s.marginCell} data-label="Margin">
        <span className={s.cwrap}><NumberField className={`${s.cin} ${s.m}`} data-low={low||undefined} value={figures.margin===null?'':figures.marginLabel.replace('%','')}
          parse={marginText} disabled={!editable||line.unit_cost<=0} aria-label={`Margin for ${line.sku}`} aria-describedby={status.label?warnId:undefined}
          onDraft={pct=>{const price=pct===null?null:priceForMargin(line.unit_cost,pct);editor.draft(line.id,price===null?null:{unitPrice:price});}}
          onCommit={(pct,session)=>{const price=priceForMargin(line.unit_cost,pct);if(price!==null)editor.edit(line.id,{unitPrice:price},session);}}/>%</span>
      </td>
      <td className={`${s.num} ${s.total}`} data-label="Total">{money(figures.total)}</td>
      <td className={s.rmCol}>
        {editable&&<button type="button" className={s.rm} aria-label={`Remove ${name}`} title="Remove item" onClick={()=>editor.remove(line.id)}><X aria-hidden="true" size={15}/></button>}
      </td>
    </tr>
    <tr className={s.why} id={whyId} hidden={!isOpen}>
      <td colSpan={columns}>{isOpen&&<WhyThisPrice line={line} figures={figures} floorLabel={floorLabel}
        customerFirstName={customerFirstName} asOf={asOf} editable={editable} onUse={basis=>editor.edit(line.id,{basis})}/>}</td>
    </tr>
  </tbody>;
}

const firstName=(name:string)=>name.trim().split(/\s+/)[0];

/** A margin the rep typed ("33.0"), in percent, below 100. */
function marginText(text:string){
  const trimmed=text.trim().replace(/%$/,'');
  if(!/^-?\d+(\.\d*)?$|^-?\.\d+$/.test(trimmed))return null;
  const pct=Number(trimmed);
  return pct<100&&pct>-1000?pct:null;
}

function lineTags(line:DetailLine,figures:LineFigures){
  const tags:{label:string;tone:'info'|'warn'}[]=[];
  if(figures.priced?.options.find(o=>o.basis==='contract')?.available)tags.push({label:'Contract',tone:'info'});
  if(line.match_score!==null&&line.match_score<CONFIDENCE.minScore)tags.push({label:'Confirm match',tone:'warn'});
  if(line.added_by==='rep')tags.push({label:'Added',tone:'info'});
  if(line.added_by==='upsell')tags.push({label:'Suggested',tone:'info'});
  // The customer added it from the item pop-up's "Frequently bought together" (task E1).
  if(line.added_by==='suggestion')tags.push({label:'Chat suggestion',tone:'info'});
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
 * The "?" next to the price-basis dropdown: hover, focus or tap lists why Querent suggests its
 * price (priceReasons: the deciding fact, every other fact checked, the GP), what that price's
 * margin is against the rep's floor, and the rep's own price when it differs.
 */
function PriceReasons({line,priced,floorLabel}:{line:DetailLine;priced:NonNullable<LineFigures['priced']>;floorLabel:string}){
  const pick=priced.suggestion;
  if(pick.price===null||pick.basis===null)return null;
  const offPick=line.price_basis!==pick.basis||line.unit_price!==pick.price;
  return <InfoTip icon="help" size="sm" label={`Why Querent suggests ${money(pick.price)} for ${line.sku}`}>
    <span className={t.tipHead}>Querent’s pick: {money(pick.price)} ({BASIS_LABELS[pick.basis]})</span>
    {priced.reasons.map(reason=><span key={reason} className={t.tipLine}>• {reason}</span>)}
    {pick.margin!==null&&<span className={t.tipFoot}>{formatMargin(pick.margin)} margin at this price, {pick.belowFloor?'below':'at or above'} {floorLabel}.</span>}
    {offPick&&line.unit_price!==null&&<span className={t.tipFoot}>You priced it at {line.price_basis?BASIS_LABELS[line.price_basis]:'Custom'}, {money(line.unit_price)}.</span>}
  </InfoTip>;
}

/** The collapsed "Why this price?" row: Querent's explanation, every price option with its margin, stock by branch, and what the customer asked for. */
function WhyThisPrice({line,figures,floorLabel,customerFirstName,asOf,editable,onUse}:{line:DetailLine;figures:LineFigures;floorLabel:string;customerFirstName:string;asOf:string;editable:boolean;onUse:(basis:PriceBasis)=>void}){
  const {priced,stock,lastPaid}=figures;
  const pick=priced?.suggestion;
  const offPick=pick&&pick.basis!==null&&(line.price_basis!==pick.basis||line.unit_price!==pick.price);
  const branches=line.pricing?.stock?.branches??[];
  return <div className={s.whyGrid}>
    <section>
      <h4>Why this price?</h4>
      <p className={s.explain}>{priced?priced.explanation:'No price facts on file for this item. Price it by hand.'}</p>
      {offPick&&line.unit_price!==null&&<p className={s.whyNote}>You priced it at {line.price_basis?BASIS_LABELS[line.price_basis]:'Custom'}, {money(line.unit_price)}.</p>}
      <p className={s.whyNote}>{floorLabel}{lastPaid&&<> · Last paid {money(lastPaid.price)} on {day(lastPaid.date,asOf)}</>}</p>
    </section>
    {priced&&<section className={s.whyTable}>
      <h4>Price options</h4>
      <table className={s.mini}>
        <thead><tr><th scope="col">Basis</th><th scope="col">Price</th><th scope="col">Margin</th><th scope="col"><span className={s.srOnly}>Use</span></th></tr></thead>
        <tbody>{priced.options.filter(o=>o.price!==null).map(o=>{
          const current=line.price_basis===o.basis&&line.unit_price===o.price;
          return <tr key={o.basis} data-suggested={o.suggested||undefined}>
            <td>{o.suggested?<strong>{o.label}</strong>:o.label}</td><td>{money(o.price)}</td><td>{formatMargin(margin(o.price,line.unit_cost))}</td>
            <td>{editable&&o.basis!=='custom'&&<button type="button" className={s.use} disabled={current} onClick={()=>onUse(o.basis)}
              aria-label={current?`${o.label} is the current price`:`Use ${o.label} for ${line.sku}`}>{current?'Current':'Use'}</button>}</td>
          </tr>;
        })}</tbody>
      </table>
    </section>}
    <section className={s.whyTable}>
      <h4>Stock by branch</h4>
      {branches.length?<table className={s.mini}>
        <thead><tr><th scope="col">Branch</th><th scope="col">On hand</th><th scope="col">On order</th></tr></thead>
        <tbody>{branches.map(b=><tr key={b.branch_id} data-here={b.branch_code===stock.branchCode||undefined}>
          <td>{b.branch_code===stock.branchCode?<strong>{b.branch_code}</strong>:b.branch_code}</td><td>{b.available}</td>
          <td>{b.on_order?`${b.on_order}${b.next_receipt_on?`, due ${day(b.next_receipt_on,asOf)}`:''}`:'—'}</td>
        </tr>)}</tbody>
      </table>:<p className={s.whyNote}>No stock on file.</p>}
    </section>
    {line.requested_text&&<section>
      <h4>What {customerFirstName} asked for</h4>
      <p className={s.explain}>“{line.requested_text}”</p>
    </section>}
  </div>;
}
