import type {QuoteStatus} from '@/domain';
import {CUSTOMER_PARAM,REP_PARAM} from '../scope';
import {AGING_PARAM,ATTENTION_PARAM,ONLY_PARAM,REQUESTED_FROM_PARAM,REQUESTED_TO_PARAM,SORT_PARAM,STATUS_FILTERS,STATUS_PARAM,VIEW_PARAM} from './labels';

// The Quotes page's filters in the URL (plan U3; C_QOB2, C_QOT1, C_RQB2). One query drives the server
// render, the list's poll and the filter panel, so a filtered list can be linked to and survives a
// reload. Pure: no React, no server.

export type QuotesView='board'|'table';
/** The user's own column order and visibility (DataTable prefs) for the table, and lane order for the board. */
export const TABLE_ID='quotes';
export const BOARD_ID='quotes-board';
/** "Only show" (C_QOB2): Overdue (red), Aging (amber), Below margin floor. */
export type OnlyShow='overdue'|'aging'|'below_floor';
export const ONLY_SHOW:readonly OnlyShow[]=['overdue','aging','below_floor'];
export const ONLY_LABELS:Readonly<Record<OnlyShow,string>>={overdue:'Overdue',aging:'Aging',below_floor:'Below margin floor'};
export const ALL_STATUSES:QuoteStatus[]=[...STATUS_FILTERS];

export interface QuoteFilters {
  /** Empty: every status. */
  statuses:QuoteStatus[];
  /** The manager's Rep filter (a rep id); ignored by the server for a rep. */
  rep:string|null;
  customer:string|null;
  /** YYYY-MM-DD, UTC days. */
  requestedFrom:string|null;requestedTo:string|null;
  only:OnlyShow[];
}
export const NO_FILTERS:QuoteFilters={statuses:[],rep:null,customer:null,requestedFrom:null,requestedTo:null,only:[]};

const DAY=/^\d{4}-\d{2}-\d{2}$/;
const day=(value:string|null)=>value&&DAY.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))?value:null;
const list=<T extends string>(value:string|null,known:readonly T[]):T[]=>{const asked=(value??'').split(',');return known.filter(k=>asked.includes(k));};
const params=(query:string|URLSearchParams)=>new URLSearchParams(query);

/** Board unless the query says table. */
export const parseView=(value:string|null|undefined):QuotesView=>value==='table'?'table':'board';

/** The panel's filters a page query holds. */
export function filtersFromQuery(query:string|URLSearchParams):QuoteFilters{
  const p=params(query);
  const customer=p.get(CUSTOMER_PARAM);
  return {statuses:list(p.get(STATUS_PARAM),STATUS_FILTERS),rep:p.get(REP_PARAM)||null,customer:customer&&customer!=='all'?customer:null,
    requestedFrom:day(p.get(REQUESTED_FROM_PARAM)),requestedTo:day(p.get(REQUESTED_TO_PARAM)),only:list(p.get(ONLY_PARAM),ONLY_SHOW)};
}

/** Params the panel does not edit but a link may bring (the Team dashboard's drill-down, task D3): kept by the toolbar, dropped by Apply filters. */
const KEPT=['from','to','team',AGING_PARAM];

/**
 * The query the page reads and polls: the old Needs attention link (?attention=1, the caution dropdown
 * replaced the view, plan U2) and the drill-down's ?aging=red|amber become Only show Overdue and Aging;
 * the view is dropped (it is not a filter). Everything else is kept as given.
 */
export function canonicalQuery(query:string|URLSearchParams):string{
  const p=params(query);
  const only=new Set(list(p.get(ONLY_PARAM),ONLY_SHOW));
  if(p.get(ATTENTION_PARAM)==='1'){only.add('overdue');only.add('aging');}
  const aging=p.get(AGING_PARAM);
  if(aging==='red')only.add('overdue');
  if(aging==='amber')only.add('aging');
  for(const key of [VIEW_PARAM,ATTENTION_PARAM,SORT_PARAM,ONLY_PARAM])p.delete(key);
  if(aging==='red'||aging==='amber')p.delete(AGING_PARAM);
  if(only.size)p.set(ONLY_PARAM,ONLY_SHOW.filter(o=>only.has(o)).join(','));
  return p.toString();
}

/** The kept drill-down params of a query, as a query string. */
export function keptQuery(query:string|URLSearchParams):string{
  const p=params(query),kept=new URLSearchParams();
  for(const [key,value] of p)if(KEPT.includes(key))kept.append(key,value);
  return kept.toString();
}

/** The page for a view and filters (plus `kept`, drill-down params to carry). Every status picked is no status filter. */
export function quotesHref(filters:QuoteFilters,view:QuotesView,kept=''):string{
  const p=new URLSearchParams();
  if(view==='table')p.set(VIEW_PARAM,'table');
  if(filters.customer)p.set(CUSTOMER_PARAM,filters.customer);
  const statuses=fromPanel(filters).statuses;
  if(statuses.length)p.set(STATUS_PARAM,statuses.join(','));
  if(filters.rep)p.set(REP_PARAM,filters.rep);
  if(filters.requestedFrom)p.set(REQUESTED_FROM_PARAM,filters.requestedFrom);
  if(filters.requestedTo)p.set(REQUESTED_TO_PARAM,filters.requestedTo);
  if(filters.only.length)p.set(ONLY_PARAM,ONLY_SHOW.filter(o=>filters.only.includes(o)).join(','));
  for(const [key,value] of new URLSearchParams(kept))p.append(key,value);
  const q=p.toString();
  return q?`/rep/quotes?${q}`:'/rep/quotes';
}

/** The panel's draft: no status filter shows every status ticked, as C_QOB2 draws it. */
export const toPanel=(filters:QuoteFilters):QuoteFilters=>({...filters,statuses:filters.statuses.length?[...filters.statuses]:[...ALL_STATUSES]});
/** What a panel draft applies: none or every status ticked is no status filter; statuses in board order. */
export function fromPanel(draft:QuoteFilters):QuoteFilters{
  const statuses=STATUS_FILTERS.filter(s=>draft.statuses.includes(s));
  return {...draft,statuses:statuses.length===STATUS_FILTERS.length?[]:statuses};
}

/** The count badge (C_CU2): a status choice, the rep, the customer, each requested day and each Only show. */
export function filterCount(filters:QuoteFilters):number{
  return (fromPanel(filters).statuses.length?1:0)+(filters.rep?1:0)+(filters.customer?1:0)+(filters.requestedFrom?1:0)+(filters.requestedTo?1:0)+filters.only.length;
}
