import 'server-only';
import {QuoteActionError} from '@/server/quotes';
import {duplicateQuote,resetSample} from '@/server/quotes/service';
import {assignedRep} from '@/server/repository';
import {IdempotencyStore} from './idempotency';
import {repQuoteDetail,type QuoteDetail,type QuoteDetailOptions} from './quote-detail';
import {repQuote} from './quotes';

// The quote detail's ⋯ menu (spec §4, §5.4; task 3.5): Duplicate quote and Reset sample quote.
// (Open customer in ERP is shown disabled until the ERP integration; there is no Reassign.)
// Both act only on the signed-in rep's own quote: another rep's reads as not found, as in the
// Quotes list (3.2) and the detail page (3.3). The work itself is task 1.5's duplicateQuote and
// resetSample; this layer adds who may do it, and the double-submit guard.

const clock=()=>new Date().toISOString();
const firstName=(name:string)=>name.trim().split(/\s+/)[0];

export interface DuplicatedQuote {
  /** The new quote (ready_for_review, rev 0). */
  id:string;quote_number:string;
  /** The quote it was copied from. */
  duplicated_from:{id:string;quote_number:string};
}

export interface DuplicateOptions {
  /**
   * The request's Idempotency-Key: a repeat within ten minutes (a double click, a retry) gets
   * the first copy back instead of a second one. null or omitted: no guard.
   */
  idempotencyKey?:string|null;
  now?:string;
}

/** Copies already made, by rep, source quote and key (see ./idempotency). */
const duplicates=new IdempotencyStore();

/**
 * Duplicate quote: a new ready_for_review draft copied as-is from one of the rep's quotes, in any
 * status (spec §5.4: typically an expired or accepted one; a draft can be copied too). The copy
 * keeps the lines at their prices, the pickup or delivery details and any freight override, and
 * drops the PO and every send and response (duplicateQuote, task 1.5). The rep made it, so it is
 * already read for them and the Quotes badge doesn't move.
 *
 * A new quote always belongs to the customer's assigned rep (spec §5.2). If the customer has
 * since been assigned to someone else, the copy would be that rep's and out of this rep's
 * reach, so it is refused (conflict) instead.
 */
export function duplicateRepQuote(repId:string,quoteIdOrNumber:string,{idempotencyKey=null,now=clock()}:DuplicateOptions={}):{value:DuplicatedQuote;replayed:boolean}{
  const source=repQuote(repId,quoteIdOrNumber);
  if(!source)throw new QuoteActionError('not_found',`No quote ${quoteIdOrNumber}.`);
  return duplicates.once(`${repId}:${source.id}`,idempotencyKey,()=>{
    const owner=assignedRep(source.customer_id);
    if(owner?.id!==repId)throw new QuoteActionError('conflict',owner
      ?`${source.customer_name} is now ${owner.name}’s customer, so a copy of ${source.quote_number} would be their quote. Ask ${firstName(owner.name)} to duplicate it.`
      :`${source.customer_name} has no assigned rep, so ${source.quote_number} can’t be duplicated yet. Assign one in Settings.`);
    const copy=duplicateQuote(source.id,{repId,now});
    return {id:copy.id,quote_number:copy.quote_number,duplicated_from:{id:source.id,quote_number:source.quote_number}};
  });
}

/**
 * Reset sample quote: rebuilds the seeded sample (Q-24817) exactly as seeded, whatever the demo
 * did to it (resetSample, task 1.5): its lines and prices, terms, freight, notes and Activity,
 * back to ready_for_review, rev 0 and unread for the rep. Quotes asked for in its chat and its
 * duplicates are kept, only unlinked from it. Any other quote is refused (409): only sample data
 * can be reset. Returns the fresh detail.
 */
export async function resetRepSampleQuote(repId:string,quoteIdOrNumber:string,options:QuoteDetailOptions={}):Promise<QuoteDetail>{
  const q=repQuote(repId,quoteIdOrNumber);
  if(!q)throw new QuoteActionError('not_found',`No quote ${quoteIdOrNumber}.`);
  if(!q.is_sample)throw new QuoteActionError('illegal_transition',`Only the sample quote can be reset. ${q.quote_number} isn’t sample data.`);
  const fresh=resetSample();
  const detail=await repQuoteDetail(repId,fresh.id,options);
  if(!detail)throw new QuoteActionError('not_found',`No quote ${quoteIdOrNumber}.`);
  return detail;
}
