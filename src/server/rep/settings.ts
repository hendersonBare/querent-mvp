import 'server-only';
import type {CustomerListItem,DeliveryRates,PricingSettings,Rep,RepFloor,TeamRep} from '@/domain';
import type {AccessRule,ERPStatus} from '@/lib/contracts';
import {formatMargin} from '@/server/floors';
import {FloorPermissionError,setMyFloor} from '@/server/floors/service';
import {checkDeliveryRates} from '@/server/freight/rates';
import type {AgingThresholds} from '@/server/quotes/aging';
import {
  agingThresholds,aggregateAccess,customerAccount,customerIds,customers,deliveryRates,demoDatabase,events,isCategory,pricingSettings,quotes,repFloors,reps,setAccess,
  setAssignedRep,setDeliveryRates,setScarcityUplift,teamReps,type DemoDatabase,
} from '@/server/repository';

// Settings (spec §4, task 6.1) for the signed-in rep: Rep assignments, Customer access, My margin
// floors, Pricing (scarcity uplift), Delivery rates and Data sources. This module
// builds the page's data and checks every write before it reaches the repository. The routes
// under /api/rep/settings serve it to the supplier persona only (./http, repRoute).
//
// Who may change what (the demo has one supplier login, Brandi):
// - Rep assignments, Customer access, the scarcity uplift and the delivery rates: any rep session.
//   The spec doesn't say who may; this is the smallest reversible default, flagged for review.
// - Margin floors: each rep edits only their own (spec §5.2), through setMyFloor, which refuses
//   anyone else's before writing. Other reps' floors are read-only here.
// - Reps (team label, active) and Aging thresholds: the manager only (v3 spec §6, decisions 16, 20,
//   21; task D1). They come in `manager`, null for a rep, and save through managerRoute (./team).
// An inactive rep can't be given a customer (they must have none, decision 21).
// Reassigning a customer never moves its quotes: a quote keeps the rep it was requested for
// (spec §4, §5.2), so the old rep's Quotes list and badge keep them, and their floor warnings keep
// using the old rep's floors. Quotes requested afterwards, the customer's rep card (sidebar,
// clarification) and chat's "call your rep" all follow the new assignment, since they read it live.

/**
 * A write the request can't make: 400 (bad input), 403 (not yours), 404 (no such customer, rep or
 * category) or 409 (refused as things stand, with a `code`: has_customers, task D1).
 */
export class SettingsError extends Error{
  constructor(message:string,readonly status:400|403|404|409=400,readonly code?:string){super(message);this.name='SettingsError';}
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

/** Customer access for the "Viewing" picker: one customer, or every customer (customer_id null). */
export interface AccessSettings {customer_id:string|null;rules:AccessRule[]}

export interface DataSources {database:DemoDatabase;erp:ERPStatus}

/** What only the manager sees in Settings (task D1): the Reps card and the Aging thresholds card. */
export interface ManagerSettings {reps:TeamRep[];aging:AgingThresholds}

export interface RepSettings {
  rep_id:string;
  /** The Reps and Aging tabs' data for the manager; null for a rep, who doesn't get those tabs. */
  manager:ManagerSettings|null;
  /** Every active rep, by name: the assignment dropdown's options. */
  reps:SettingsRep[];
  assignments:AssignmentRow[];
  access:AccessSettings;
  floors:{mine:RepFloorSet;others:RepFloorSet[]};
  pricing:PricingSettings;
  /** Freight rates (spec §5.3), with the road factor applied to straight-line miles. Any rep can change them. */
  delivery:DeliveryRates;
  sources:DataSources;
}

const asRep=({id,name,initials,title}:Rep):SettingsRep=>({id,name,initials,title});
const toCell=({category_id,category_name,margin_floor,updated_at}:RepFloor):FloorCell=>({category_id,category_name,margin_floor,label:formatMargin(margin_floor),updated_at});
const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const text=(value:unknown)=>typeof value==='string'&&value.trim()?value.trim():undefined;

function body(input:unknown,message:string){
  if(!isRecord(input))throw new SettingsError(message);
  return input;
}

/** Every customer by name with its rep, whether it's a placeholder, and its quotes by rep. */
export function assignmentRows():AssignmentRow[]{
  const byCustomer=new Map<string,Map<string,{rep_id:string;rep_name:string;count:number}>>();
  for(const q of quotes()){
    const reps=byCustomer.get(q.customer_id)??new Map();
    const entry=reps.get(q.rep_id)??{rep_id:q.rep_id,rep_name:q.rep_name,count:0};
    entry.count++;reps.set(q.rep_id,entry);byCustomer.set(q.customer_id,reps);
  }
  return customers().map(c=>{
    const account=customerAccount(c.id);
    return {...c,placeholder:!account||(account.terms===null&&account.credit_limit===null),
      quotes:[...(byCustomer.get(c.id)?.values()??[])].sort((a,b)=>b.count-a.count||a.rep_name.localeCompare(b.rep_name))};
  });
}

function floorSet(rep:Rep):RepFloorSet{return {rep:asRep(rep),floors:repFloors(rep.id).map(toCell)};}

/** The picked customer's id, or null for All customers; an unknown id reads as All customers, as the picker does. */
const pickedCustomer=(customerId:string|null|undefined)=>customerId&&customerIds().includes(customerId)?customerId:null;

function accessFor(customerId:string|null):AccessSettings{
  return {customer_id:customerId,rules:aggregateAccess(customerId?[customerId]:customerIds())};
}

/** Settings > Data sources: the demo database and the ERP connection's recent sync events. */
export function dataSources():DataSources{return {database:demoDatabase(),erp:events(true)};}

/** The manager's Reps and Aging thresholds cards (task D1). */
export function managerSettings():ManagerSettings{return {reps:teamReps(),aging:agingThresholds()};}

/** Everything Settings shows, for the signed-in rep (`manager`: they are the manager) and the "Viewing" picker. */
export function repSettings(repId:string,{customerId=null,manager=false}:{customerId?:string|null;manager?:boolean}={}):RepSettings{
  const everyone=reps();
  const me=everyone.find(r=>r.id===repId);
  return {
    rep_id:repId,
    manager:manager?managerSettings():null,
    reps:reps({activeOnly:true}).map(asRep),
    assignments:assignmentRows(),
    access:accessFor(pickedCustomer(customerId)),
    floors:{
      mine:me?floorSet(me):{rep:{id:repId,name:repId,initials:'',title:''},floors:[]},
      others:everyone.filter(r=>r.id!==repId).map(floorSet),
    },
    pricing:pricingSettings(),
    delivery:deliveryRates(),
    sources:dataSources(),
  };
}

/**
 * Rep assignments: PUT {customer_id, rep_id}. Sets the customer's one rep; its existing quotes
 * stay with the rep they were requested for. Returns every row, updated.
 */
export function assignRep(input:unknown):{assignments:AssignmentRow[]}{
  const request=body(input,'Choose a customer and a rep.');
  const customerId=text(request.customer_id),repId=text(request.rep_id);
  if(!customerId||!repId)throw new SettingsError('Choose a customer and a rep.');
  if(!customerIds().includes(customerId))throw new SettingsError('Customer not found.',404);
  const rep=teamReps().find(r=>r.id===repId);
  if(!rep)throw new SettingsError('Rep not found.',404);
  if(!rep.active||!setAssignedRep(customerId,repId))throw new SettingsError(`${rep.name} is inactive. Choose an active rep.`);
  return {assignments:assignmentRows()};
}

/**
 * Customer access: PUT {customer_id, category, enabled}. customer_id null sets the category for
 * every customer (the picker's All customers). The chat tools read these on every call (spec §6.3).
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

/**
 * My margin floors: PUT {rep_id?, category_id, floor_pct}. floor_pct is a percent (30 = 30%),
 * stored to 0.1 percentage point, the precision margins are shown and compared at (task 1.2), so
 * the floor Settings shows is the one the warnings use. rep_id defaults to the signed-in rep;
 * anyone else's floors are refused (403) by setMyFloor before anything is written.
 */
export function updateMyFloor(actingRepId:string,input:unknown):RepFloorSet{
  const request=body(input,FLOOR_RANGE);
  const repId=request.rep_id===undefined?actingRepId:text(request.rep_id);
  const categoryId=text(request.category_id);
  if(!repId||!categoryId)throw new SettingsError('Choose a rep and a product category.');
  const pct=request.floor_pct;
  // Checked before rounding: -0.01% to -0.05% would round to 0.0% and pass as a floor of zero.
  if(typeof pct!=='number'||!Number.isFinite(pct)||pct<0)throw new SettingsError(FLOOR_RANGE);
  // toPrecision drops float noise, as the floor rules do (29.95 * 10 is 299.49999999999994).
  const tenths=Math.round(Number((pct*10).toPrecision(12)));
  if(tenths<0||tenths>MAX_FLOOR_TENTHS)throw new SettingsError(FLOOR_RANGE);
  let saved;
  try{saved=setMyFloor(actingRepId||null,repId,categoryId,tenths/1000);}
  catch(error){
    if(error instanceof FloorPermissionError)throw new SettingsError(error.message,403);
    if(error instanceof RangeError)throw new SettingsError(FLOOR_RANGE);
    throw error;
  }
  if(!saved)throw new SettingsError('Product category not found.',404);
  const rep=reps().find(r=>r.id===repId)!;
  return floorSet(rep);
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
