import 'server-only';
import type {CustomerQuotePreview,CustomerQuoteResponse,CustomerQuoteView,Rep} from '@/domain';
import {customerPdfUrl,effectiveStatus} from '@/server/quotes';
import {assignedRep,customerQuote,customerQuoteRevision,markCustomerViewed} from '@/server/repository/customer';

// The customer's PDF preview modal (spec §3, task 5.1). Customer-facing, so it reads only the
// customer-safe repository module: a revision the rep sent, never the draft. Task 5.2 adds what
// the Accept form shows locked (pickup or delivery, branch, ship-to, the rep's PO) and the
// customer's own answer once they gave one.

const contact=(rep:Rep|null|undefined)=>rep?{name:rep.name,phone:rep.phone,email:rep.email}:null;

/** The customer's answer to the latest revision (task 5.2), while the quote is accepted, changes are requested or it is declined (A1). */
function responseOf(q:CustomerQuoteView):CustomerQuoteResponse|null{
  if(q.status==='accepted')return {kind:'accepted',revision:q.revision,fulfillment_time:q.fulfillment_time,customer_po:q.customer_po};
  if(q.status==='changes_requested')return {kind:'changes_requested',revision:q.revision,note:q.change_request_note??''};
  // Only that they declined: the reason and the Other note are the rep's (v3 spec §2.1).
  if(q.status==='declined')return {kind:'declined',revision:q.revision};
  return null;
}

/**
 * One of the customer's quotes (by id or number) as the preview modal shows it: its status now (a
 * sent quote past valid_until reads expired), and revision `revision` of what the rep sent, or the
 * latest when omitted. Before the first send there is nothing to show (`shown` null). Undefined
 * for another customer's quote, an unknown one, or a revision that was never sent.
 */
export function customerQuotePreview(customerId:string,quoteIdOrNumber:string,revision?:number,now=new Date().toISOString()):CustomerQuotePreview|undefined{
  const q=customerQuote(customerId,quoteIdOrNumber);
  if(!q)return undefined;
  const base={id:q.id,quote_number:q.quote_number,status:effectiveStatus(q,now),latest_revision:q.revision,requested_at:q.requested_at,response:responseOf(q)};
  if(!q.sent)return revision===undefined?{...base,shown:null,rep:contact(assignedRep(customerId))}:undefined;
  const sent=customerQuoteRevision(customerId,q.id,revision);
  if(!sent)return undefined;
  const s=sent.snapshot;
  return {...base,rep:contact(sent.rep),shown:{revision:sent.revision,sent_at:sent.sent_at,total:s.total,valid_until:s.valid_until??null,
    attach_pdf:sent.attach_pdf,pdf_url:customerPdfUrl(q.id,sent.revision),
    fulfillment:s.fulfillment,branch:s.branch,ship_to:s.fulfillment==='delivery'?s.ship_to??null:null,customer_po:s.customer_po??null}};
}

/**
 * The customer opened the preview modal (GET /api/query/customer/quotes/:id): the preview, and when
 * it shows a sent revision, customer_viewed_at (v3 spec §3, decision 25) with the unread flag cleared.
 * The accept / request changes / decline answers reuse customerQuotePreview, which doesn't stamp.
 */
export function openCustomerQuotePreview(customerId:string,quoteIdOrNumber:string,revision?:number,now=new Date().toISOString()):CustomerQuotePreview|undefined{
  const preview=customerQuotePreview(customerId,quoteIdOrNumber,revision,now);
  if(preview?.shown)markCustomerViewed(customerId,preview.id,now);
  return preview;
}
