import type Database from 'better-sqlite3';
import {INFO_CATEGORIES} from '../schema';
import {BRANCHES,BRANDI_FLOORS,CONTRACTS,DANA,DEFAULT_FLOOR,DELIVERY_RATES,DEPARTMENTS,PLACEHOLDER_CUSTOMERS,PRICE_LEVEL,REPS,SETTINGS,SUPPLIER,WASATCH,WASATCH_REP} from './accounts';
import {CATALOG,CATEGORIES,INBOUND} from './catalog';
import {addDays} from './dates';
import {erp,type Insert} from './insert';

export interface SeedContext{insert:Insert;anchor:string;syncedAt:string}

/** Supplier, settings, branches, catalog, stock, prices, contracts, customers, reps, floors, departments, rates, access. */
export function seedReference({insert,anchor,syncedAt}:SeedContext){
  const sync=(externalId:string)=>erp(externalId,syncedAt);
  insert('suppliers',SUPPLIER);
  for(const [key,value] of Object.entries(SETTINGS))insert('settings',{key,value});

  for(const b of BRANCHES)insert('branches',{id:b.id,code:b.code,name:b.name,address:b.address,city:b.city,state:b.state,zip:b.zip,lat:b.lat,lng:b.lng,will_call_phone:b.phone,will_call_hours:b.hours,...sync(b.code)});
  CATEGORIES.forEach((c,i)=>insert('product_categories',{id:c.id,name:c.name,sort_order:i+1,...sync(c.id)}));
  for(const item of CATALOG){
    insert('items',{id:item.sku,sku:item.sku,description:item.description,category_id:item.category,pack:item.pack,case_qty:item.caseQty,cost:item.cost,list_price:item.list,keywords:item.keywords,...sync(item.sku)});
    BRANCHES.forEach((b,i)=>{
      const inbound=INBOUND.find(([sku,branch])=>sku===item.sku&&branch===b.id);
      insert('branch_stock',{item_id:item.sku,branch_id:b.id,available:item.stock[i],on_order:inbound?.[2]??0,next_receipt_on:inbound?addDays(anchor,inbound[3]):null,...sync(`${item.sku}@${b.code}`)});
    });
  }

  insert('price_levels',{...PRICE_LEVEL,...sync(PRICE_LEVEL.code)});
  for(const item of CATALOG)insert('customer_prices',{id:`${PRICE_LEVEL.id}:${item.sku}`,price_level_id:PRICE_LEVEL.id,item_id:item.sku,unit_price:item.customer,...sync(`${PRICE_LEVEL.code}:${item.sku}`)});

  // role and team are 006_roles columns, set by seedRepRoles once they exist.
  for(const {role:_role,team:_team,...r} of REPS)insert('reps',{...r,...sync(`REP-${r.initials}`)});
  insert('customers',{...WASATCH,...sync(WASATCH.account_number)});
  insert('contacts',{...DANA,...sync(`${WASATCH.account_number}:${DANA.id}`)});
  insert('customer_rep',{customer_id:WASATCH.id,rep_id:WASATCH_REP});
  for(const p of PLACEHOLDER_CUSTOMERS){
    insert('customers',{id:p.id,account_number:p.account_number,name:p.name,...sync(p.account_number)});
    insert('customer_rep',{customer_id:p.id,rep_id:p.rep});
  }
  for(const c of CONTRACTS){
    insert('contracts',{id:c.id,customer_id:WASATCH.id,contract_number:c.contract_number,name:c.name,starts_on:addDays(anchor,c.starts),ends_on:addDays(anchor,c.ends),...sync(c.contract_number)});
    for(const [sku,price] of c.lines)insert('contract_lines',{id:`${c.id}:${sku}`,contract_id:c.id,item_id:sku,unit_price:price,...sync(`${c.contract_number}:${sku}`)});
  }

  for(const r of REPS)for(const c of CATEGORIES)insert('rep_category_floors',{rep_id:r.id,category_id:c.id,margin_floor:(r.id==='brandi'?BRANDI_FLOORS[c.id]:undefined)??DEFAULT_FLOOR,updated_at:syncedAt});
  DEPARTMENTS.forEach((d,i)=>insert('departments',{...d,sort_order:i+1}));
  insert('delivery_rates',DELIVERY_RATES);
  for(const id of [WASATCH.id,...PLACEHOLDER_CUSTOMERS.map(p=>p.id)])for(const category of INFO_CATEGORIES)insert('access',{customer_id:id,category,enabled:1});
}

/**
 * Each rep's role and team label (006_roles; v3 spec §8, decision 20; task D1): Brandi is the manager.
 * A database built at the v4 schema (the adoption test's fixture) has no such columns yet: there
 * 006's own UPDATE makes Brandi the manager when it runs.
 */
export function seedRepRoles(database:Database.Database){
  if(!database.prepare("SELECT 1 FROM pragma_table_info('reps') WHERE name='role'").get())return;
  const update=database.prepare('UPDATE reps SET role=?,team=? WHERE id=?');
  for(const r of REPS)update.run(r.role,r.team,r.id);
}

/** The seeded fuel price (v3 spec §4.3, OA-4): UT gasoline at $3.40/gal, so the offline demo and CI never need OilPriceAPI. */
export const SEED_FUEL_PRICES=[{state:'UT',fuel:'gasoline',price_cents:340}] as const;

/**
 * The seeded fuel prices (008_fuel_prices; task C3), as of the seed date and counted as fetched that
 * day. A database built at the v4 schema (the adoption test's fixture) has no such table yet.
 */
export function seedFuelPrices(database:Database.Database,anchor:string){
  if(!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='fuel_prices'").get())return;
  const insert=database.prepare("INSERT INTO fuel_prices(state,fuel,price_cents,as_of,source,fetched_on) VALUES(?,?,?,?,'seed',?)");
  for(const p of SEED_FUEL_PRICES)insert.run(p.state,p.fuel,p.price_cents,`${anchor}T00:00:00.000Z`,anchor);
}
