import 'server-only';

// Feature flags (decision 48; plan U8): three environment variables read on the server, each off unless
// set to 1, true, on or yes. No flags table (the Appendix C feature_flags migration is skipped). While a
// flag is off its section on Settings > Pricing and delivery does not render and its settings writes are
// refused (403 feature_off). The flags hide settings only: freight math, the pool and the cost model run
// as before (Appendix F), on whatever is stored.

export const FLAG_ENV={
  freeDeliveryPricing:'FEATURE_FREE_DELIVERY_PRICING',
  recoveryPool:'FEATURE_RECOVERY_POOL',
  deliveryCostModel:'FEATURE_DELIVERY_COST_MODEL',
} as const;
export type FlagName=keyof typeof FLAG_ENV;
export type FeatureFlags=Record<FlagName,boolean>;

const ON=new Set(['1','true','on','yes']);

/** One flag from `env` (process.env by default), read now: a value set after start counts. */
export function flagOn(name:FlagName,env:Record<string,string|undefined>=process.env){
  return ON.has((env[FLAG_ENV[name]]??'').trim().toLowerCase());
}

/** All three flags, read now. */
export function featureFlags(env:Record<string,string|undefined>=process.env):FeatureFlags{
  return {freeDeliveryPricing:flagOn('freeDeliveryPricing',env),recoveryPool:flagOn('recoveryPool',env),deliveryCostModel:flagOn('deliveryCostModel',env)};
}

/** A settings write refused because its section's flag is off: 403 with code feature_off. */
export class FeatureOffError extends Error{
  readonly status=403;readonly code='feature_off';
  constructor(message:string){super(message);this.name='FeatureOffError';}
}

const OFF:Record<FlagName,string>={
  freeDeliveryPricing:'Free delivery pricing is turned off.',
  recoveryPool:'The recovery pool is turned off.',
  deliveryCostModel:'The delivery cost model is turned off.',
};

/** The error for a flag that is off, or null when it is on. */
export function featureOff(name:FlagName,flags:FeatureFlags=featureFlags()){
  return flags[name]?null:new FeatureOffError(OFF[name]);
}

/**
 * PUT /api/rep/settings/freight {enabled?, rates?, cost?}: the first part whose section is off, as its
 * error, or null. `enabled` is the Free delivery pricing section, `rates` the Recovery pool's, `cost` the
 * Delivery cost model's. A body that is not an object is left to the route's own checks.
 */
export function freightWriteRefusal(body:unknown,flags:FeatureFlags=featureFlags()):FeatureOffError|null{
  if(typeof body!=='object'||body===null||Array.isArray(body))return null;
  const parts:[string,FlagName][]=[['enabled','freeDeliveryPricing'],['rates','recoveryPool'],['cost','deliveryCostModel']];
  for(const [key,flag] of parts)if(key in body){const off=featureOff(flag,flags);if(off)return off;}
  return null;
}
