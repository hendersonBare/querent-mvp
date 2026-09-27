import 'server-only';
import {QUOTE_STATUSES,type CustomerListItem,type QuoteListRow,type QuoteStatus} from '@/domain';
import {formatMargin,margin} from '@/server/floors';
import type {DistanceProvider} from '@/server/freight/distance';
import {canEditDraft,effectiveStatus} from '@/server/quotes';
import {expireOverdueQuotes,sendCheck} from '@/server/quotes/service';
import {customers,markQuoteRead,quote,quoteByNumber,quotes} from '@/server/repository';

// The rep's Quotes list (spec §4, task 3.2): status, customer, requested date, total, margin and
// the unread dot, filtered by status and by the "Viewing" picker. Rep-only: it carries margin,
// so it is served only to the supplier persona (GET /api/rep/quotes, the /rep/quotes page).
//
// Whose quotes: the signed-in rep's (quotes.rep_id), the same rule as the Quotes badge
// (./badges). A quote's rep is the customer's assigned rep when it was requested, and quotes are
// never reassigned (spec §4, §5.2). The picker lists every customer, so picking another rep's
// customer shows no quotes and says whose customer it is (other_rep). This is task 3.2's default,
// flagged for review: the spec doesn't say whether a rep sees colleagues' quotes.

const clock=()=>new Date().toISOString();

/** A ?status= value, or null (every status) for anything that isn't one of the five statuses. */
export function parseStatus(value:string|null|undefined):QuoteStatus|null{
  return (QUOTE_STATUSES as readonly string[]).includes(value??'')?value as QuoteStatus:null;
}

export interface RepQuoteRow {
  id:string;quote_number:string;
  /** The last sent revision (0 = never sent). */
  revision:number;
  customer_id:string;customer_name:string;account_number:string|null;
  /** The status to show now: a sent quote past valid_until reads as expired. */
  status:QuoteStatus;
  requested_at:string;sent_at:string|null;valid_until:string|null;
  /**
   * Dollars. While the rep can still edit the quote (ready_for_review, changes_requested) it is
   * the live draft: priced lines plus freight, as Approve & send would total it. Otherwise it is
   * the last sent revision's total, what the customer saw.
   */
  total:number|null;
  total_basis:'draft'|'sent';
  /** The draft's freight is still "call for freight", so `total` covers the items only. */
  freight_pending:boolean;
  /** (items − cost) ÷ items over the priced lines (spec §5.2), or null with nothing priced. */
  margin:number|null;
  /** The margin as the portal prints it (formatMargin): "31.4%", or "—". */
  margin_label:string;
  /** Lines of an editable draft below the rep's floor: a warning only. 0 once sent. */
  below_floor_count:number;
  /** Unread for the rep (unread_for_rep): a new request, an acceptance or a change request they haven't opened. */
  unread:boolean;
  is_sample:boolean;line_count:number;
  /** The customer's Request changes note, on a changes_requested quote only. */
  change_request:{note:string;by:string|null;at:string|null}|null;
}

export type QuoteStatusCounts=Record<QuoteStatus,number>&{all:number};

export interface RepQuoteList {
  /** When the list was read: statuses are effective as of this instant. */
  as_of:string;
  /** The picked customer, or null for All customers. */
  customer:CustomerListItem|null;
  /** The picked customer is assigned to another rep, so their quotes aren't in this rep's list. */
  other_rep:boolean;
  /** The status filter applied to `rows`, or null for every status. */
  status:QuoteStatus|null;
  /** The rep's quotes for the picked customer, per status, before the status filter. */
  counts:QuoteStatusCounts;
  /** Unread quotes for the picked customer, before the status filter. */
  unread:number;
  rows:RepQuoteRow[];
}

export interface RepQuoteListOptions {
  /** The "Viewing" picker (?customer=). An unknown id reads as All customers, as the picker does. */
  customerId?:string|null;
  status?:QuoteStatus|null;
  /** For tests. */
  now?:string;
  /** Freight's distance provider for draft totals; haversine by default. */
  provider?:DistanceProvider;
}

const emptyCounts=():QuoteStatusCounts=>({all:0,...Object.fromEntries(QUOTE_STATUSES.map(s=>[s,0])) as Record<QuoteStatus,number>});

async function toRow(row:QuoteListRow&{status:QuoteStatus},accountNumber:string|null,provider:DistanceProvider|undefined):Promise<RepQuoteRow>{
  const fraction=margin(row.subtotal,row.cost_total);
  const base={id:row.id,quote_number:row.quote_number,revision:row.revision,customer_id:row.customer_id,customer_name:row.customer_name,account_number:accountNumber,
    status:row.status,requested_at:row.requested_at,sent_at:row.sent_at,valid_until:row.valid_until,margin:fraction,margin_label:formatMargin(fraction),
    unread:row.unread_for_rep,is_sample:row.is_sample,line_count:row.line_count};
  if(!canEditDraft(row.status))return {...base,total:row.sent_total,total_basis:'sent',freight_pending:false,below_floor_count:0,change_request:null};
  // The draft the rep is working on: the same total and floor count the send dialog shows.
  const check=await sendCheck(row.id,{provider});
  const full=row.status==='changes_requested'?quote(row.id):undefined;
  return {...base,total:check.total??check.subtotal,total_basis:'draft',freight_pending:check.total===null,below_floor_count:check.below_floor_count,
    change_request:full?{note:row.change_request_note??'',by:full.contact_name,at:full.responded_at}:null};
}

/**
 * The signed-in rep's Quotes list, newest request first. Expiry is lazy (task 1.5), so this
 * stores the expiry of every sent quote past valid_until first, and every row is read through
 * effectiveStatus as well.
 */
export async function repQuoteList(repId:string,{customerId=null,status=null,now=clock(),provider}:RepQuoteListOptions={}):Promise<RepQuoteList>{
  expireOverdueQuotes({now});
  const everyone=customers();
  const customer=customerId?everyone.find(c=>c.id===customerId)??null:null;
  const accounts=new Map(everyone.map(c=>[c.id,c.account_number]));
  const scoped=quotes({repId,customerId:customer?.id??null}).map(row=>({...row,status:effectiveStatus(row,now)}));
  const counts=emptyCounts();
  for(const row of scoped){counts[row.status]++;counts.all++;}
  const shown=status?scoped.filter(row=>row.status===status):scoped;
  const rows=[];
  for(const row of shown)rows.push(await toRow(row,accounts.get(row.customer_id)??null,provider));
  return {as_of:now,customer,other_rep:!!customer&&customer.rep_id!==repId,status,counts,unread:scoped.filter(row=>row.unread_for_rep).length,rows};
}

/** One of the rep's quotes, by id or number (Q-24817). Another rep's quote reads as not found, as in the list. */
export function repQuote(repId:string,quoteIdOrNumber:string){
  const q=quote(quoteIdOrNumber)??quoteByNumber(quoteIdOrNumber);
  return q&&q.rep_id===repId?q:undefined;
}

/**
 * The rep opened the quote: clears its unread flag (and so the Quotes badge). Returns undefined,
 * changing nothing, when it isn't one of the rep's quotes.
 */
export function openRepQuote(repId:string,quoteIdOrNumber:string):{id:string;quote_number:string}|undefined{
  const q=repQuote(repId,quoteIdOrNumber);
  if(!q)return undefined;
  markQuoteRead(q.id,'rep');
  return {id:q.id,quote_number:q.quote_number};
}
