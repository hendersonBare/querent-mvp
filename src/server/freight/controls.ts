import {FUEL_TYPES,type FreightCostSettings,type FreightRateSettings,type FuelType} from '@/domain';
import {roundCents} from '@/lib/money';

// The manager's free delivery pricing controls (v3 spec §1.3, §4.4, §5 "GET/PUT
// /api/rep/settings/freight"; decisions 28, 29, 31, 35; OA-41). Pure and client-safe: Pricing &
// delivery checks what the manager types with checkFreightUpdate, and the route checks it again
// before anything is stored. Money is cents (fractional cents allowed for per-mile inputs), rates
// are whole bp; messages name the field in the units the manager types (dollars, percent).

type CostField=Exclude<keyof FreightCostSettings,'fuelType'>;
type Unit='mpg'|'mph'|'cents'|'minutes'|'bp'|'count';

/** A field's range and how its message reads. `positive`: above `min` (0), not at it. `integer`: whole numbers only. */
export interface FreightLimit {label:string;min:number;max:number;unit:Unit;positive?:boolean;integer?:boolean}

/** The cost-model inputs' ranges (spec §4.2): MPG and speed above 0, money and stop time 0 or more, with sane tops. */
export const COST_LIMITS:Readonly<Record<CostField,FreightLimit>>={
  mpg:{label:'Vehicle MPG',min:0,max:200,unit:'mpg',positive:true},
  avgSpeedMph:{label:'Average speed',min:0,max:100,unit:'mph',positive:true},
  wearCentsPerMile:{label:'Wear per mile',min:0,max:1000,unit:'cents'},
  depreciationCentsPerMile:{label:'Depreciation per mile',min:0,max:1000,unit:'cents'},
  driverCentsPerHour:{label:'Driver pay per hour',min:0,max:50_000,unit:'cents'},
  stopMinutes:{label:'Stop time',min:0,max:480,unit:'minutes'},
  fuelManualCents:{label:'Manual fuel price',min:0,max:2000,unit:'cents'},
};

/** The recovery rate settings' ranges (spec §4.4): rates and caps 0% to 50% in whole bp, 1 to 12 steps over 1 to 730 days. */
export const RATE_LIMITS:Readonly<Record<keyof FreightRateSettings,FreightLimit>>={
  startingRateBp:{label:'Starting rate',min:0,max:5000,unit:'bp',integer:true},
  rateCapBp:{label:'Rate cap',min:0,max:5000,unit:'bp',integer:true},
  lineCapBp:{label:'Per-line cap',min:0,max:5000,unit:'bp',integer:true},
  rampSteps:{label:'Ramp steps',min:1,max:12,unit:'count',integer:true},
  rampDays:{label:'Ramp days',min:1,max:730,unit:'count',integer:true},
};
export const COST_FIELDS=Object.keys(COST_LIMITS) as CostField[];
export const RATE_FIELDS=Object.keys(RATE_LIMITS) as (keyof FreightRateSettings)[];

/** What a PUT may change: the toggle, any cost inputs, any rate settings. */
export interface FreightUpdate {enabled?:boolean;cost?:Partial<FreightCostSettings>;rates?:Partial<FreightRateSettings>}
export type FreightUpdateCheck={update:FreightUpdate;problem:null}|{update:null;problem:string};

const dollars=(cents:number)=>`$${(cents/100).toFixed(2)}`;
const percent=(bp:number)=>`${bp/100}%`;

/** The message for a value outside its range, in the units the manager types. */
export function limitProblem({label,min,max,unit,positive,integer}:FreightLimit){
  if(positive)return `${label} must be above ${min} and at most ${max}${unit==='mph'?' mph':''}.`;
  switch(unit){
    case 'cents':return `${label} must be from ${dollars(min)} to ${dollars(max)}.`;
    case 'bp':return `${label} must be from ${percent(min)} to ${percent(max)}.`;
    case 'minutes':return `${label} must be from ${min} to ${max} minutes.`;
    default:return integer?`${label} must be a whole number from ${min} to ${max}.`:`${label} must be from ${min} to ${max}.`;
  }
}

function inRange(value:unknown,limit:FreightLimit):value is number{
  if(typeof value!=='number'||!Number.isFinite(value))return false;
  if(limit.integer&&!Number.isInteger(value))return false;
  return (limit.positive?value>limit.min:value>=limit.min)&&value<=limit.max;
}

const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const NOTHING='Nothing to change.';

/** Checks a PUT body: known fields only, each in range. A bp rate that isn't whole says so (the manager typed a percent with too many decimals). */
export function checkFreightUpdate(input:unknown):FreightUpdateCheck{
  if(!isRecord(input))return {update:null,problem:NOTHING};
  const update:FreightUpdate={};
  for(const key of Object.keys(input))if(!['enabled','cost','rates'].includes(key))return {update:null,problem:`Unknown setting: ${key}.`};
  if('enabled' in input){
    if(typeof input.enabled!=='boolean')return {update:null,problem:'Turn free delivery pricing on or off.'};
    update.enabled=input.enabled;
  }
  if('cost' in input){
    if(!isRecord(input.cost))return {update:null,problem:'Send the cost inputs as an object.'};
    const cost:Partial<FreightCostSettings>={};
    for(const [field,value] of Object.entries(input.cost)){
      if(field==='fuelType'){
        if(!(FUEL_TYPES as readonly unknown[]).includes(value))return {update:null,problem:'Choose gasoline or diesel.'};
        cost.fuelType=value as FuelType;continue;
      }
      const limit=COST_LIMITS[field as CostField];
      if(!limit)return {update:null,problem:`Unknown setting: cost.${field}.`};
      if(field==='fuelManualCents'&&value===null){cost.fuelManualCents=null;continue;}
      if(!inRange(value,limit))return {update:null,problem:limitProblem(limit)};
      cost[field as CostField]=value;
    }
    if(Object.keys(cost).length)update.cost=cost;
  }
  if('rates' in input){
    if(!isRecord(input.rates))return {update:null,problem:'Send the rate settings as an object.'};
    const rates:Partial<FreightRateSettings>={};
    for(const [field,value] of Object.entries(input.rates)){
      const limit=RATE_LIMITS[field as keyof FreightRateSettings];
      if(!limit)return {update:null,problem:`Unknown setting: rates.${field}.`};
      if(!inRange(value,limit)){
        const fractionalBp=limit.unit==='bp'&&typeof value==='number'&&Number.isFinite(value)&&value>=limit.min&&value<=limit.max;
        return {update:null,problem:fractionalBp?`${limitProblem(limit).slice(0,-1)}, in hundredths of a percent.`:limitProblem(limit)};
      }
      rates[field as keyof FreightRateSettings]=value;
    }
    if(Object.keys(rates).length)update.rates=rates;
  }
  return Object.keys(update).length?{update,problem:null}:{update:null,problem:NOTHING};
}

/** One step of the ramp-in: the first whole day since enabling it applies from, its rate, and that day's time once enabled. */
export interface RampStepView {step:number;fromDay:number;rateBp:number;startsAt:string|null}

const DAY_MS=86_400_000;

/**
 * The ramp-in schedule (spec §4.4, decision 35): step k of n applies from the first whole elapsed day
 * d with floor(d × n ÷ days) ≥ k − 1 (pool.rampStep's rule), at round(baseBp × k ÷ n). `baseBp` is
 * the capped pool or starting rate. `startsAt` follows `enabledAt` (null before enabling).
 */
export function rampSchedule({baseBp,steps,days,enabledAt}:{baseBp:number;steps:number;days:number;enabledAt:string|null}):RampStepView[]{
  const start=enabledAt===null?null:Date.parse(enabledAt);
  return Array.from({length:steps},(_,i)=>{
    // The smallest whole d with d × steps ≥ i × days; toPrecision drops float noise (e.g. 90 × 1 ÷ 3).
    const fromDay=Math.ceil(Number((i*days/steps).toPrecision(12)));
    return {step:i+1,fromDay,rateBp:roundCents(baseBp*(i+1)/steps),startsAt:start===null?null:new Date(start+fromDay*DAY_MS).toISOString()};
  });
}
