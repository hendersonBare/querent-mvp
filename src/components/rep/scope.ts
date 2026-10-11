// Rep portal navigation (spec §4) and the page-local customer filter. Pure helpers, no React.
//
// Scope is role based on the server (Appendix B; decisions 20, 22, 42; task U1): a rep reads only
// their own customers, quotes, orders and analytics; the manager reads the whole organization.
// There is no header "Viewing" picker and no "My quotes / All reps" switch, so nav links carry no
// query. ?customer=<id> is only a page's own filter (Quotes, Customers, Orders, Settings > Customer
// access, Analytics); the server reads it and ignores a customer the signed-in rep can't read.

/** A page's own customer filter: ?customer=<customer id>. */
export const CUSTOMER_PARAM='customer';
/** ?customer=all, like no param, means every customer the rep may read. */
export const ALL_CUSTOMERS='all';

/** The manager's rep and team filters on the Quotes list (?rep=<id or a,b>, ?team=<label>). */
export const REP_PARAM='rep';
export const TEAM_PARAM='team';
/** The Team dashboard's drill-down window on the Quotes list (?from=&to=, ISO instants, task D3). */
export const FROM_PARAM='from';
export const TO_PARAM='to';

/** The portal's sections, in nav order (spec §4). Team is the manager's alone (v3 spec §6, task D3). */
export const REP_SECTIONS=[
  {id:'quotes',label:'Quotes',href:'/rep/quotes'},
  {id:'customers',label:'Customers',href:'/rep/customers'},
  {id:'orders',label:'Orders',href:'/rep/orders'},
  {id:'items',label:'Items',href:'/rep/items'},
  {id:'analytics',label:'Analytics',href:'/rep/analytics'},
  {id:'team',label:'Team',href:'/rep/team',managerOnly:true},
  {id:'settings',label:'Settings',href:'/rep/settings'},
] as const;
export type RepSection=typeof REP_SECTIONS[number];
/** The sections a rep's nav shows: Team only for the manager. */
export const sectionsFor=(manager:boolean)=>REP_SECTIONS.filter(s=>manager||!('managerOnly' in s));
export const HOME_SECTION=REP_SECTIONS[0];

/** The section a path belongs to: /rep/quotes and /rep/quotes/Q-24817 are both Quotes. */
export const sectionFor=(pathname:string):RepSection|undefined=>REP_SECTIONS.find(s=>pathname===s.href||pathname.startsWith(`${s.href}/`));

/** A page's own ?customer= as given, or null for every customer. The server checks it against what the rep may read. */
export function customerFilter(params:{get(name:string):string|null}):string|null{
  const id=params.get(CUSTOMER_PARAM);
  return !id||id===ALL_CUSTOMERS?null:id;
}

/** `path` filtered to one customer (or unfiltered with null), keeping its other params: a link into one page's filter, never carried on. */
export function withCustomer(path:string,customerId:string|null){
  const at=path.indexOf('?');
  const base=at<0?path:path.slice(0,at);
  const params=new URLSearchParams(at<0?'':path.slice(at+1));
  if(customerId)params.set(CUSTOMER_PARAM,customerId);else params.delete(CUSTOMER_PARAM);
  const query=params.toString();
  return query?`${base}?${query}`:base;
}
