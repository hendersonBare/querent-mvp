import type {FreightRateSettings,PoolInputs} from '@/domain';
import {roundCents} from '@/lib/money';

// Recovery rate: the percentage pool and its ramp (spec §4.4, decisions 31 and 35). Pure: no
// server-only imports, no I/O; repository/freight.ts gathers the inputs and caches the pool daily.
//
//   pool_rate     = Σ modelled_freight_cents ÷ Σ goods_cents             (eligible quotes, whole bp)
//   base_rate     = count ≥ 20 ? pool_rate : starting_rate
//   capped_rate   = min(base_rate, rate_cap)
//   rate_in_force = round(capped_rate × ramp_step ÷ ramp_steps)           (whole bp, OA-21: linear)
//   ramp_step     = min(steps, floor(days_since_enabled ÷ (ramp_days ÷ steps)) + 1)
//
// Rates round to whole bp with roundCents (it rounds any fractional unit half away from zero).

/** Code defaults (spec §1.3, decision 31): 3.0% start, 8% rate and line caps, 3 steps over 90 days; 20 quotes in a 90-day window. */
export const POOL_DEFAULTS:FreightRateSettings&{minPoolCount:number;windowDays:number}={startingRateBp:300,rateCapBp:800,lineCapBp:800,rampSteps:3,rampDays:90,minPoolCount:20,windowDays:90};

/** The pool rate in whole bp, or null when there is nothing to divide (no eligible quote, or no goods value). */
export function poolRate({modelledCents,goodsCents,count}:PoolInputs){
  return count>0&&goodsCents>0?roundCents(modelledCents*10_000/goodsCents):null;
}

function checkSteps(steps:number){if(!Number.isInteger(steps)||steps<1)throw new RangeError(`Ramp steps must be a whole number of at least 1 (got ${steps}).`);}

const DAY_MS=86_400_000;

/**
 * The ramp step on `now` (ISO times): 0 when free delivery pricing was never enabled, else 1…steps by
 * whole days elapsed since `enabledAt`, in equal steps of days ÷ steps days (OA-21). A clock reading
 * before `enabledAt` counts as day 0.
 */
export function rampStep({enabledAt,now,steps,days}:{enabledAt:string|null;now:string;steps:number;days:number}){
  checkSteps(steps);
  if(!Number.isFinite(days)||days<=0)throw new RangeError(`Ramp days must be above 0 (got ${days}).`);
  if(enabledAt===null)return 0;
  const start=Date.parse(enabledAt),at=Date.parse(now);
  if(!Number.isFinite(start)||!Number.isFinite(at))throw new RangeError(`Ramp times must be ISO timestamps (got ${enabledAt}, ${now}).`);
  const elapsedDays=Math.max(0,Math.floor((at-start)/DAY_MS));
  // elapsed ÷ (days ÷ steps), written as elapsed × steps ÷ days so a fractional step length doesn't drift.
  return Math.min(steps,Math.floor(elapsedDays*steps/days)+1);
}

export interface RateInForceInput {
  /** The cached pool rate (null: nothing to divide). */
  poolBp:number|null;
  /** Eligible quotes in the window. */
  count:number;
  startingBp:number;capBp:number;
  /** 0 (not enabled) to steps. */
  step:number;steps:number;
}

/** The rate a new quote freezes, in whole bp: the pool rate once 20 quotes are in the window (else the starting rate), capped, then ramped. */
export function rateInForce({poolBp,count,startingBp,capBp,step,steps}:RateInForceInput){
  checkSteps(steps);
  if(!Number.isInteger(step)||step<0||step>steps)throw new RangeError(`The ramp step must be a whole number from 0 to ${steps} (got ${step}).`);
  const base=count>=POOL_DEFAULTS.minPoolCount&&poolBp!==null?poolBp:startingBp;
  return roundCents(Math.min(base,capBp)*step/steps);
}
