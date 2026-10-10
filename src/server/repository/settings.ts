import 'server-only';
import {FUEL_TYPES,type DeliveryRates,type FreeDeliverySettings,type FreightCostSettings,type FreightRateSettings,type FuelType,type PricingSettings,type RepFloor} from '@/domain';
import {COST_MODEL_DEFAULTS} from '../freight/cost-model';
import {POOL_DEFAULTS} from '../freight/pool';
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

// ---- Free delivery pricing (spec §1.3). Each getter falls back to the code default, kept next to the
// logic that uses it, when the key is absent or unreadable. Setters arrive with the manager's controls (C3).

const setting=(key:string)=>scalar<string>('SELECT value FROM settings WHERE key=?',key);
/** A stored number, or `fallback` when the key is absent, blank or not a finite number. */
function numberSetting(key:string,fallback:number):number;
function numberSetting(key:string,fallback:null):number|null;
function numberSetting(key:string,fallback:number|null){
  const value=setting(key)?.trim();
  const parsed=value?Number(value):Number.NaN;
  return Number.isFinite(parsed)?parsed:fallback;
}

/** The free delivery pricing toggle (default off) and when it was enabled (the ramp's day 0). */
export function freeDeliverySettings():FreeDeliverySettings{
  return {enabled:setting('free_delivery_pricing')==='true',enabledAt:setting('free_delivery_enabled_at')||null};
}

/** The modelled delivery cost inputs (spec §4.2). */
export function freightCostSettings():FreightCostSettings{
  const d=COST_MODEL_DEFAULTS,fuelType=setting('freight_fuel_type');
  return {
    mpg:numberSetting('freight_vehicle_mpg',d.mpg),
    fuelType:(FUEL_TYPES as readonly string[]).includes(fuelType??'')?fuelType as FuelType:d.fuelType,
    wearCentsPerMile:numberSetting('freight_wear_cents_per_mile',d.wearCentsPerMile),
    depreciationCentsPerMile:numberSetting('freight_depreciation_cents_per_mile',d.depreciationCentsPerMile),
    driverCentsPerHour:numberSetting('freight_driver_cents_per_hour',d.driverCentsPerHour),
    avgSpeedMph:numberSetting('freight_avg_speed_mph',d.avgSpeedMph),
    stopMinutes:numberSetting('freight_stop_minutes',d.stopMinutes),
    fuelManualCents:numberSetting('freight_fuel_manual_cents',null),
  };
}

/** The recovery rate's starting rate, caps and ramp (spec §4.4, §4.5). */
export function freightRateSettings():FreightRateSettings{
  const d=POOL_DEFAULTS;
  return {
    startingRateBp:numberSetting('freight_starting_rate_bp',d.startingRateBp),
    rateCapBp:numberSetting('freight_rate_cap_bp',d.rateCapBp),
    lineCapBp:numberSetting('freight_line_cap_bp',d.lineCapBp),
    rampSteps:numberSetting('freight_ramp_steps',d.rampSteps),
    rampDays:numberSetting('freight_ramp_days',d.rampDays),
  };
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
