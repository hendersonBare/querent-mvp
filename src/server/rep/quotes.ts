import 'server-only';
import {QUOTE_STATUSES,type CustomerListItem,type Quote,type QuoteListRow,type QuoteStatus} from '@/domain';
import {formatMargin,margin} from '@/server/floors';
import type {DistanceProvider} from '@/server/freight/distance';
import {aging,canEditDraft,effectiveStatus,needsAttention,type Aging,type AgingLevel,type AgingThresholds} from '@/server/quotes';
import {expireOverdueQuotes,sendCheck} from '@/server/quotes/service';
import {agingThresholds,customers,markQuoteRead,quote,quoteByNumber,quotes,teamReps,touchQuoteByRep} from '@/server/repository';
import {isoInstant} from '@/server/team/query';
import {customerFilterFor} from './access';

// The rep's Quotes list (spec §4, task 3.2): status, customer, requested date, total, margin and
// the unread dot, filtered by status and by the page's own ?customer=. Rep-only: it carries margin,
// so it is served only to the supplier persona (GET /api/rep/quotes, the /rep/quotes page).
//
// Whose quotes (Appendix B; decisions 20, 22; task U1): purely by role. A rep's list is their own
// quotes (quotes.rep_id, the current owner), the same rule as the Quotes badge (./badges); the
// manager's is every rep's. No parameter widens it (the old ?scope=all is ignored), and a
// ?customer= the rep can't read (another rep's customer) is ignored like an unknown one. A quote's
// rep is the customer's assigned rep when it was requested, until a manager reassigns it (task D2).
//
// Aging (v3 spec §3, task A2): every row carries its aging, and the Needs attention view
// (?attention=1) shows the amber and red open quotes, red first, then the largest quoted total,
// or oldest clock first with ?sort=oldest. Other filters keep newest request first (OA-9).
//
// The manager (v3 spec §6, §8; decisions 21, 22; tasks D2, U1) sees every rep's quotes, each row
// naming its rep, filtered by rep or team label, with the Needs attention view over the same quotes
// (OA-52). Quotes move between reps (./reassign), so a quote's rep is its current owner, not always
// the customer's assigned rep.
//
// The Team dashboard drills into the manager's list (v3 spec §6 Team; decision 23; task D3), so it
// also takes a window (?from=&to=: quotes created in [from, to), two ISO instants), an aging level
// for the open quotes (?aging=ok|amber|red, a view like Needs attention) and several reps (?rep=a,b).

const clock=()=>new Date().toISOString();

/** How the Needs attention view is sorted: red, then amber, then quoted total (urgent), or oldest clock first. */
export type AttentionSort='urgent'|'oldest';
/** A ?sort= value: oldest, or the default (urgent) for anything else. */
export const parseAttentionSort=(value:string|null|undefined):AttentionSort=>value==='oldest'?'oldest':'urgent';

const AGING_LEVELS:readonly AgingLevel[]=['ok','amber','red'];
/** An ?aging= value (the Team dashboard's open ok / amber / red counts, task D3), or null for anything else. */
export const parseAgingLevel=(value:string|null|undefined):AgingLevel|null=>(AGING_LEVELS as readonly string[]).includes(value??'')?value as AgingLevel:null;

/** A ?status= value, or null (every status) for anything that isn't one of the five statuses. */
export function parseStatus(value:string|null|undefined):QuoteStatus|null{
  return (QUOTE_STATUSES as readonly string[]).includes(value??'')?value as QuoteStatus:null;
}

export interface RepQuoteRow {
  id:string;quote_number:string;
  /** The quote's current rep (the manager's Rep column, task D2). */
  rep_id:string;rep_name:string;
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
  /** Unread for the signed-in rep (unread_for_rep on their own quote): a new request, an acceptance or a change request they haven't opened. */
  unread:boolean;
  is_sample:boolean;line_count:number;
  /** The customer's Request changes note, on a changes_requested quote only. */
  change_request:{note:string;by:string|null;at:string|null}|null;
  /** How long the quote has waited (v3 spec §3), or null for a final status. */
  aging:Aging|null;
  /** What the Needs attention sort ranks by: the last sent revision's total, else the live draft total. */
  quoted_total:number|null;
}

export type QuoteStatusCounts=Record<QuoteStatus,number>&{all:number};

/** Whose quotes the list shows, by role (task U1): the signed-in rep's own, or every rep's for the manager. */
export type QuotesScope='mine'|'all';
/** A rep in the manager's rep filter and reassignment choices; inactive reps stay for history (OA-27). */
export interface ScopeRep {id:string;name:string;team:string|null;active:boolean}
/** What the manager's list needs beyond the rows: every rep and every team label, by name. */
export interface ManagerListOptions {reps:ScopeRep[];teams:string[]}

export interface RepQuoteList {
  /** When the list was read: statuses are effective as of this instant. */
  as_of:string;
  /** The page's own customer filter, or null for All customers. */
  customer:CustomerListItem|null;
  /** The status filter applied to `rows`, or null for every status (always null in the Needs attention view). */
  status:QuoteStatus|null;
  /** `rows` are the Needs attention view: the amber and red open quotes. */
  attention:boolean;
  /** The Needs attention view's order (urgent outside it). */
  sort:AttentionSort;
  /** Amber and red open quotes for the picked customer: the Needs attention filter's count. */
  attention_count:number;
  /** The rep's quotes for the picked customer, per status, before the status filter. */
  counts:QuoteStatusCounts;
  /** The signed-in rep's own unread quotes for the picked customer, before the status filter. */
  unread:number;
  rows:RepQuoteRow[];
  scope:QuotesScope;
  /** The manager's rep and team filters as applied (null: every rep, every team). Several reps read "mara,nora" (task D3). */
  rep_filter:string|null;team_filter:string|null;
  /** The Team dashboard's window as applied (the manager only): quotes created in [from, to). */
  window:{from:string;to:string}|null;
  /** The open quotes at this aging level only (the manager only, task D3); it replaces the status filter. */
  aging_filter:AgingLevel|null;
  /** For the manager (the rep and team filters and Reassign); null for a rep. */
  manager:ManagerListOptions|null;
}

export interface RepQuoteListOptions {
  /** The page's own ?customer=. An unknown id, or one the rep can't read, reads as All customers (task U1). */
  customerId?:string|null;
  status?:QuoteStatus|null;
  /** The Needs attention view (?attention=1); it replaces the status filter. */
  attention?:boolean;
  sort?:AttentionSort;
  /** The signed-in rep is the manager (repAccess): the list is every rep's quotes (task U1). */
  manager?:boolean;
  /**
   * The manager's filters (?rep=&team=), ignored for a rep. Unknown values read as every rep or team.
   * The Team dashboard's drill-down adds rep=a,b, the window (from, to) and an aging level (task D3);
   * a malformed one is ignored.
   */
  filters?:{rep?:string|null;team?:string|null;from?:string|null;to?:string|null;aging?:string|null}|null;
  /** For tests. */
  now?:string;
  /** Freight's distance provider for draft totals; haversine by default. */
  provider?:DistanceProvider;
}

/** Every rep by name with team and active flag, and the team labels in use (the manager's options). */
export function managerListOptions():ManagerListOptions{
  const reps=teamReps().map(({id,name,team,active})=>({id,name,team,active}));
  return {reps,teams:[...new Set(reps.flatMap(r=>r.team?[r.team]:[]))].sort((a,b)=>a.localeCompare(b))};
}

const emptyCounts=():QuoteStatusCounts=>({all:0,...Object.fromEntries(QUOTE_STATUSES.map(s=>[s,0])) as Record<QuoteStatus,number>});

type ScopedRow=QuoteListRow&{status:QuoteStatus;aging:Aging|null};

async function toRow(row:ScopedRow,accountNumber:string|null,viewer:string,provider:DistanceProvider|undefined):Promise<RepQuoteRow>{
  const fraction=margin(row.subtotal,row.cost_total);
  const base={id:row.id,quote_number:row.quote_number,rep_id:row.rep_id,rep_name:row.rep_name,revision:row.revision,customer_id:row.customer_id,customer_name:row.customer_name,account_number:accountNumber,
    status:row.status,requested_at:row.requested_at,sent_at:row.sent_at,valid_until:row.valid_until,margin:fraction,margin_label:formatMargin(fraction),
    unread:row.unread_for_rep&&row.rep_id===viewer,is_sample:row.is_sample,line_count:row.line_count,aging:row.aging};
  if(!canEditDraft(row.status))return {...base,total:row.sent_total,total_basis:'sent',freight_pending:false,below_floor_count:0,change_request:null,quoted_total:row.sent_total};
  // The draft the rep is working on: the same total and floor count the send dialog shows.
  const check=await sendCheck(row.id,{provider});
  const full=row.status==='changes_requested'?quote(row.id):undefined;
  const total=check.total??check.subtotal;
  return {...base,total,total_basis:'draft',freight_pending:check.total===null,below_floor_count:check.below_floor_count,
    change_request:full?{note:row.change_request_note??'',by:full.contact_name,at:full.responded_at}:null,quoted_total:row.sent_total??total};
}

const RANK={red:0,amber:1,ok:2} as const;
/**
 * The Needs attention order (decision 18): red before amber, then the largest quoted total (none
 * last); or, for `oldest`, the earliest clock start first. Ties keep the incoming (newest request) order.
 */
export function attentionOrder(rows:readonly RepQuoteRow[],sort:AttentionSort):RepQuoteRow[]{
  const since=(r:RepQuoteRow)=>r.aging?Date.parse(r.aging.since):Infinity;
  const level=(r:RepQuoteRow)=>r.aging?RANK[r.aging.level]:3;
  return [...rows].sort(sort==='oldest'?(a,b)=>since(a)-since(b)
    :(a,b)=>level(a)-level(b)||(b.quoted_total??-Infinity)-(a.quoted_total??-Infinity));
}

/** Each quote's aging at `now` under the supplier's thresholds (v3 spec §3). */
const withAging=<T extends QuoteListRow>(rows:T[],now:string,thresholds:AgingThresholds=agingThresholds())=>
  rows.map(row=>({...row,status:effectiveStatus(row,now),aging:aging(row,now,thresholds)}));

/**
 * The Quotes list for the signed-in rep: their own quotes, or every rep's for the manager (task U1),
 * newest request first. Expiry is lazy (task 1.5), so this stores the expiry of every sent quote
 * past valid_until first, and every row is read through effectiveStatus as well.
 */
export async function repQuoteList(repId:string,{customerId=null,status=null,attention=false,sort='urgent',manager=false,filters=null,now=clock(),provider}:RepQuoteListOptions={}):Promise<RepQuoteList>{
  expireOverdueQuotes({now});
  const everyone=customers();
  const customer=customerFilterFor({repId,manager},customerId,everyone);
  const accounts=new Map(everyone.map(c=>[c.id,c.account_number]));
  const options=manager?managerListOptions():null;
  const all=!!options;
  const asked=all?(filters?.rep??'').split(','):[];
  const pickedReps=all?options.reps.filter(r=>asked.includes(r.id)).map(r=>r.id):[];
  const team=filters?.team??'';
  const teamIds=all&&options.teams.includes(team)?options.reps.filter(r=>r.team===team).map(r=>r.id):undefined;
  const repFilter=pickedReps.length?pickedReps.join(','):null;
  const teamFilter=teamIds?team:null;
  const repIds=pickedReps.length>1?pickedReps.filter(id=>!teamIds||teamIds.includes(id)):teamIds;
  const filter=all?{repId:pickedReps.length===1?pickedReps[0]:null,repIds}:{repId};
  const from=all?isoInstant(filters?.from??null):null,to=all?isoInstant(filters?.to??null):null;
  const window=from&&to&&from<to?{from,to}:null;
  const agingFilter=all&&!attention?parseAgingLevel(filters?.aging):null;
  const scoped=withAging(quotes({...filter,customerId:customer?.id??null}),now).filter(row=>!window||(row.created_at>=window.from&&row.created_at<window.to));
  const counts=emptyCounts();
  for(const row of scoped){counts[row.status]++;counts.all++;}
  const shown=attention?scoped.filter(row=>needsAttention(row.aging)):agingFilter?scoped.filter(row=>row.aging?.level===agingFilter)
    :status?scoped.filter(row=>row.status===status):scoped;
  let rows:RepQuoteRow[]=[];
  for(const row of shown)rows.push(await toRow(row,accounts.get(row.customer_id)??null,repId,provider));
  if(attention)rows=attentionOrder(rows,sort);
  return {as_of:now,customer,status:attention||agingFilter?null:status,attention,sort:attention?sort:'urgent',
    attention_count:scoped.filter(row=>needsAttention(row.aging)).length,counts,unread:scoped.filter(row=>row.unread_for_rep&&row.rep_id===repId).length,rows,
    scope:all?'all':'mine',rep_filter:repFilter,team_filter:teamFilter,window,aging_filter:agingFilter,manager:options};
}

/**
 * The header badge's count (v3 spec §3, decision 18): the rep's red open quotes, all customers, or
 * every rep's (repId null: the manager, task U1). The caller stores lazy expiry first (repBadges does).
 */
export function redQuoteCount(repId:string|null,now:string){
  return attentionQuotes(repId,now).filter(row=>row.aging.level==='red').length;
}

/**
 * The amber and red open quotes, the Needs attention view's quotes (v3 spec §3, decision 18): the
 * rep's own, or every rep's (repId null: the manager, task U1). The header's caution dropdown lists
 * them (plan U2, ./badges). The caller stores lazy expiry first.
 */
export function attentionQuotes(repId:string|null,now:string){
  return withAging(quotes({repId,statuses:['ready_for_review','changes_requested','sent']}),now)
    .filter((row):row is typeof row&{aging:Aging}=>needsAttention(row.aging));
}

/**
 * One of the rep's quotes, by id or number (Q-24817). Another rep's quote reads as not found, as in
 * the list. Every write starts here, so a manager edits another rep's quote only after reassigning it (task D2).
 */
export function repQuote(repId:string,quoteIdOrNumber:string){
  const q=quote(quoteIdOrNumber)??quoteByNumber(quoteIdOrNumber);
  return q&&q.rep_id===repId?q:undefined;
}

/**
 * A quote the signed-in rep may read (v3 spec §8; decisions 22, 26; task D2): their own, or, for the
 * manager, any rep's, read-only (`readOnly`). Only reads use it (the detail, the chat, PDFs and the
 * CSV); writes take repQuote. Undefined when it doesn't exist or isn't theirs to read.
 */
export function readableQuote(repId:string,quoteIdOrNumber:string,{manager=false}:{manager?:boolean}={}):{quote:Quote;readOnly:boolean}|undefined{
  const q=quote(quoteIdOrNumber)??quoteByNumber(quoteIdOrNumber);
  if(!q)return undefined;
  if(q.rep_id===repId)return {quote:q,readOnly:false};
  return manager?{quote:q,readOnly:true}:undefined;
}

/**
 * The owning rep opened or edited the quote (v3 spec §3, decision 25): stamps last_rep_touch_at, not
 * updated_at. Pass a quote already checked as the rep's (repQuote, editableQuote): a manager's
 * read-only open of another rep's quote must not touch it.
 */
export function touchRepQuote(q:{id:string},at=clock()){touchQuoteByRep(q.id,at);}

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
