import type {FreightCostSettings,FuelType} from '@/domain';
import {roundCents} from '@/lib/money';

// Modelled delivery cost (spec §4.2, decision 29). Pure: no server-only imports, no I/O. There is no
// delivery log, so each delivery is modelled from the manager's inputs (Pricing & Delivery):
//
//   round_trip   = 2 × miles                       (miles: DistanceProvider road miles, to 0.1 mi)
//   drive_hours  = round_trip ÷ avg_speed_mph
//   fuel         = round_trip ÷ mpg × fuel_price
//   wear         = round_trip × wear_per_mile
//   depreciation = round_trip × depreciation_per_mile
//   driver       = (drive_hours + stop_minutes ÷ 60) × driver_per_hour
//   cents        = roundCents(fuel + wear + depreciation + driver)   (components unrounded, one rounding)
//
// TODO(R-10): a routing API for real road miles and drive time; today miles are haversine × road
// factor (DistanceProvider) and drive time comes from the average speed.
// TODO(R-11): fleet onboarding to prefill MPG and the vehicle inputs; today a manager types them in.

/** Code defaults for the cost-model settings (spec §1.3). Placeholders for the demo (OA-4). */
export const COST_MODEL_DEFAULTS:FreightCostSettings={mpg:10,fuelType:'gasoline',wearCentsPerMile:20,depreciationCentsPerMile:15,driverCentsPerHour:2500,avgSpeedMph:35,stopMinutes:0,fuelManualCents:null};

export interface CostModelInput {
  /** One-way road miles from the branch to the ship-to. */
  miles:number;
  mpg:number;
  /** Cents per gallon (modelFuelPriceCents). */
  fuelPriceCents:number;
  wearCentsPerMile:number;depreciationCentsPerMile:number;driverCentsPerHour:number;avgSpeedMph:number;
  /** Stop or unload time per delivery (default 0). */
  stopMinutes:number;
}

export interface CostModelResult {
  /** The modelled cost of one delivery, in integer cents. */
  cents:number;
  /** Each component in unrounded cents. */
  components:{fuel:number;wear:number;depreciation:number;driver:number};
  roundTripMiles:number;
  /** Driving time only (the stop is added for the driver's wage, not here). */
  driveHours:number;
}

/** Throws a RangeError naming the input unless `value` is finite and at least 0 (or above 0 when `positive`). */
function check(label:string,value:number,positive=false){
  if(!Number.isFinite(value)||value<0||(positive&&value===0))throw new RangeError(`${label} must be a number ${positive?'above':'of at least'} 0 (got ${value}).`);
}

/** The modelled cost of one delivery `miles` road miles away. Throws a RangeError on an input the formula can't use. */
export function modelledDeliveryCost(input:CostModelInput):CostModelResult{
  const {miles,mpg,fuelPriceCents,wearCentsPerMile,depreciationCentsPerMile,driverCentsPerHour,avgSpeedMph,stopMinutes}=input;
  check('Road miles',miles);check('Vehicle MPG',mpg,true);check('Average speed (mph)',avgSpeedMph,true);check('The fuel price',fuelPriceCents);
  check('Wear per mile',wearCentsPerMile);check('Depreciation per mile',depreciationCentsPerMile);check('Driver pay per hour',driverCentsPerHour);check('Stop time',stopMinutes);
  const roundTripMiles=2*miles,driveHours=roundTripMiles/avgSpeedMph;
  const components={
    fuel:roundTripMiles/mpg*fuelPriceCents,
    wear:roundTripMiles*wearCentsPerMile,
    depreciation:roundTripMiles*depreciationCentsPerMile,
    driver:(driveHours+stopMinutes/60)*driverCentsPerHour,
  };
  return {cents:roundCents(components.fuel+components.wear+components.depreciation+components.driver),components,roundTripMiles,driveHours};
}

/**
 * The fuel price the model uses, in cents per gallon (spec §4.3, decision 30): a manual price always
 * wins; otherwise gasoline uses the stored price for the branch's state, and diesel (no confirmed
 * state diesel price) is $0. No price at all gives 0, and Pricing & Delivery warns about it (C3).
 */
export function modelFuelPriceCents({fuelType,manualCents,gasolineCents}:{fuelType:FuelType;manualCents:number|null;gasolineCents:number|null}){
  if(manualCents!==null)return manualCents;
  return fuelType==='gasoline'?gasolineCents??0:0;
}
