import type {DeliveryRates,QuoteHeader,QuoteLine,PriceBasis} from '@/domain';
import {formatFloor,formatMargin,isBelowFloor,lineFloorStatus,margin,resolveFloor,type FloorContext,type LineFloorStatus} from '@/server/floors';
import {CALL_FOR_FREIGHT,priceDelivery,type QuoteFreight} from '@/server/freight/engine';
import {CONFIDENCE} from '@/server/matching/score';
import {explainQuoteGp,priceLine,querentFoundGp,type PriceOption,type PricedLine,type PricingInput} from '@/server/pricing';
import {cents,sendBlockers,type SendCheckQuote} from '@/server/quotes';

// The rep's quote detail (spec §4, §5.1, §5.2; task 3.3): the math behind the line grid, the
// totals and the summary card. Pure and client-safe (no server-only imports): the server uses it
// to apply an edit, and the page re-runs the same functions as the rep types, so what the grid
// shows before a save is what the save stores.
//
// - Each line carries the facts the pricing engine needs (`pricing`), so the price-basis dropdown,
//   Querent's bold pick and "Why this price?" follow the qty live (priceLine, task 1.1).
// - The red warning and the margin shown come from the floor rules (lineFloorStatus and
//   formatMargin, task 1.2), so the number on screen always agrees with the warning.
// - Money is rounded to the cent (quotes' cents()), as the send snapshot totals it.

/** Everything priceLine needs for one line except its qty, which the rep edits. */
export type LinePricing=Omit<PricingInput,'qty'>;
/** A quote line as the detail page edits it: the stored line plus its pricing facts (null if the item has none). */
export type DetailLine=QuoteLine&{pricing:LinePricing|null};

/** The largest qty the grid accepts. */
export const MAX_QTY=100_000;
/** The largest unit price the grid accepts, in dollars. */
export const MAX_PRICE=1_000_000;

/** An item's name before its first comma: "Hex cap screw 1/2-13 x 2 in". */
export const shortName=(description:string)=>description.split(',')[0].trim();

/** A whole qty from 0 to MAX_QTY, or null. */
export function parseQty(text:string):number|null{
  const trimmed=text.trim();
  if(!/^\d+$/.test(trimmed))return null;
  const qty=Number(trimmed);
  return qty<=MAX_QTY?qty:null;
}

/** Dollars from what the rep typed ("$1,109.5"), rounded to the cent, from $0 to MAX_PRICE; or null. */
export function parseMoney(text:string):number|null{
  const trimmed=text.trim().replace(/^\$/,'').replace(/,/g,'');
  if(!/^\d+(\.\d*)?$|^\.\d+$/.test(trimmed))return null;
  const amount=cents(Number(trimmed));
  return Number.isFinite(amount)&&amount<=MAX_PRICE?amount:null;
}

// ---- One line ----

/** Querent's pricing at the line's current qty: the dropdown's options, its pick and "Why this price?". null without price facts. */
export function linePricing(line:Pick<DetailLine,'qty'|'pricing'>):PricedLine|null{
  return line.pricing?priceLine({...line.pricing,qty:line.qty}):null;
}

/** One option of the line's price-basis dropdown, at its current qty. */
export const optionFor=(line:DetailLine,basis:PriceBasis):PriceOption|undefined=>linePricing(line)?.options.find(o=>o.basis===basis);

/** The line is priced at Querent's pick (it hasn't been overridden), so a qty change may move its price with the pick. */
export const onQuerentPick=(line:Pick<QuoteLine,'unit_price'|'price_basis'|'suggested_price'|'suggested_basis'>)=>
  line.price_basis!==null&&line.price_basis===line.suggested_basis&&line.unit_price!==null&&line.unit_price===line.suggested_price;

/** Stores Querent's current pick in the line's suggestion fields (kept for "Querent found" and the exports). */
function withSuggestion(line:DetailLine,priced:PricedLine|null):DetailLine{
  if(!priced)return line;
  const {suggestion,explanation}=priced;
  return {...line,suggested_price:suggestion.price,suggested_basis:suggestion.basis,customer_price:suggestion.customerPrice,explanation};
}

/**
 * The line at a new qty. Querent re-picks for it (a broken case moves the pick to customer + 10%, spec
 * §5.1). A line priced at Querent's pick follows the new pick; a price the rep chose stays, and
 * only the bold option in the dropdown moves.
 */
export function withQty(line:DetailLine,qty:number):DetailLine{
  const next={...line,qty};
  const priced=linePricing(next);
  const updated=withSuggestion(next,priced);
  if(onQuerentPick(line)&&priced?.suggestion.price!=null)return {...updated,unit_price:priced.suggestion.price,price_basis:priced.suggestion.basis};
  return updated;
}

/**
 * The line priced on `basis`: that option's price. Custom keeps the line's price (or takes
 * Querent's custom price, when it suggested one). null when the basis has no price for this line.
 */
export function withBasis(line:DetailLine,basis:PriceBasis):DetailLine|null{
  const option=optionFor(line,basis);
  if(basis==='custom'){
    if(line.price_basis==='custom')return line;
    return {...line,price_basis:'custom',unit_price:option?.price??line.unit_price};
  }
  if(!option||option.price===null)return null;
  return {...line,unit_price:option.price,price_basis:basis};
}

/** A price the rep typed, to the cent: Custom, unless it is exactly the price of the basis the line is already on. */
export function withPrice(line:DetailLine,price:number):DetailLine{
  const rounded=cents(price);
  const current=line.price_basis&&line.price_basis!=='custom'?optionFor(line,line.price_basis):undefined;
  return {...line,unit_price:rounded,price_basis:current?.price===rounded?line.price_basis:'custom'};
}

/** One edit to a line, as the page autosaves it: a qty, a price basis, a typed price (null clears it). A price alone is Custom. */
export interface LinePatch {qty?:number;basis?:PriceBasis;unitPrice?:number|null}

/**
 * The line after `patch`: the qty first (Querent re-picks for it), then the basis or the typed
 * price. null when the patch picks a basis that has no price for this line. The server applies
 * edits with this, and the page shows them with it before the save comes back.
 */
export function applyPatch(line:DetailLine,patch:LinePatch):DetailLine|null{
  let next=patch.qty===undefined?line:withQty(line,patch.qty);
  if(patch.basis!==undefined&&patch.basis!=='custom'){
    const onBasis=withBasis(next,patch.basis);
    if(!onBasis)return null;
    next=onBasis;
  }else if(patch.unitPrice===null){
    next={...next,unit_price:null,price_basis:null};
  }else if(patch.unitPrice!==undefined){
    next=withPrice(next,patch.unitPrice);
    if(patch.basis==='custom')next={...next,price_basis:'custom'};
  }else if(patch.basis==='custom'){
    next=withBasis(next,'custom')!;
  }
  return next;
}

/** The patch that takes `after` back to `before` (Undo): the old qty and the old price on its basis. */
export function inversePatch(before:DetailLine,after:DetailLine):LinePatch{
  const patch:LinePatch={};
  if(after.qty!==before.qty)patch.qty=before.qty;
  if(after.unit_price!==before.unit_price||after.price_basis!==before.price_basis||patch.qty!==undefined){
    if(before.unit_price===null)patch.unitPrice=null;
    else if(before.price_basis===null||before.price_basis==='custom')Object.assign(patch,{basis:'custom',unitPrice:before.unit_price});
    else patch.basis=before.price_basis;
  }
  return patch;
}

/** The unit price that earns `percent` margin on `cost` (33 -> cost / 0.67), to the cent; null for 100% or more. */
export function priceForMargin(cost:number,percent:number):number|null{
  if(!Number.isFinite(percent)||percent>=100)return null;
  const price=cost/(1-percent/100);
  return Number.isFinite(price)&&price>=0?cents(price):null;
}

export interface LineStock {
  /** The quote branch. */
  branchCode:string;
  /** On hand there, or null when stock is unknown. */
  available:number|null;
  /** qty - available, when positive. */
  short:number;
  /** Other branches with stock, in branch order. */
  others:{code:string;available:number}[];
  /** On order at the quote branch, and when it is due. */
  onOrder:number;nextReceipt:string|null;
}

export interface LineFigures {
  priced:PricedLine|null;
  /** qty x unit price to the cent, or null while unpriced. */
  total:number|null;
  margin:number|null;
  /** The margin as the portal prints it (formatMargin): "26.6%", or "—". */
  marginLabel:string;
  /** floor[quote rep][category] and the red warning (task 1.2). */
  floor:LineFloorStatus;
  stock:LineStock;
  /** What the customer last paid (last 12 months), or null. */
  lastPaid:{price:number;date:string}|null;
}

function lineStock(line:DetailLine):LineStock{
  const branchId=line.pricing?.branchId,branches=line.pricing?.stock?.branches??[];
  const here=branches.find(b=>b.branch_id===branchId);
  const available=here?.available??(line.pricing?.stock?0:null);
  return {branchCode:here?.branch_code??'',available,short:available===null?0:Math.max(0,line.qty-available),
    others:branches.filter(b=>b.branch_id!==branchId&&b.available>0).map(b=>({code:b.branch_code,available:b.available})),
    onOrder:here?.on_order??0,nextReceipt:here?.next_receipt_on??null};
}

/** What the grid shows for one line: its total, margin and floor warning, Querent's pricing, stock and last paid. */
export function lineFigures(line:DetailLine,floor:FloorContext):LineFigures{
  const priced=linePricing(line);
  const status=lineFloorStatus(line,floor);
  const last=line.pricing?.sources.last_paid;
  return {priced,total:line.unit_price===null?null:cents(line.qty*line.unit_price),margin:status.margin,marginLabel:formatMargin(status.margin),floor:status,
    stock:lineStock(line),lastPaid:last?{price:last.unit_price,date:last.order_date}:null};
}

// ---- The quote ----

/** The margin bar's full width: 50% margin (the mockup's scale). */
export const BAR_MAX_MARGIN=0.5;

export interface BlendedFloor {
  /**
   * The quote-level floor marker: each priced line's floor[rep][category], weighted by the line's
   * total. The quote margin is at or above it exactly when the quote earns at least the GP it
   * would if every line sat on its own floor. null with nothing priced.
   */
  value:number|null;
  /** Every priced line has the same floor, so the marker is simply that floor. */
  uniform:boolean;
  /** "23.8%", "20%" (formatFloor), or "—". */
  label:string;
}

const priced=(lines:readonly DetailLine[])=>lines.filter((l):l is DetailLine&{unit_price:number}=>l.unit_price!==null&&Number.isFinite(l.unit_price));

/** The revenue-weighted floor of the priced lines (see BlendedFloor). */
export function blendedFloor(lines:readonly DetailLine[],{repId,floors}:FloorContext):BlendedFloor{
  const weighted=priced(lines).map(l=>({total:cents(l.qty*l.unit_price),floor:resolveFloor(floors,repId,l.category_id).floor})).filter(w=>w.total>0);
  const revenue=weighted.reduce((sum,w)=>sum+w.total,0);
  if(!revenue)return {value:null,uniform:true,label:'—'};
  const value=weighted.reduce((sum,w)=>sum+w.floor*w.total,0)/revenue;
  const uniform=weighted.every(w=>w.floor===weighted[0].floor);
  return {value:uniform?weighted[0].floor:value,uniform,label:formatFloor(uniform?weighted[0].floor:value)};
}

/**
 * Freight as the totals show it before the next save: the rep's override; else the server's
 * distance price re-run on the live subtotal (so crossing the free-delivery threshold shows at
 * once); else the server's computed freight (will call, call for freight).
 */
export function liveFreight(freight:QuoteFreight,subtotal:number,rates:DeliveryRates,origin:string):number|typeof CALL_FOR_FREIGHT{
  if(freight.override)return freight.override.amount;
  const {computed}=freight;
  if(computed.miles!==null&&(computed.rule==='distance'||computed.rule==='min_charge'||computed.rule==='free_threshold'))
    return priceDelivery({origin,miles:computed.miles,subtotal,rates}).amount;
  return computed.amount;
}

function freightLabel(freight:QuoteFreight){
  if(freight.override)return 'Freight (set by rep)';
  const {rule,miles}=freight.computed;
  if(rule==='will_call')return 'Freight (will call)';
  return miles===null?'Freight':`Freight (${miles.toFixed(1)} mi)`;
}

export interface QuoteFigures {
  /** Items: the priced lines, to the cent. */
  items:number;
  /** Cost of the priced lines. */
  cost:number;gp:number;
  /** (items - cost) / items (spec §5.2), or null with no items. */
  margin:number|null;marginLabel:string;
  freight:{amount:number|null;callForFreight:boolean;label:string};
  /** items + freight, or null while freight is call for freight. */
  total:number|null;
  floor:BlendedFloor;
  /** The quote margin is under the blended floor. */
  belowFloor:boolean;
  /** The margin bar: the fill and the floor marker, in percent of its width. */
  bar:{width:number;marker:number|null};
  /** "+$X vs. what they paid last time": (price - last paid) x qty over lines with a last-paid price; null when none has one. */
  lift:number|null;
  /** "Querent found +$Y GP" (spec §5.1 rule 4), at the current qtys. */
  querentFound:number;querentFoundLabel:string;
  belowFloorLines:number;
}

export interface QuoteFiguresInput {
  /** The server's freight for the quote (task 1.3). */
  freight:QuoteFreight;
  rates:DeliveryRates;
  /** The quote branch: the freight origin. */
  branchCode:string;
  floor:FloorContext;
}

const percentOfBar=(fraction:number)=>Math.max(0,Math.min(100,fraction/BAR_MAX_MARGIN*100));

/** The totals and the summary card for the lines as they stand. */
export function quoteFigures(lines:readonly DetailLine[],{freight,rates,branchCode,floor}:QuoteFiguresInput):QuoteFigures{
  const onPrice=priced(lines);
  const items=cents(onPrice.reduce((sum,l)=>sum+cents(l.qty*l.unit_price),0));
  const cost=cents(onPrice.reduce((sum,l)=>sum+l.qty*l.unit_cost,0));
  const quoteMargin=margin(items,cost);
  const freightAmount=liveFreight(freight,items,rates,branchCode);
  const callForFreight=freightAmount===CALL_FOR_FREIGHT;
  const blended=blendedFloor(lines,floor);
  const belowFloor=quoteMargin!==null&&blended.value!==null&&isBelowFloor(quoteMargin,blended.value);
  const withLastPaid=onPrice.filter(l=>l.pricing?.sources.last_paid);
  const lift=withLastPaid.length?cents(withLastPaid.reduce((sum,l)=>sum+cents((l.unit_price-l.pricing!.sources.last_paid!.unit_price)*l.qty),0)):null;
  const picks=lines.flatMap(l=>{const p=linePricing(l);return p?[{qty:l.qty,suggested_price:p.suggestion.price,suggested_basis:p.suggestion.basis,customer_price:p.suggestion.customerPrice}]:[];});
  return {items,cost,gp:cents(items-cost),margin:quoteMargin,marginLabel:formatMargin(quoteMargin),
    freight:{amount:callForFreight?null:freightAmount,callForFreight,label:freightLabel(freight)},
    total:callForFreight?null:cents(items+freightAmount),floor:blended,belowFloor,
    bar:{width:quoteMargin===null?0:percentOfBar(quoteMargin),marker:blended.value===null?null:percentOfBar(blended.value)},
    lift,querentFound:querentFoundGp(picks),querentFoundLabel:explainQuoteGp(picks),
    belowFloorLines:lines.filter(l=>lineFloorStatus(l,floor).belowFloor).length};
}

// ---- Things to check before sending ----

export type CheckKind='blocker'|'margin'|'stock'|'match';
export interface QuoteCheck {
  kind:CheckKind;
  /** The line to review, or null for the quote. */
  lineId:string|null;
  /** The item's short name, shown in bold; null for a quote-level blocker. */
  subject:string|null;
  text:string;
}

const shortDay=(day:string)=>new Date(`${day}T00:00:00.000Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});

function stockText(stock:LineStock){
  const parts=[`short ${stock.short} at ${stock.branchCode}`];
  if(stock.others.length)parts.push(stock.others.map(o=>`${o.available} at ${o.code}`).join(', '));
  if(stock.onOrder>0)parts.push(`${stock.onOrder} on order at ${stock.branchCode}${stock.nextReceipt?`, due ${shortDay(stock.nextReceipt)}`:''}`);
  return parts.join('. ');
}

/**
 * "Things to check before sending": first what blocks Send (sendBlockers, the rule sendCheck
 * applies, task 1.5), then per line, in order, what only warns: a margin below the floor, stock
 * short at the quote branch, and a SKU match below the confident score (task 1.4).
 */
export function quoteChecks(lines:readonly DetailLine[],quote:Pick<QuoteHeader,'fulfillment'|'ship_to_address'>&Partial<Pick<QuoteHeader,'expires_on'>>,freightUnresolved:boolean,floor:FloorContext,today?:string):QuoteCheck[]{
  const sendQuote:SendCheckQuote={fulfillment:quote.fulfillment,ship_to_address:quote.ship_to_address,expires_on:quote.expires_on,lines};
  const checks:QuoteCheck[]=sendBlockers(sendQuote,{unresolved:freightUnresolved},{today}).map(b=>({kind:'blocker',lineId:b.line_id,subject:null,text:b.message}));
  for(const line of lines){
    const figures=lineFigures(line,floor),subject=shortName(line.description);
    if(figures.floor.label)checks.push({kind:'margin',lineId:line.id,subject,text:`${figures.marginLabel} margin, ${figures.floor.label.replace(/^Below/,'below')}`});
    if(figures.stock.short>0)checks.push({kind:'stock',lineId:line.id,subject,text:stockText(figures.stock)});
    if(line.match_score!==null&&line.match_score<CONFIDENCE.minScore)
      checks.push({kind:'match',lineId:line.id,subject,text:`confirm the match for “${line.requested_text??line.sku}”`});
  }
  return checks;
}
