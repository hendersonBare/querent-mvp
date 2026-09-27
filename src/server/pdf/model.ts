import type {Branch,Fulfillment,QuoteSnapshot,Rep,SnapshotLetterhead,SnapshotRepContact,Supplier} from '@/domain';
import {copyLetterhead,letterheadOf,repContactOf} from '@/server/quotes/snapshot';

// The customer quote PDF's content (task 4.1, spec §6.7). Pure and customer-safe: the types
// below have no field for cost, margin, floors, price basis or Querent's reasoning, and every
// builder copies named fields only. The document (./CustomerQuotePdf) prints this model and
// nothing else, so whatever reaches the PDF must first be added here, on purpose.

/** One line as the customer sees it. Prices are null only on a rep's draft preview (an unpriced line). */
export interface PdfLine {sku:string;description:string;pack:string;qty:number;unit_price:number|null;total:number|null}

/**
 * What a customer quote says: a sent revision's frozen snapshot (fromSnapshot) or, for the rep's
 * preview only, the draft's customer fields (./draft fromDraft).
 */
export interface PdfQuote {
  quote_number:string;revision:number;
  /** The rep's preview of an unsent draft: `revision` is the one a send would store. */
  draft:boolean;
  /** When it was sent (ISO), or now for a draft preview. */
  date:string;
  valid_until:string|null;
  customer:{name:string;account_number:string};contact:string|null;
  /** The rep's name as sent. */
  rep:string;
  customer_po:string|null;customer_note:string|null;
  fulfillment:Fulfillment;
  /** The branch code (SLC): the pickup location and the freight origin. */
  branch:string;
  ship_to:string|null;
  lines:PdfLine[];
  subtotal:number;
  /** Null only on a draft still at call for freight. */
  freight:number|null;
  freight_miles:number|null;
  total:number|null;
  // Frozen at send (spec §5.4), so a sent revision's PDF never changes. Null on snapshots stored
  // before they carried them, and on a draft preview: the PDF then prints the live records (PdfContext).
  terms:string|null;
  rep_contact:SnapshotRepContact|null;
  letterhead:SnapshotLetterhead|null;
}

/** A sent revision as the PDF prints it. `sentAt` dates snapshots stored before they carried sent_at (the seeded history). */
export function fromSnapshot(s:QuoteSnapshot,sentAt:string):PdfQuote{
  return {
    quote_number:s.quote_number,revision:s.revision,draft:false,date:s.sent_at??sentAt,valid_until:s.valid_until??null,
    customer:{name:s.customer.name,account_number:s.customer.account_number},contact:s.contact??null,rep:s.rep,
    customer_po:s.customer_po??null,customer_note:s.customer_note??null,fulfillment:s.fulfillment,branch:s.branch,ship_to:s.ship_to??null,
    lines:s.lines.map(l=>({sku:l.sku,description:l.description,pack:l.pack,qty:l.qty,unit_price:l.unit_price,total:l.total})),
    subtotal:s.subtotal,freight:s.freight,freight_miles:s.freight_miles??null,total:s.total,
    terms:s.terms??null,rep_contact:s.rep_contact?repContactOf(s.rep_contact):null,letterhead:s.letterhead?copyLetterhead(s.letterhead):null,
  };
}

/**
 * The live letterhead and contact records around the quote, all customer-visible seed data. The
 * PDF uses them only where the quote has no frozen value: older snapshots and draft previews.
 */
export interface PdfContext {
  supplier:Pick<Supplier,'name'|'address'|'city'|'state'|'zip'|'phone'|'website'>;
  /** The quote's branch, or null if its code is unknown (then Herrick's main address and phone). */
  branch:Pick<Branch,'code'|'name'|'address'|'city'|'state'|'zip'|'will_call_phone'>|null;
  /** The quote's rep with their contact details. */
  rep:Pick<Rep,'name'|'title'|'phone'|'email'>|null;
  /** The customer's payment terms. */
  terms:string|null;
}

/** The context for a quote from its branch code, looked up in `branches`. */
export function pdfContext(branchCode:string,{branches,...rest}:Omit<PdfContext,'branch'>&{branches:readonly NonNullable<PdfContext['branch']>[]}):PdfContext{
  return {...rest,branch:branches.find(b=>b.code===branchCode)??null};
}

/** Every string the customer PDF prints. */
export interface CustomerPdfModel {
  /** PDF metadata title. */
  title:string;
  /** Download name, e.g. "Herrick Industrial Supply quote Q-24817 rev 1.pdf". */
  filename:string;
  draft:boolean;
  supplier:{name:string;branch:string|null;address:string[];phone:string;website:string|null};
  quote:{number:string;revision:string;date:string;validUntil:string};
  customer:{name:string;attention:string|null;account:string};
  details:{label:string;value:string}[];
  fulfillment:{label:string;lines:string[]};
  lines:{no:string;sku:string;description:string;qty:string;unit:string;unitPrice:string;extended:string}[];
  totals:{label:string;detail:string|null;value:string;strong?:boolean}[];
  note:string|null;
  terms:string[];
  rep:{name:string;title:string|null;phone:string|null;email:string|null};
  footer:{left:string;via:string;sample:string};
}

/** Herrick's standard terms (spec §6.7), when the account has none on file. */
export const DEFAULT_TERMS='Net 30';
const NONE='—';

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
/** Unit prices keep up to 4 decimals (a $0.0825 rivet); amounts are to the cent. */
const unitUsd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4});
const count=new Intl.NumberFormat('en-US');
// Days are UTC, like every date in the app.
const longDay=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const day=(isoOrDay:string|null)=>isoOrDay?longDay.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(isoOrDay)?`${isoOrDay}T00:00:00.000Z`:isoOrDay)):NONE;
const cityLine=(p:{city:string;state:string;zip:string})=>`${p.city}, ${p.state} ${p.zip}`;
const clean=(text:string|null)=>text?.trim()||null;

function freightRow(q:PdfQuote):CustomerPdfModel['totals'][number]{
  const detail=q.fulfillment==='will_call'?`Will call at ${q.branch}`
    :`Delivery from ${q.branch}${q.freight_miles===null?'':`, ${q.freight_miles.toFixed(1)} mi`}`;
  return {label:'Freight',detail,value:q.freight===null?'Call for freight':usd.format(q.freight)};
}

/**
 * Formats a quote for the customer PDF. Adds nothing that isn't in `q` or `ctx`. The quote's
 * frozen terms, rep contact and letterhead win; `ctx` (the live records) fills only what the
 * quote lacks, and Herrick's main address and Net 30 are the last resort.
 */
export function customerPdfModel(q:PdfQuote,ctx:PdfContext):CustomerPdfModel{
  const {supplier}=ctx;
  const head=q.letterhead??(ctx.branch?letterheadOf(supplier,ctx.branch):null);
  const letterhead=head
    ?{supplier:head.supplier,website:head.website,branch:`${head.branch} branch`,lines:[head.address,cityLine(head)],phone:head.phone}
    :{supplier:supplier.name,website:supplier.website||null,branch:null,lines:[supplier.address,cityLine(supplier)],phone:supplier.phone};
  const rep=q.rep_contact??(ctx.rep?repContactOf(ctx.rep):null);
  const ref=`${q.quote_number} rev ${q.revision}`;
  const validUntil=day(q.valid_until);
  const terms=clean(q.terms)??clean(ctx.terms)??DEFAULT_TERMS;
  return {
    title:`Quote ${ref}${q.draft?' (draft preview)':''}`,
    filename:`${letterhead.supplier} quote ${ref}${q.draft?' draft':''}.pdf`,
    draft:q.draft,
    supplier:{name:letterhead.supplier,branch:letterhead.branch,address:letterhead.lines,phone:letterhead.phone,website:letterhead.website},
    quote:{number:q.quote_number,revision:`Rev ${q.revision}`,date:day(q.date),validUntil},
    customer:{name:q.customer.name,attention:q.contact?`Attn: ${q.contact}`:null,account:`Account ${q.customer.account_number}`},
    details:[
      {label:'Quote number',value:ref},
      {label:'Date',value:day(q.date)},
      {label:'Valid until',value:validUntil},
      {label:'Customer PO',value:clean(q.customer_po)??'To be added'},
      {label:'Terms',value:terms},
      {label:'Sales rep',value:q.rep},
    ],
    fulfillment:q.fulfillment==='will_call'
      ?{label:'Will call',lines:[`Pick up at ${letterhead.branch??q.branch}`,letterhead.lines.join(', ')]}
      :{label:'Delivery',lines:['Ship to',clean(q.ship_to)??'Address to be confirmed']},
    lines:q.lines.map((l,i)=>({no:String(i+1),sku:l.sku,description:l.description,qty:count.format(l.qty),unit:l.pack,
      unitPrice:l.unit_price===null?NONE:unitUsd.format(l.unit_price),extended:l.total===null?NONE:usd.format(l.total)})),
    totals:[
      {label:'Subtotal',detail:null,value:usd.format(q.subtotal)},
      freightRow(q),
      {label:'Sales tax',detail:null,value:'Added on invoice'},
      {label:'Total',detail:null,value:q.total===null?'To be confirmed':usd.format(q.total),strong:true},
    ],
    note:clean(q.customer_note),
    terms:[`Payment terms: ${terms}.`,`Prices valid until ${validUntil}, subject to stock at the time of order.`,'Sales tax added on invoice.'],
    rep:{name:rep?.name??q.rep,title:rep?.title??null,phone:rep?.phone??null,email:rep?.email??null},
    footer:{left:`${letterhead.supplier} · Quote ${ref}`,via:'via Querent',sample:'Sample data'},
  };
}
