import 'server-only';
import {FUEL_TYPES,type DeliveryRates,type FreeDeliverySettings,type FreightCostSettings,type FreightRateSettings,type FuelType,type PricingSettings,type RepFloor} from '@/domain';
import {COST_MODEL_DEFAULTS} from '../freight/cost-model';
import {AGING_DEFAULTS,type AgingThresholds} from '../quotes/aging';
import {POOL_DEFAULTS} from '../freight/pool';
import {all,inTransaction,nowIso,one,run,scalar} from './sql';

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
// logic that uses it, when the key is absent or unreadable. The setters below serve the manager's controls (C3).

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

const writeSetting=(key:string,value:string)=>run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,value);

/**
 * Turns free delivery pricing on or off (C3; managers only, the route checks). Turning it on records
 * `at` as free_delivery_enabled_at, the ramp's day 0; turning it off clears nothing else.
 */
export function setFreeDeliveryPricing(enabled:boolean,at=nowIso()){
  inTransaction(()=>{writeSetting('free_delivery_pricing',String(enabled));if(enabled)writeSetting('free_delivery_enabled_at',at);});
  return freeDeliverySettings();
}

/** When a manager last viewed the impact preview (free_delivery_preview_viewed_at), or null. */
export function freightPreviewViewedAt(){return setting('free_delivery_preview_viewed_at')||null;}
export function setFreightPreviewViewedAt(at=nowIso()){writeSetting('free_delivery_preview_viewed_at',at);}

/** The freight_* key behind each cost-model input and rate setting (spec §1.3). */
const COST_KEYS:Readonly<Record<keyof FreightCostSettings,string>>={
  mpg:'freight_vehicle_mpg',fuelType:'freight_fuel_type',wearCentsPerMile:'freight_wear_cents_per_mile',depreciationCentsPerMile:'freight_depreciation_cents_per_mile',
  driverCentsPerHour:'freight_driver_cents_per_hour',avgSpeedMph:'freight_avg_speed_mph',stopMinutes:'freight_stop_minutes',fuelManualCents:'freight_fuel_manual_cents',
};
const RATE_KEYS:Readonly<Record<keyof FreightRateSettings,string>>={
  startingRateBp:'freight_starting_rate_bp',rateCapBp:'freight_rate_cap_bp',lineCapBp:'freight_line_cap_bp',rampSteps:'freight_ramp_steps',rampDays:'freight_ramp_days',
};

/** Stores the given cost-model inputs (already checked: checkFreightUpdate). fuelManualCents null removes the manual price. */
export function setFreightCostSettings(cost:Partial<FreightCostSettings>){
  inTransaction(()=>{
    for(const [field,value] of Object.entries(cost)){
      const key=COST_KEYS[field as keyof FreightCostSettings];
      if(!key)throw new RangeError(`Not a cost-model setting: ${field}`);
      if(value===null)run('DELETE FROM settings WHERE key=?',key);else writeSetting(key,String(value));
    }
  });
  return freightCostSettings();
}

/** Stores the given starting rate, caps and ramp (already checked: checkFreightUpdate). */
export function setFreightRateSettings(rates:Partial<FreightRateSettings>){
  inTransaction(()=>{
    for(const [field,value] of Object.entries(rates)){
      const key=RATE_KEYS[field as keyof FreightRateSettings];
      if(!key)throw new RangeError(`Not a recovery rate setting: ${field}`);
      writeSetting(key,String(value));
    }
  });
  return freightRateSettings();
}

/** The aging_* keys behind each threshold (spec §1.3). */
const AGING_KEYS:Readonly<Record<keyof AgingThresholds,string>>={
  rfrAmberH:'aging_rfr_amber_h',rfrRedH:'aging_rfr_red_h',crAmberH:'aging_cr_amber_h',crRedH:'aging_cr_red_h',sentAmberH:'aging_sent_amber_h',sentRedH:'aging_sent_red_h',
};

/**
 * The aging thresholds in hours (v3 spec §1.3, §3; decision 16): the six aging_* keys, each falling
 * back to its code default when absent, unreadable, zero or negative. Managers edit them (setAgingThresholds, D1).
 */
export function agingThresholds():AgingThresholds{
  const d=AGING_DEFAULTS;
  const hours=(key:string,fallback:number)=>{const value=numberSetting(key,fallback);return value>0?value:fallback;};
  return {
    rfrAmberH:hours(AGING_KEYS.rfrAmberH,d.rfrAmberH),rfrRedH:hours(AGING_KEYS.rfrRedH,d.rfrRedH),
    crAmberH:hours(AGING_KEYS.crAmberH,d.crAmberH),crRedH:hours(AGING_KEYS.crRedH,d.crRedH),
    sentAmberH:hours(AGING_KEYS.sentAmberH,d.sentAmberH),sentRedH:hours(AGING_KEYS.sentRedH,d.sentRedH),
  };
}

/** Stores all six aging thresholds (already checked: checkAgingThresholds), in one transaction. Managers only (D1, the route checks). */
export function setAgingThresholds(thresholds:AgingThresholds){
  inTransaction(()=>{
    for(const [field,key] of Object.entries(AGING_KEYS))run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',key,String(thresholds[field as keyof AgingThresholds]));
  });
  return agingThresholds();
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
