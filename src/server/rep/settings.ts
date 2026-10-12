import 'server-only';
import type {CustomerListItem,DeliveryRates,PricingSettings,Rep,RepFloor} from '@/domain';
import type {AccessRule,ERPStatus} from '@/lib/contracts';
import {featureFlags,type FeatureFlags} from '@/server/flags';
import {formatMargin} from '@/server/floors';
import {canEditFloor} from '@/server/floors/rules';
import {FloorPermissionError,setMyFloor} from '@/server/floors/service';
import {checkDeliveryRates} from '@/server/freight/rates';
import type {AgingThresholds} from '@/server/quotes/aging';
import {
  accessCustomers,agingThresholds,aggregateAccess,customerAccount,customerIds,customers,deliveryRates,demoDatabase,events,inTransaction,isCategory,orgMarginFloors,pricingSettings,productCategories,
  quotes,repFloors,reps,setAccess,setAssignedRep,setDeliveryRates,setOrgMarginFloors,setScarcityUplift,teamReps,type AccessCustomer,type AccessFilter,type DemoDatabase,type OrgMarginFloor,
} from '@/server/repository';
import {effectiveStatus} from '@/server/quotes/lifecycle';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {ownerFilter,readableCustomers,type RepReader} from './access';
import {notificationPrefs,type NotificationPrefs} from './notification-prefs';
import {profileView,type RepProfileView} from './profile';
import {moveQuotes,type ReassignResult} from './reassign';

// Settings (spec §4, task 6.1; plan U8) for the signed-in rep. This module builds the page's data and
// checks every write before it reaches the repository. The routes under /api/rep/settings serve it to the
// supplier persona only (./http, repRoute).
//
// Who may change what (Appendix B; plan U8):
// - The manager's four tabs, Customer access, Margin floors (the organization floors and the read-only
//   review of every rep's margins), Pricing and delivery, and Aging, are hers alone: their routes are
//   managerRoute (403 for a rep), and a rep's GET /api/rep/settings carries none of their data (OA-69).
// - A rep reads and edits only their own margin floors (spec §5.2, through setMyFloor, which refuses
//   anyone else's) until their own tabs come (plan U9). The manager keeps her own floors (decision 20).
// - Rep assignments moved to Teams and Reps (plan U7); assignRep stays as its backing write. An inactive
//   rep can't be given a customer (decision 21). Reassigning a customer leaves its quotes with their rep
//   unless the manager ticks "Also move this customer's open quotes" (decision 21, task D2): then its open
//   quotes move too (./reassign), each with an activity row.
// - Data sources is gone from the UI (plan U8); its route answers the manager only.

/**
 * A write the request can't make: 400 (bad input), 403 (not yours), 404 (no such customer, rep or
 * category) or 409 (refused as things stand, with a `code`: has_customers, task D1).
 */
export class SettingsError extends Error{
  /** `extra`: more for the response body, as a below-floor refusal's `fields` (plan U9). */
  constructor(message:string,readonly status:400|403|404|409=400,readonly code?:string,readonly extra?:Record<string,unknown>){super(message);this.name='SettingsError';}
}

export type SettingsRep=Pick<Rep,'id'|'name'|'initials'|'title'>;

/** One row of Rep assignments: a customer, its one rep, and its existing quotes by the rep they belong to. */
export interface AssignmentRow extends CustomerListItem {
  /** A placeholder customer (spec §2): name, account number and rep only, no history. */
  placeholder:boolean;
  /** The customer's quotes, counted by the rep each belongs to. Reassigning the customer never moves them. */
  quotes:{rep_id:string;rep_name:string;count:number}[];
}

/** One floor as Settings shows it. `label` is formatMargin's, the precision the warnings compare at. */
export interface FloorCell {category_id:string;category_name:string;margin_floor:number;label:string;updated_at:string}
export interface RepFloorSet {rep:SettingsRep;floors:FloorCell[]}

/**
 * What PUT /access answers: one customer's rules (or, customer_id null, every customer's), and `all`, the
 * rules over every customer, so the no-filter view (C_S1) follows a change made to one customer.
 */
export interface AccessSettings {customer_id:string|null;rules:AccessRule[];all:AccessRule[]}
/** Customer access searched or filtered (C_S1b): the matching customers and how many there are in all. */
export interface AccessTable {q:string;customers:AccessCustomer[];total:number}

export interface DataSources {database:DemoDatabase;erp:ERPStatus}

/** One organization margin floor as Settings shows it (C_S2): a fraction, with formatMargin's label. */
export interface OrgFloorCell extends OrgMarginFloor {label:string}

/** The manager's tabs (plan U8; C_S1 to C_S8). */
export interface ManagerSettings {
  /** Customer access with no filter (C_S1): one rule per data type over every customer. */
  access:AccessRule[];
  /** Customer access opened from a link for one customer (?customer=): searched for its name. Null otherwise. */
  accessTable:AccessTable|null;
  orgFloors:OrgFloorCell[];
  /** Every rep's own margins (the manager's included), by name: the read-only Rep margins review (C_S2, C_S3). */
  repMargins:RepFloorSet[];
  pricing:PricingSettings;
  /** Freight rates (spec §5.3), with the road factor applied to straight-line miles. */
  delivery:DeliveryRates;
  aging:AgingThresholds;
  /** Decision 48: a section whose flag is off does not render. */
  flags:FeatureFlags;
}

/**
 * A rep's own tabs (plan U9; C_RS1 to C_RS4) beside `mine` (their margins): the organization floors their
 * margins may not go below (Appendix B: reps read them), their profile and their notification switches.
 */
export interface OwnSettings {orgFloors:OrgFloorCell[];profile:RepProfileView;notifications:NotificationPrefs}

export interface RepSettings {
  rep_id:string;
  /** The manager's tabs; null for a rep, who gets none of their data. */
  manager:ManagerSettings|null;
  /** The signed-in rep's own margins ("margin floors" in the database: their floor per category). */
  mine:RepFloorSet;
  /** A rep's Margins, Profile and Notifications tabs; null for the manager, who keeps her four (plan U9). */
  own:OwnSettings|null;
}

const asRep=({id,name,initials,title}:Rep):SettingsRep=>({id,name,initials,title});
const toCell=({category_id,category_name,margin_floor,updated_at}:RepFloor):FloorCell=>({category_id,category_name,margin_floor,label:formatMargin(margin_floor),updated_at});
const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():undefined;

function body(input:unknown,message:string){
  if(!isRecord(input))throw new SettingsError(message);
  return input;
}

/**
 * Every customer by name with its rep, whether it's a placeholder, and its quotes by rep; with a
 * rep `reader`, only that rep's customers and their own quotes (task U1). The manager reads them all.
 */
export function assignmentRows(reader?:RepReader):AssignmentRow[]{
  const byCustomer=new Map<string,Map<string,{rep_id:string;rep_name:string;count:number}>>();
  for(const q of quotes({repId:reader?ownerFilter(reader):null})){
    const reps=byCustomer.get(q.customer_id)??new Map();
    const entry=reps.get(q.rep_id)??{rep_id:q.rep_id,rep_name:q.rep_name,count:0};
    entry.count++;reps.set(q.rep_id,entry);byCustomer.set(q.customer_id,reps);
  }
  return (reader?readableCustomers(reader):customers()).map(c=>{
    const account=customerAccount(c.id);
    return {...c,placeholder:!account||(account.terms===null&&account.credit_limit===null),
      quotes:[...(byCustomer.get(c.id)?.values()??[])].sort((a,b)=>b.count-a.count||a.rep_name.localeCompare(b.rep_name))};
  });
}

function floorSet(rep:Rep):RepFloorSet{return {rep:asRep(rep),floors:repFloors(rep.id).map(toCell)};}

const everyCustomer=()=>aggregateAccess(customerIds());
const accessFor=(customerId:string|null):AccessSettings=>{const all=everyCustomer();return {customer_id:customerId,rules:customerId?aggregateAccess([customerId]):all,all};};
const orgCells=():OrgFloorCell[]=>orgMarginFloors().map(f=>({...f,label:formatMargin(f.floor)}));

/** Settings > Data sources: the demo database and the ERP connection's recent sync events. No longer in the UI (plan U8); the manager's route only. */
export function dataSources():DataSources{return {database:demoDatabase(),erp:events(true)};}

/** Every rep's own margins, by name (the Rep margins review, plan U8). Manager only: the route checks. */
export function repMargins():RepFloorSet[]{return reps().map(floorSet);}

/** GET /api/rep/settings/org-floors: every category's organization floor. Manager only: the route checks. */
export function orgFloors():OrgFloorCell[]{return orgCells();}

/** Customer access searched or filtered (C_S1b): the matching customers, and the count of every customer. */
export function accessTable(filter:AccessFilter):AccessTable{
  return {q:filter.q?.trim()??'',customers:accessCustomers(filter),total:customerIds().length};
}

const STATES=['any','answers','not_shared'] as const;
/** The Customer access filter from a query string (?q=, ?items_stock=answers ...): a SettingsError for a state that is not Any, Querent answers or Not shared. */
export function accessFilter(params:URLSearchParams):AccessFilter{
  const filter:AccessFilter={q:params.get('q')??undefined};
  for(const category of ['items_stock','pricing','orders_quotes','account'] as const){
    const value=params.get(category);
    if(value===null)continue;
    if(!(STATES as readonly string[]).includes(value))throw new SettingsError('Invalid filter.');
    if(value!=='any')filter[category]=value as 'answers'|'not_shared';
  }
  return filter;
}

/** The manager's tabs (plan U8). `customerId`: Customer access opened for that customer, searched for its name. */
export function managerSettings(customerId:string|null=null):ManagerSettings{
  const linked=customerId?customers().find(c=>c.id===customerId):undefined;
  return {
    access:everyCustomer(),
    accessTable:linked?accessTable({q:linked.name}):null,
    orgFloors:orgCells(),
    repMargins:repMargins(),
    pricing:pricingSettings(),
    delivery:deliveryRates(),
    aging:agingThresholds(),
    flags:featureFlags(),
  };
}

/**
 * Everything Settings shows, for the signed-in rep (`manager`: they are the manager). The manager gets her
 * four tabs; a rep gets only their own: margins, profile and switches (Appendix B; OA-69; plan U9). `customerId` (the manager's ?customer=)
 * opens Customer access searched for that customer; an unknown id is ignored.
 */
export function repSettings(repId:string,{customerId=null,manager=false}:{customerId?:string|null;manager?:boolean}={}):RepSettings{
  const me=reps().find(r=>r.id===repId);
  return {
    rep_id:repId,
    manager:manager?managerSettings(customerId):null,
    mine:me?floorSet(me):{rep:{id:repId,name:repId,initials:'',title:''},floors:[]},
    own:manager||!me?null:{orgFloors:orgCells(),profile:profileView(repId),notifications:notificationPrefs(repId)},
  };
}

/** The statuses "Also move this customer's open quotes" moves: a sent quote only while it hasn't expired (effectiveStatus). */
const OPEN_STATUSES=['ready_for_review','changes_requested','sent'] as const;

/**
 * Rep assignments: PUT {customer_id, rep_id, moveOpenQuotes?}, the manager only (the route checks;
 * `managerId` is who logs the moves). Sets the customer's one rep; its existing quotes stay with
 * their rep, unless moveOpenQuotes is true: then its open quotes (ready_for_review,
 * changes_requested, sent and not past valid_until) move to the new rep in the same transaction
 * (moveQuotes: activity rows, quotes it already has skipped). Returns every row, updated, and what
 * moved (null without the checkbox).
 */
export function assignRep(managerId:string,input:unknown,{now=new Date().toISOString()}:{now?:string}={}):{assignments:AssignmentRow[];moved:ReassignResult|null}{
  const request=body(input,'Choose a customer and a rep.');
  const customerId=text(request.customer_id),repId=text(request.rep_id);
  if(!customerId||!repId)throw new SettingsError('Choose a customer and a rep.');
  const move=request.moveOpenQuotes??false;
  if(typeof move!=='boolean')throw new SettingsError('Tick “Also move this customer’s open quotes” or leave it clear.');
  if(!customerIds().includes(customerId))throw new SettingsError('Customer not found.',404);
  const rep=teamReps().find(r=>r.id===repId);
  if(!rep)throw new SettingsError('Rep not found.',404);
  if(move)expireOverdueQuotes({now});
  const moved=inTransaction(()=>{
    if(!rep.active||!setAssignedRep(customerId,repId))throw new SettingsError(`${rep.name} is inactive. Choose an active rep.`);
    if(!move)return null;
    const open=quotes({customerId,statuses:OPEN_STATUSES}).filter(q=>(OPEN_STATUSES as readonly string[]).includes(effectiveStatus(q,now)));
    return moveQuotes(managerId,open.map(q=>q.id),{id:rep.id,name:rep.name},{now});
  });
  return {assignments:assignmentRows(),moved};
}

/**
 * Customer access: PUT {customer_id, category, enabled}. customer_id null sets the category for
 * every customer (All customers). The chat tools read these on every call (spec §6.3).
 */
export function updateAccess(input:unknown):AccessSettings{
  const request=body(input,'Invalid setting.');
  const {customer_id:customer,category,enabled}=request;
  if(customer!==null&&typeof customer!=='string')throw new SettingsError('Invalid setting.');
  if(typeof category!=='string'||!isCategory(category)||typeof enabled!=='boolean')throw new SettingsError('Invalid setting.');
  if(customer!==null&&!customerIds().includes(customer))throw new SettingsError('Customer not found.',404);
  setAccess(customer,category,enabled);
  return accessFor(customer);
}

/** The floor range Settings accepts, in tenths of a percentage point: 0% to 99.9% (the database takes 0 to under 1). */
const MAX_FLOOR_TENTHS=999;
const FLOOR_RANGE='Enter a floor from 0% to 99.9%.';

/** A floor in percent as whole tenths of a point (300 for 30%), or a SettingsError outside 0% to 99.9%. */
function floorTenths(pct:unknown){
  // Checked before rounding: -0.01% to -0.05% would round to 0.0% and pass as a floor of zero.
  if(typeof pct!=='number'||!Number.isFinite(pct)||pct<0)throw new SettingsError(FLOOR_RANGE);
  // toPrecision drops float noise, as the floor rules do (29.95 * 10 is 299.49999999999994).
  const tenths=Math.round(Number((pct*10).toPrecision(12)));
  if(tenths<0||tenths>MAX_FLOOR_TENTHS)throw new SettingsError(FLOOR_RANGE);
  return tenths;
}

/** Below the organization floor (plan U9; C_RS3): its words, with the real floor. */
export const belowOrgFloor=(floor:number)=>`Below the ${formatMargin(floor)} organization floor. Pick ${formatMargin(floor)} or higher.`;

/**
 * A rep's own margins (Settings > Margins, C_RS1; "margin floors" in the database): PUT {rep_id?, category_id,
 * floor_pct} for one, or {rep_id?, floors:[{category_id, floor_pct}]} for several, stored together or none.
 * floor_pct is a percent (30 = 30%), stored to 0.1 percentage point, the precision margins are shown and
 * compared at (task 1.2), so the floor Settings shows is the one the warnings use. rep_id defaults to the
 * signed-in rep; anyone else's are refused (403) by setMyFloor before anything is written.
 *
 * Each margin must be at or above its category's organization floor, compared at that same precision
 * (Appendix C, enforced on write; plan U9): otherwise a 400 below_org_floor names every refused field,
 * `fields: [{category_id, floor, detail}]`, with C_RS3's sentence and the floor in force, checked and
 * written in one transaction so a floor raised meanwhile is the one compared with.
 */
export function updateMyFloor(actingRepId:string,input:unknown):RepFloorSet{
  const request=body(input,FLOOR_RANGE);
  const repId=request.rep_id===undefined?actingRepId:text(request.rep_id);
  const bulk=request.floors!==undefined;
  const items:unknown[]=bulk?(Array.isArray(request.floors)?request.floors:[]):[request];
  if(bulk&&!items.length)throw new SettingsError('Send at least one margin.');
  const seen=new Set<string>();
  const wanted=items.map(item=>{
    const row=typeof item==='object'&&item!==null&&!Array.isArray(item)?item as Record<string,unknown>:{};
    const categoryId=text(row.category_id);
    if(!repId||!categoryId)throw new SettingsError(bulk?'Choose a product category.':'Choose a rep and a product category.');
    const tenths=floorTenths(row.floor_pct);
    if(seen.has(categoryId))throw new SettingsError('Each category once.');
    seen.add(categoryId);
    return {categoryId,tenths};
  });
  try{
    inTransaction(()=>{
      if(!canEditFloor(actingRepId||null,repId!))throw new FloorPermissionError();
      const known=new Set(productCategories().map(c=>c.id));
      if(wanted.some(w=>!known.has(w.categoryId)))throw new SettingsError('Product category not found.',404);
      const org=new Map(orgMarginFloors().map(f=>[f.category_id,f.floor]));
      const fields=wanted.flatMap(({categoryId,tenths})=>{
        const floor=org.get(categoryId)??0;
        return tenths<Math.round(Number((floor*1000).toPrecision(12)))?[{category_id:categoryId,floor,detail:belowOrgFloor(floor)}]:[];
      });
      if(fields.length)throw new SettingsError(fields[0].detail,400,'below_org_floor',{fields});
      for(const {categoryId,tenths} of wanted)if(!setMyFloor(actingRepId||null,repId!,categoryId,tenths/1000))throw new SettingsError('Product category not found.',404);
    });
  }catch(error){
    if(error instanceof FloorPermissionError)throw new SettingsError(error.message,403);
    if(error instanceof RangeError)throw new SettingsError(FLOOR_RANGE);
    throw error;
  }
  const rep=reps().find(r=>r.id===repId)!;
  return floorSet(rep);
}

/**
 * Organization margin floors: PUT {floors:[{category_id, floor_pct}]} (plan U8), the manager only (the route
 * checks). Each floor_pct is a percent from 0 to 99.9, stored to 0.1 point like a rep's; every category at
 * most once; all are stored together or none. Returns every category's floor.
 */
export function updateOrgFloors(input:unknown):OrgFloorCell[]{
  const request=typeof input==='object'&&input!==null&&!Array.isArray(input)?input as Record<string,unknown>:{};
  const list=request.floors;
  if(!Array.isArray(list)||!list.length)throw new SettingsError('Send at least one floor.');
  const known=new Set(productCategories().map(c=>c.id)),seen=new Set<string>();
  const floors=list.map(item=>{
    const row=typeof item==='object'&&item!==null?item as Record<string,unknown>:{};
    const categoryId=text(row.category_id);
    if(!categoryId)throw new SettingsError('Choose a product category.');
    const tenths=floorTenths(row.floor_pct);
    if(seen.has(categoryId))throw new SettingsError('Each category once.');
    seen.add(categoryId);
    return {category_id:categoryId,floor:tenths/1000};
  });
  if(floors.some(f=>!known.has(f.category_id)))throw new SettingsError('Product category not found.',404);
  setOrgMarginFloors(floors);
  return orgCells();
}

/**
 * Delivery rates: PUT {base_fee, per_mile, min_charge, free_threshold, max_radius_miles,
 * road_factor}, all six. Draft quotes price freight with them from the next change on; a sent
 * quote keeps the freight it went out with (its snapshot). Any rep may change them, like the
 * scarcity uplift.
 */
export function updateDelivery(input:unknown):DeliveryRates{
  const {rates,problem}=checkDeliveryRates(input);
  if(!rates)throw new SettingsError(problem);
  return setDeliveryRates(rates);
}

/** Pricing: PUT {scarcity_uplift_enabled}. The pricing engine reads it each time it prices (priceLines, task 1.1). */
export function updatePricing(input:unknown):PricingSettings{
  const request=body(input,'Invalid setting.');
  if(typeof request.scarcity_uplift_enabled!=='boolean')throw new SettingsError('Invalid setting.');
  setScarcityUplift(request.scarcity_uplift_enabled);
  return pricingSettings();
}
