import 'server-only';
import {z} from 'zod';
import type {QuoteReadyPayload} from '@/domain';
import type {DistanceProvider} from '@/server/freight/distance';
import {QUOTE_MESSAGE_MAX,QuoteActionError} from '@/server/quotes';
import {sendQuote} from '@/server/quotes/service';
import {IdempotencyStore} from './idempotency';
import {quoteDetailOf,type QuoteDetail} from './quote-detail';
import {repQuote,touchRepQuote} from './quotes';

// Approve & send from the rep portal (spec §4, §5.4; task 3.7): POST /api/rep/quotes/<id>/send,
// after the send dialog and its Confirm send. The work is task 1.5's sendQuote (the revision
// snapshot, status sent, the chat message, Activity); this layer adds:
//   - who may send: the signed-in rep's own quote only (another rep's reads as not found, as in
//     the Quotes list and the detail page), and it goes out from the quote's own rep (quote.rep_id);
//   - the body: the editable message, Attach PDF, and the revision and total Confirm send named,
//     which sendQuote holds the send to (conflict if the quote changed after the rep looked);
//   - one send per click: the Idempotency-Key replays a send instead of repeating it, even while
//     the first is still pricing freight; without a key, sendQuote's status guard refuses a
//     second send (409);
//   - the send touches the quote for its rep (last_rep_touch_at, v3 spec §3).

const clock=()=>new Date().toISOString();

/** What the rep confirmed. The message is bounded here only as a request size; sendQuote applies QUOTE_MESSAGE_MAX once sanitized. */
const Body=z.strictObject({
  message:z.string({error:'The message must be text.'}).max(QUOTE_MESSAGE_MAX*10,{error:`Keep the message to ${QUOTE_MESSAGE_MAX.toLocaleString('en-US')} characters.`}).optional(),
  attach_pdf:z.boolean({error:'Attach PDF must be true or false.'}).optional(),
  revision:z.number({error:'Send needs the revision you confirmed.'}).int({error:'Send needs the revision you confirmed.'}).min(1,{error:'Send needs the revision you confirmed.'}),
  total:z.number({error:'Send needs the total you confirmed.'}).min(0,{error:'Send needs the total you confirmed.'}).refine(Number.isFinite,{error:'Send needs the total you confirmed.'}),
},{error:issue=>issue.code==='unrecognized_keys'?`Send takes a message, Attach PDF, and the revision and total you confirmed (not ${issue.keys.join(', ')}).`
  :'Send needs a message, Attach PDF, and the revision and total you confirmed.'});
export type SendBody=z.infer<typeof Body>;

function parse(body:unknown):SendBody{
  const result=Body.safeParse(body);
  if(!result.success)throw new QuoteActionError('invalid_input',result.error.issues[0]?.message??'Check the request.');
  return result.data;
}

export interface SentQuote {
  /** The quote after the send: status sent, read-only, Activity included. */
  detail:QuoteDetail;
  /** What went to the customer's chat. */
  sent:Pick<QuoteReadyPayload,'quote_id'|'quote_number'|'revision'|'total'|'valid_until'|'attach_pdf'|'headline'>&{conversation_id:string;message_id:string};
}

export interface SendRepQuoteOptions {
  /**
   * The request's Idempotency-Key: a repeat within ten minutes (a double click, a retry) gets
   * the first send back instead of a second. null or omitted: no replay (the status guard still
   * refuses a second send).
   */
  idempotencyKey?:string|null;
  now?:string;
  provider?:DistanceProvider;
}

/** Sends already made, by rep, quote and key (see ./idempotency). */
const sends=new IdempotencyStore();

/**
 * Approve & send: sends one of the rep's quotes to its customer's Querent chat. Throws
 * QuoteActionError: not_found (404) for another rep's or an unknown quote; invalid_input (400)
 * for a bad body or a message over the limit; illegal_transition (409) when the quote can't be
 * sent (already sent, accepted, expired); conflict (409) when it changed since Confirm send or
 * mid-send; send_blocked (422, with the blockers) when it is unfinished.
 */
export async function sendRepQuote(repId:string,quoteIdOrNumber:string,body:unknown,{idempotencyKey=null,now,provider}:SendRepQuoteOptions={}):Promise<{value:SentQuote;replayed:boolean}>{
  const q=repQuote(repId,quoteIdOrNumber);
  if(!q)throw new QuoteActionError('not_found',`No quote ${quoteIdOrNumber}.`);
  const input=parse(body);
  return sends.onceAsync(`${repId}:${q.id}`,idempotencyKey,async()=>{
    const at=now??clock();
    const {quote,message}=await sendQuote(q.id,{repId:q.rep_id,message:input.message??null,attachPdf:input.attach_pdf??true,
      expected:{revision:input.revision,total:input.total},now:at,provider});
    touchRepQuote(q,at);
    const posted=message.payload as QuoteReadyPayload;
    return {detail:await quoteDetailOf(quote,{now:at,provider}),
      sent:{quote_id:posted.quote_id,quote_number:posted.quote_number,revision:posted.revision,total:posted.total,valid_until:posted.valid_until,attach_pdf:posted.attach_pdf,
        headline:posted.headline,conversation_id:message.conversation_id,message_id:message.id}};
  });
}
