// Rep portal navigation (spec §4, plan U2) and the page-local customer filter. Pure helpers, no React.
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

/** The manager's rep and team filters on the Quotes list (?rep=<id or a,b>, ?team=<team name>, a parent team taking in its child teams' reps). */
export const REP_PARAM='rep';
export const TEAM_PARAM='team';
/** The Analytics drill-down window on the Quotes list (?from=&to=, ISO instants; tasks D3, U6). */
export const FROM_PARAM='from';
export const TO_PARAM='to';

/**
 * The rail's sections, in nav order (plan U2; C_QOBoard for the manager, C_RQBoard for a rep), each
 * with the frame's 24px icon path. Stock and Teams and Reps live at /rep/stock and /rep/teams
 * (decision 46; next.config.ts redirects the old /rep/items and /rep/team). Teams and Reps is the
 * manager's alone (v3 spec §6, task D3); a rep's Analytics reads "My Analytics".
 */
export const REP_SECTIONS=[
  {id:'quotes',label:'Quotes',href:'/rep/quotes',icon:'M6 3h9l4 4v14H6V3z M14 3v5h5 M9 13h7 M9 17h5'},
  {id:'customers',label:'Customers',href:'/rep/customers',icon:'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21c1-4 4-6 8-6s7 2 8 6'},
  {id:'orders',label:'Orders',href:'/rep/orders',icon:'M3 8l9-5 9 5v9l-9 5-9-5V8z M3 8l9 5 9-5 M12 13v9'},
  {id:'stock',label:'Stock',href:'/rep/stock',icon:'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z'},
  {id:'analytics',label:'Analytics',repLabel:'My Analytics',href:'/rep/analytics',icon:'M4 20V10 M10 20V4 M16 20v-8 M22 20H2'},
  {id:'teams',label:'Teams and Reps',href:'/rep/teams',managerOnly:true,icon:'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z M17 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M2 20c.8-3.5 3.3-5 7-5s6.2 1.5 7 5 M17 14c3 0 4.7 1.4 5 4'},
  {id:'settings',label:'Settings',href:'/rep/settings',icon:'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M19 5l-2 2 M7 17l-2 2'},
] as const;
export type RepSection=typeof REP_SECTIONS[number];
/** A section as one reader's rail shows it. */
export interface NavSection {id:RepSection['id'];label:string;href:string;icon:string}
/** The sections a reader's rail shows, labelled for their role: Teams and Reps only for the manager, My Analytics for a rep. */
export const sectionsFor=(manager:boolean):NavSection[]=>REP_SECTIONS.filter(s=>manager||!('managerOnly' in s))
  .map(s=>({id:s.id,label:!manager&&'repLabel' in s?s.repLabel:s.label,href:s.href,icon:s.icon}));
export const HOME_SECTION=REP_SECTIONS[0];

/** The rail's user name (C_QOBoard "Brian G."): the first name and the last name's initial. */
export function shortName(name:string){
  const parts=name.trim().split(/\s+/).filter(Boolean);
  if(parts.length<2)return parts[0]??'';
  return `${parts[0]} ${parts.at(-1)![0]!.toUpperCase()}.`;
}

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
