import 'server-only';
import {z} from 'zod';
import {REP_REPLY_KIND,type QuoteActivity,type RepReplyPayload} from '@/domain';
import {QuoteActionError} from '@/server/quotes';
import {quoteChat} from '@/server/quotes/service';
import {addMessage,addQuoteActivity,inTransaction,rep} from '@/server/repository';
import {repQuote} from './quotes';

// "Reply to Dana" (plan U3; C_QOB5, C_QOB6, C_QOT4): the owning rep's answer to the customer's change
// request note, from the Quotes page's View note dialog. Decision 63: the reply is posted into the
// customer's Querent conversation as sent quotes are (the quote's own chat, else the latest; see
// quoteChat), as a `rep_reply` message the customer's chat shows among its turns, and recorded on the
// quote's Activity, naming who replied to whom. Both are written together or not at all. Only the rep
// who owns the quote replies; the manager reads other reps' quotes but writes only her own (decision 22).

/** The longest reply, in characters (the same as an internal note). */
export const REPLY_MAX=2000;

const Body=z.object({body:z.string({error:'Write a reply.'}).transform(s=>s.trim())
  .refine(s=>s.length>0,{error:'Write a reply.'}).refine(s=>s.length<=REPLY_MAX,{error:`Keep the reply to ${REPLY_MAX.toLocaleString('en-US')} characters.`})});

export function replyToChangeRequest(repId:string,quoteIdOrNumber:string,body:unknown,{now=new Date().toISOString()}:{now?:string}={}):QuoteActivity{
  const q=repQuote(repId,quoteIdOrNumber);
  if(!q)throw new QuoteActionError('not_found',`No quote ${quoteIdOrNumber}.`);
  const parsed=Body.safeParse(body);
  if(!parsed.success)throw new QuoteActionError('invalid_input',parsed.error.issues[0]?.message??'Write a reply.');
  if(q.status!=='changes_requested'||!q.change_request_note?.trim())throw new QuoteActionError('illegal_transition',`${q.quote_number} has no change request to reply to.`);
  const who=q.contact_name??q.customer_name;
  const name=rep(repId)?.name??repId;
  const payload:RepReplyPayload={quote_id:q.id,quote_number:q.quote_number,rep_name:name};
  return inTransaction(()=>{
    if(!addMessage(q.customer_id,quoteChat(q,now),{role:'system',kind:REP_REPLY_KIND,content:parsed.data.body,payload,at:now}))
      throw new Error(`${q.quote_number}: the customer's chat couldn't be written.`);
    return addQuoteActivity(q.id,{actor:'rep',actorId:repId,kind:'replied',at:now,message:`${name} replied to ${who}: "${parsed.data.body}"`});
  });
}
