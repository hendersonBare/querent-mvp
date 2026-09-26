// Upsells (spec §5.5, task 1.6). This barrel is the pure, client-safe API: the rules, fastener
// matching and the template wording. Server code that needs chips for a stored quote imports
// '@/server/upsells/service' (quoteUpsells), which loads the facts and prices them with task 1.1.
export * from './fasteners';
export * from './rules';
export * from './wording';
