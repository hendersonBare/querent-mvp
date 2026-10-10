// Free delivery pricing: the modelled delivery cost inputs and the percentage pool (spec §1.3, §4.2,
// §4.4; decisions 29–31, 35). Internal only: none of this may reach a customer (spec §4.6).

export const FUEL_TYPES=['gasoline','diesel'] as const;
export type FuelType=(typeof FUEL_TYPES)[number];

/** The manager's cost-model inputs (Pricing & Delivery). Cents may be fractional; fuelManualCents null = unset. */
export interface FreightCostSettings {
  mpg:number;fuelType:FuelType;wearCentsPerMile:number;depreciationCentsPerMile:number;driverCentsPerHour:number;avgSpeedMph:number;stopMinutes:number;
  /** A manual fuel price in cents per gallon; when set it always wins (decision 30). */
  fuelManualCents:number|null;
}

/** Starting rate, caps and ramp for the recovery rate, in bp and days. */
export interface FreightRateSettings {startingRateBp:number;rateCapBp:number;lineCapBp:number;rampSteps:number;rampDays:number}

/** The free delivery pricing toggle and when it was last turned on (the ramp's day 0). */
export interface FreeDeliverySettings {enabled:boolean;enabledAt:string|null}

/** Sums over the eligible quotes of the trailing pool window, in integer cents. */
export interface PoolInputs {modelledCents:number;goodsCents:number;count:number}

/**
 * The cached pool (freight_pool_* settings): the computed rate in bp (null when there is nothing to
 * divide), whether enough quotes are in the window to use it over the starting rate, and the UTC day it was computed.
 */
export interface FreightPool {rateBp:number|null;on:boolean;count:number;computedOn:string}
