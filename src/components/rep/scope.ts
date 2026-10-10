// Rep portal navigation and the "Viewing" customer picker (spec §4). Pure helpers, no React.
//
// The picked customer lives in the URL as ?customer=<customer id>. No param means All customers.
// Every nav link keeps it, a reload keeps it, and any page can read it:
//   - Client Components: useRepScope() from './context' ({customerId, customer, label, href, ...}).
//   - Server Components: the page's searchParams prop, `(await searchParams).customer`, checked
//     against the customer list the same way scopeFrom() does.
// Lists and analytics (tasks 3.2, 3.8, 6.2) filter by it.

export const SCOPE_PARAM='customer';
export const ALL_CUSTOMERS='all';

// The manager's All reps scope (v3 spec §6 Quotes list; decision 22; task D2) lives in ?scope=all
// and travels with every portal link like the picked customer, so the quote pages and the header's
// Needs attention badge keep it (OA-52). Only the manager's links carry it; a rep's never do.
/** ?scope=all: every rep's quotes (the manager only). */
export const REPS_PARAM='scope';
export const ALL_REPS='all';
/** The All reps list's rep and team filters (?rep=<id>, ?team=<label>). */
export const REP_PARAM='rep';
export const TEAM_PARAM='team';
/** ?scope=all, and nothing else, is the All reps scope. */
export const isAllReps=(value:string|null|undefined)=>value===ALL_REPS;

/** The portal's sections, in nav order (spec §4). */
export const REP_SECTIONS=[
  {id:'quotes',label:'Quotes',href:'/rep/quotes'},
  {id:'customers',label:'Customers',href:'/rep/customers'},
  {id:'orders',label:'Orders',href:'/rep/orders'},
  {id:'items',label:'Items',href:'/rep/items'},
  {id:'analytics',label:'Analytics',href:'/rep/analytics'},
  {id:'settings',label:'Settings',href:'/rep/settings'},
] as const;
export type RepSection=typeof REP_SECTIONS[number];
export const HOME_SECTION=REP_SECTIONS[0];

/** The section a path belongs to: /rep/quotes and /rep/quotes/Q-24817 are both Quotes. */
export const sectionFor=(pathname:string):RepSection|undefined=>REP_SECTIONS.find(s=>pathname===s.href||pathname.startsWith(`${s.href}/`));

/**
 * The picked customer's id from a query string, or null for All customers. With `known`, an id
 * that isn't one of those customers also reads as All customers.
 */
export function scopeFrom(params:{get(name:string):string|null},known?:readonly {id:string}[]):string|null{
  const id=params.get(SCOPE_PARAM);
  if(!id||id===ALL_CUSTOMERS)return null;
  return !known||known.some(c=>c.id===id)?id:null;
}

/**
 * `path` with the picked customer set (or removed for All customers), keeping its other params.
 * `allReps` sets (true) or removes (false) the manager's ?scope=all; undefined leaves `path`'s own.
 */
export function scopedHref(path:string,customerId:string|null,allReps?:boolean){
  const at=path.indexOf('?');
  const base=at<0?path:path.slice(0,at);
  const params=new URLSearchParams(at<0?'':path.slice(at+1));
  if(customerId)params.set(SCOPE_PARAM,customerId);else params.delete(SCOPE_PARAM);
  if(allReps===true)params.set(REPS_PARAM,ALL_REPS);else if(allReps===false)params.delete(REPS_PARAM);
  const query=params.toString();
  return query?`${base}?${query}`:base;
}
