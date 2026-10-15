import 'server-only';
import type {RepFloor} from '@/domain';
import {quote,repFloors,updateOwnFloor} from '@/server/repository';
import {canEditFloor,quoteFloorSummary,resolveFloor,type FloorQuote,type QuoteFloorSummary,type ResolvedFloor} from './rules';

// The thin database adapter for margin floors (spec §5.2): it loads floors through the
// repository and hands them to the pure rules in ./rules.

/** A rep tried to change another rep's margin floors (spec §5.2). Map it to 403. */
export class FloorPermissionError extends Error{
  constructor(){super('Reps can only change their own margin floors.');this.name='FloorPermissionError';}
}

/**
 * Floor status for every line of a quote, against the floors of the quote's rep (the customer's
 * assigned rep; quotes are never reassigned). Pass the quote id, or a quote already loaded.
 * undefined if there is no such quote.
 */
export function quoteFloors(quoteOrId:string|FloorQuote):QuoteFloorSummary|undefined{
  const loaded=typeof quoteOrId==='string'?quote(quoteOrId):quoteOrId;
  return loaded&&quoteFloorSummary(loaded,repFloors(loaded.rep_id));
}

/** floor[rep][category] from the database, falling back to 20% when the pair has no row. */
export function effectiveFloor(repId:string,categoryId:string):ResolvedFloor{
  return resolveFloor(repFloors(repId),repId,categoryId);
}

/**
 * Settings > Margins (a rep's own, plan U9). `actingRepId` is the logged-in rep (the session principal's
 * rep_id, null for a customer); `repId` is whose floor to change. Editing another rep's floor
 * throws FloorPermissionError before anything is written. Throws RangeError for a floor outside
 * 0 to under 1; returns undefined if the rep has no floor row for the category.
 */
export function setMyFloor(actingRepId:string|null|undefined,repId:string,categoryId:string,marginFloor:number,at?:string):RepFloor|undefined{
  if(!canEditFloor(actingRepId,repId))throw new FloorPermissionError();
  return updateOwnFloor(repId,categoryId,marginFloor,at);
}
