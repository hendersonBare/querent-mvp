import type {PriceBasis} from '@/domain';
import {formatFloor,formatMargin,margin,type LineFloorStatus} from '@/server/floors';
import {BASIS_LABELS} from '@/server/pricing';
import {cents} from '@/server/quotes/snapshot';
import {customerPdfModel,formatAmount,formatDay,formatUnitPrice,type CustomerPdfModel,type PdfContext,type PdfQuote} from './model';

// The internal worksheet's content (task 4.2, spec §6.7): everything the customer PDF prints (its
// model is the frame), plus the rep's picture of each line (cost, margin, the floor applied, the
// price basis, last paid, "Why this price?"), the quote's cost and gross profit, the account's
// credit, the internal notes and, on a draft, what still blocks the send. Pure: the loader
// (./internal) gathers the facts with the same engines the quote screen uses (priceLine,
// lineFloorStatus), and this only formats them. REP-ONLY: it prints cost and margin, so it must
// never be reachable from the customer's path (./boundary.test.ts).

/** The banner on every page. */
export const CONFIDENTIAL='CONFIDENTIAL — INTERNAL';

/** The rep's facts for one line, in the same order as the source's lines. */
export interface WorksheetLineFacts {
  /** Unit cost, or null when it isn't known. */
  unit_cost:number|null;
  /** 'quote': the cost stored on the quote's line; 'item': the item's current cost (a sent line no longer on the quote). */
  cost_source:'quote'|'item'|null;
  category_name:string|null;
  /** The basis the line's price was set on, or null for an unpriced line. */
  basis:PriceBasis|null;
  /** Querent's pick for the line (the pricing engine's suggestion), or null if it couldn't price it. */
  querent:{basis:PriceBasis|null;price:number|null}|null;
  /** The most recent price paid in the 12 months to the pricing day. */
  last_paid:{price:number;date:string}|null;
  /** Querent's "Why this price?" note. */
  why:string|null;
  /** Margin against floor[quote rep][category] (lineFloorStatus), or null when the category is unknown. */
  floor:LineFloorStatus|null;
}

export interface WorksheetAccount {terms:string|null;credit_limit:number|null;open_balance:number|null;past_due_balance:number|null}
export interface WorksheetNote {rep_name:string;body:string;created_at:string}

export interface WorksheetFacts {
  /** When the worksheet was made (ISO). Floors, credit and notes are as of then. */
  asOf:string;
  lines:readonly WorksheetLineFacts[];
  account:WorksheetAccount|null;
  notes:readonly WorksheetNote[];
  /** A draft's send blockers (empty: ready to send); null for a sent revision. */
  blockers:readonly string[]|null;
}

export interface WorksheetLine {
  no:string;sku:string;description:string;unit:string;qty:string;unitPrice:string;extended:string;
  category:string|null;basis:string;cost:string;margin:string;floor:string;
  belowFloor:boolean;
  /** The red warning of the quote screen: "Below Brandi's 30% Safety & PPE floor". */
  warning:string|null;
  /** Querent's pick, last paid, and a default floor, one sentence each. */
  facts:string[];
  why:string|null;
}

export interface WorksheetModel {
  /** Everything the customer PDF prints. */
  frame:CustomerPdfModel;
  title:string;filename:string;
  banner:{title:string;note:string};
  stamps:string[];
  lines:WorksheetLine[];
  /** Cost of goods, gross profit, margin and lines below floor, under the customer totals. */
  profit:{label:string;value:string}[];
  /** Open balance and credit use, or null without an account. */
  credit:{rows:{label:string;value:string}[];warning:string|null}|null;
  notes:{meta:string;body:string}[];
  /** Draft only: what blocks Approve & send, and the below-floor warning. */
  checks:string[]|null;
  /** Where each number comes from and as of when. */
  asOf:string;
  footer:{left:string;middle:string};
}

const NONE='—';
const moment=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit',timeZone:'UTC'});
/** "Sep 23, 2026, 5:00 PM UTC" */
export const formatMoment=(iso:string)=>`${moment.format(new Date(iso))} UTC`;
/** Credit use in whole percent, as the quote screen's credit bar labels it ("39%"). */
const wholePercent=(fraction:number)=>`${Math.round(fraction*100)}%`;

export interface CreditUse {
  /** open balance / credit limit */
  used:number;
  /** (open balance + this quote) / credit limit */
  withQuote:number;
  /** How far this quote takes the account past its limit (0 when it doesn't). A warning only. */
  overBy:number;
}

/** The credit bar's numbers (spec §4). Null without a positive credit limit. A missing open balance counts as $0. */
export function creditUse(limit:number|null,openBalance:number|null,quoteTotal:number):CreditUse|null{
  if(limit===null||!Number.isFinite(limit)||limit<=0)return null;
  const open=openBalance!==null&&Number.isFinite(openBalance)?openBalance:0;
  const withQuote=cents(open+quoteTotal);
  return {used:open/limit,withQuote:withQuote/limit,overBy:Math.max(0,cents(withQuote-limit))};
}

function lineFacts(price:number|null,f:WorksheetLineFacts):string[]{
  const out:string[]=[];
  const q=f.querent;
  if(q&&q.price!==null&&q.basis){
    out.push(price!==null&&f.basis===q.basis&&cents(price)===cents(q.price)?'Querent\'s pick.':`Querent suggested ${BASIS_LABELS[q.basis]} ${formatUnitPrice(q.price)}.`);
  }
  out.push(f.last_paid?`Last paid ${formatUnitPrice(f.last_paid.price)} on ${formatDay(f.last_paid.date)}.`:'Last paid: none in the last 12 months.');
  if(f.floor?.floorSource==='default')out.push(`No floor set for ${f.category_name??'this category'}: the ${formatFloor(f.floor.floor)} default applies.`);
  return out;
}

/**
 * Formats a quote for the internal worksheet: the customer PDF's model (customerPdfModel) as the
 * frame, and the rep's facts per line and for the quote. `facts.lines` follows `q.lines`.
 */
export function worksheetModel(q:PdfQuote,ctx:PdfContext,facts:WorksheetFacts):WorksheetModel{
  if(facts.lines.length!==q.lines.length)throw new RangeError(`Worksheet facts cover ${facts.lines.length} lines, the quote has ${q.lines.length}.`);
  const frame=customerPdfModel(q,ctx);
  const ref=`${q.quote_number} rev ${q.revision}`;

  // Profit covers the priced lines with a known cost (an unpriced line has no margin yet).
  let items=0,cost=0,below=0,currentCost=false;
  const lines=q.lines.map((l,i):WorksheetLine=>{
    const f=facts.lines[i],shown=frame.lines[i];
    const fraction=f.floor?.margin??margin(l.unit_price,f.unit_cost);
    if(l.unit_price!==null&&f.unit_cost!==null){items+=l.total??0;cost+=l.qty*f.unit_cost;}
    const belowFloor=!!f.floor?.belowFloor;
    if(belowFloor)below++;
    if(f.cost_source==='item')currentCost=true;
    return {...shown,category:f.category_name,basis:f.basis?BASIS_LABELS[f.basis]:NONE,
      cost:f.unit_cost===null?NONE:`${formatUnitPrice(f.unit_cost)}${f.cost_source==='item'?'*':''}`,
      margin:formatMargin(fraction),floor:f.floor?formatFloor(f.floor.floor):NONE,belowFloor,warning:f.floor?.label??null,
      facts:lineFacts(l.unit_price,f),why:f.why};
  });
  items=cents(items);cost=cents(cost);

  const profit=[
    {label:'Cost of goods',value:formatAmount(cost)},
    {label:'Gross profit',value:formatAmount(cents(items-cost))},
    {label:'Margin',value:formatMargin(margin(items,cost))},
    {label:'Below floor',value:below?`${below} of ${q.lines.length} line${q.lines.length===1?'':'s'}`:'None'},
  ];

  let credit:WorksheetModel['credit']=null;
  if(facts.account){
    const a=facts.account;
    const use=creditUse(a.credit_limit,a.open_balance,q.total??q.subtotal);
    credit={rows:[
      {label:'Credit limit',value:a.credit_limit===null?'None on file':formatAmount(a.credit_limit)},
      {label:'Open balance',value:a.open_balance===null?NONE:formatAmount(a.open_balance)},
      {label:'Past due',value:a.past_due_balance===null?NONE:formatAmount(a.past_due_balance)},
      ...(use?[{label:'Credit used',value:wholePercent(use.used)},{label:'Credit used, with this quote',value:wholePercent(use.withQuote)}]:[]),
    ],warning:use&&use.overBy>0?`Over limit by ${formatAmount(use.overBy)}`:null};
  }

  const checks=facts.blockers===null?null:[
    ...(facts.blockers.length?facts.blockers:['Nothing blocks the send.']),
    ...(below?[`${below} line${below===1?' is':'s are'} below floor: a warning only.`]:[]),
  ];

  const asOf=q.draft
    ?`Live draft as of ${formatMoment(facts.asOf)}, not sent yet. Cost is the unit cost on the quote's lines; floors, credit and internal notes are current.`
    :`${ref} as sent on ${formatDay(q.date)}: quantities, prices and totals are the frozen revision the customer received. Cost is the unit cost recorded on the quote's lines`
      +`${currentCost?' (* the item\'s current cost, for a line no longer on the quote)':''}. Why this price? and last paid are as of the send date. `
      +`Floors, credit and internal notes are as of ${formatMoment(facts.asOf)}.`;

  return {
    frame,
    title:`Internal worksheet ${ref}${q.draft?' (draft)':''}`,
    filename:frame.filename.replace(/\.pdf$/,' - internal worksheet.pdf'),
    banner:{title:CONFIDENTIAL,note:'Cost and margin. Do not send to the customer.'},
    stamps:[q.draft?'Draft · not sent':`As sent ${formatDay(q.date)}`,frame.footer.sample],
    lines,profit,credit,
    notes:facts.notes.map(n=>({meta:`${n.rep_name} · ${formatMoment(n.created_at)}`,body:n.body.trim()})).filter(n=>n.body),
    checks,asOf,
    footer:{left:`${frame.footer.left} · Confidential, internal`,middle:frame.footer.via},
  };
}
