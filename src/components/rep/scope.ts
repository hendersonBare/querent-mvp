// Rep portal navigation and the "Viewing" customer picker (spec §4). Pure helpers, no React.
//
// The picked customer lives in the URL as ?customer=<customer id>. No param means All customers.
// Every nav link keeps it, a reload keeps it, and any page can read it:
//   - Client Components: useRepScope() from './context' ({customerId, scope, customer, href, ...}).
//   - Server Components: the page's searchParams prop, `(await searchParams).customer`, checked
//     against the customer list the same way scopeFrom() does.
// Lists and analytics (tasks 3.2, 3.8, 6.2) filter by it; the supplier API takes it as its
// <scope> path segment ('all' or the id, see apiScope).

export const SCOPE_PARAM='customer';
export const ALL_CUSTOMERS='all';

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

/** `path` with the picked customer set (or removed for All customers), keeping its other params. */
export function scopedHref(path:string,customerId:string|null){
  const at=path.indexOf('?');
  const base=at<0?path:path.slice(0,at);
  const params=new URLSearchParams(at<0?'':path.slice(at+1));
  if(customerId)params.set(SCOPE_PARAM,customerId);else params.delete(SCOPE_PARAM);
  const query=params.toString();
  return query?`${base}?${query}`:base;
}

/** The supplier API's scope segment (supplier/dashboard/<scope>, supplier/data/<scope>/...): 'all' or the customer id. */
export const apiScope=(customerId:string|null)=>customerId??ALL_CUSTOMERS;
