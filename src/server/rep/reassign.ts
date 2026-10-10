import 'server-only';
import {QuoteActionError} from '@/server/quotes';
import {addQuoteActivity,inTransaction,quote,quoteByNumber,rep,setQuoteRep,teamReps} from '@/server/repository';
import {IdempotencyStore} from './idempotency';

// Quote reassignment (v3 spec §5, §8; decision 21; task D2): the manager moves quotes from one rep
// to another, one at a time or in bulk (POST /api/rep/quotes/reassign, managerRoute), and Settings
// > Rep assignments moves a customer's open quotes with the customer ("Also move this customer's
// open quotes"). Both go through moveQuotes:
//   - quotes.rep_id becomes the target; original_rep_id keeps the first owner (set at creation);
//   - each moved quote logs quote_activity (actor 'rep', actor_id the manager, kind 'reassigned'):
//     "Brandi Gallegos reassigned Q-24817 from Mara Jensen to Eli Porter";
//   - a quote the target already owns is skipped, with no row;
//   - open and closed quotes move alike; the target must exist and be active (OA-27);
//   - one transaction: a refusal moves nothing.
// A move is not an edit: updated_at, last_rep_touch_at and the unread flag stay as they were.

const clock=()=>new Date().toISOString();

/** At most this many quotes per request: one Quotes list page and then some. */
export const REASSIGN_MAX=200;

export interface RepRef {id:string;name:string}
export interface ReassignResult {
  /** The rep the quotes now belong to. */
  to:RepRef;
  /** The quotes that moved, in request order, with the rep each came from. */
  moved:{id:string;quote_number:string;from:RepRef}[];
  /** The quotes the target already owned: nothing written. */
  skipped:{id:string;quote_number:string}[];
}

const invalid=(message:string)=>new QuoteActionError('invalid_input',message);

/** The active rep a quote can move to (OA-27: never an inactive one); 400 otherwise. */
export function reassignTarget(toRepId:unknown):RepRef{
  const target=typeof toRepId==='string'?teamReps().find(r=>r.id===toRepId):undefined;
  if(!target)throw invalid('Choose an active rep to reassign to.');
  if(!target.active)throw invalid(`${target.name} is inactive. Choose an active rep.`);
  return {id:target.id,name:target.name};
}

/**
 * Moves the quotes (already-loaded ids) to `to`, logging each move as `actorId`. Runs in the
 * caller's transaction when there is one (inTransaction nests), else its own.
 */
export function moveQuotes(actorId:string,quoteIds:readonly string[],to:RepRef,{now=clock()}:{now?:string}={}):ReassignResult{
  const actor=rep(actorId)?.name??actorId;
  return inTransaction(()=>{
    const result:ReassignResult={to,moved:[],skipped:[]};
    for(const id of quoteIds){
      const q=quote(id);
      if(!q)throw new QuoteActionError('not_found',`No quote ${id}.`);
      if(q.rep_id===to.id){result.skipped.push({id:q.id,quote_number:q.quote_number});continue;}
      setQuoteRep(q.id,to.id);
      addQuoteActivity(q.id,{actor:'rep',actorId,kind:'reassigned',at:now,message:`${actor} reassigned ${q.quote_number} from ${q.rep_name} to ${to.name}`});
      result.moved.push({id:q.id,quote_number:q.quote_number,from:{id:q.rep_id,name:q.rep_name}});
    }
    return result;
  });
}

/** Moves already made, by manager and key (see ./idempotency). */
const moves=new IdempotencyStore();

export interface ReassignOptions {
  /** The request's Idempotency-Key: a repeat within ten minutes gets the first answer back. */
  idempotencyKey?:string|null;
  now?:string;
}

/**
 * POST /api/rep/quotes/reassign {quoteIds, toRepId}: 1 to 200 distinct quotes, by id or number,
 * to an active rep. The route serves the manager only (managerRoute), who may move any rep's quote.
 * 400 for a bad request or target, 404 when a quote doesn't exist; either way nothing moves.
 */
export function reassignRepQuotes(managerId:string,input:unknown,{idempotencyKey=null,now=clock()}:ReassignOptions={}):{value:ReassignResult;replayed:boolean}{
  const body=typeof input==='object'&&input!==null&&!Array.isArray(input)?input as Record<string,unknown>:null;
  if(!body)throw invalid('Choose the quotes to reassign and a rep.');
  const {quoteIds,toRepId}=body;
  if(!Array.isArray(quoteIds)||quoteIds.length<1||quoteIds.length>REASSIGN_MAX)throw invalid(`Choose 1 to ${REASSIGN_MAX} quotes to reassign.`);
  if(!quoteIds.every(id=>typeof id==='string'&&id.trim()))throw invalid('Each quote must be a quote id or number.');
  const to=reassignTarget(toRepId);
  return moves.once(managerId,idempotencyKey,()=>{
    const ids:string[]=[];
    for(const given of quoteIds as string[]){
      const q=quote(given)??quoteByNumber(given);
      if(!q)throw new QuoteActionError('not_found',`No quote ${given}.`);
      if(ids.includes(q.id))throw invalid(`${q.quote_number} is listed more than once.`);
      ids.push(q.id);
    }
    return moveQuotes(managerId,ids,to,{now});
  });
}
