import 'server-only';
import type {QuoteStatus} from '@/domain';
import type {DistanceProvider} from '@/server/freight/distance';
import {canEditDraft,effectiveStatus} from '@/server/quotes';
import {sendCheck} from '@/server/quotes/service';
import {quotes} from '@/server/repository';

// Add to quote from Stock and the item page (plan U5; C_ST3, "Which quote?"). The quotes offered are
// the signed-in rep's own whose status still allows edits (Draft ready, Changes requested): adding goes
// through the existing add-line route (POST /api/rep/quotes/<number>/lines), which refuses anything
// else, and a manager edits only their own quotes (decision 22). Pricing is the engine's (Appendix F).

const clock=()=>new Date().toISOString();

export interface AddToQuoteTarget {
  quote_number:string;customer_name:string;
  status:Extract<QuoteStatus,'ready_for_review'|'changes_requested'>;
  line_count:number;
  /** The draft's total as Approve and send would total it (the Quotes list's draft total), or null when nothing is priced yet. */
  total:number|null;
}

/** The rep's own editable quotes, newest request first. */
export async function addToQuoteTargets(repId:string,{now=clock(),provider}:{now?:string;provider?:DistanceProvider}={}):Promise<AddToQuoteTarget[]>{
  const open=quotes({repId,statuses:['ready_for_review','changes_requested']}).filter(q=>canEditDraft(effectiveStatus(q,now)));
  const targets:AddToQuoteTarget[]=[];
  for(const q of open){
    const check=await sendCheck(q.id,{provider});
    const total=check.total??check.subtotal;
    targets.push({quote_number:q.quote_number,customer_name:q.customer_name,status:q.status as AddToQuoteTarget['status'],line_count:q.line_count,total:total||null});
  }
  return targets;
}
