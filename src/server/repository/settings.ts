import 'server-only';
import type {DeliveryRates,PricingSettings,RepFloor} from '@/domain';
import {all,nowIso,one,run,scalar} from './sql';

/** Pricing settings (Settings > Pricing). Scarcity uplift is off by default (spec §5.1). */
export function pricingSettings():PricingSettings{
  return {scarcity_uplift_enabled:scalar<string>("SELECT value FROM settings WHERE key='scarcity_uplift_enabled'")==='true'};
}
export function setScarcityUplift(enabled:boolean){
  run("INSERT INTO settings(key,value) VALUES('scarcity_uplift_enabled',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",String(enabled));
}

/** Freight rates (spec §5.3): seeded, edited on Settings > Pricing & delivery. */
export function deliveryRates(){return one<DeliveryRates>('SELECT base_fee,per_mile,min_charge,free_threshold,max_radius_miles,road_factor FROM delivery_rates ORDER BY rowid LIMIT 1')!;}

/** Settings > Pricing & delivery: replaces the delivery rates (one row). */
export function setDeliveryRates(rates:DeliveryRates){
  run('UPDATE delivery_rates SET base_fee=?,per_mile=?,min_charge=?,free_threshold=?,max_radius_miles=?,road_factor=? WHERE rowid=(SELECT rowid FROM delivery_rates ORDER BY rowid LIMIT 1)',
    rates.base_fee,rates.per_mile,rates.min_charge,rates.free_threshold,rates.max_radius_miles,rates.road_factor);
  return deliveryRates();
}

const FLOOR='SELECT f.rep_id,f.category_id,c.name category_name,f.margin_floor,f.updated_at FROM rep_category_floors f JOIN product_categories c ON c.id=f.category_id';

/** A rep's margin floor per product category (Settings > My margin floors). */
export function repFloors(repId:string){return all<RepFloor>(`${FLOOR} WHERE f.rep_id=? ORDER BY c.sort_order`,repId);}

/** The floor for (rep x category) as a fraction, or undefined if none is stored (task 1.2 picks the fallback). */
export function floorFor(repId:string,categoryId:string){return scalar<number>('SELECT margin_floor FROM rep_category_floors WHERE rep_id=? AND category_id=?',repId,categoryId);}

/**
 * Sets one of the acting rep's own floors. Pass the logged-in rep's id: there is deliberately
 * no way to change another rep's floors (spec §5.2). Returns undefined if the category has no floor row.
 */
export function updateOwnFloor(repId:string,categoryId:string,marginFloor:number,at=nowIso()){
  if(!Number.isFinite(marginFloor)||marginFloor<0||marginFloor>=1)throw new RangeError(`A margin floor must be at least 0 and below 1 (got ${marginFloor}).`);
  run('UPDATE rep_category_floors SET margin_floor=?,updated_at=? WHERE rep_id=? AND category_id=?',marginFloor,at,repId,categoryId);
  return one<RepFloor>(`${FLOOR} WHERE f.rep_id=? AND f.category_id=?`,repId,categoryId);
}
