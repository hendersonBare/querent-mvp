import type {CustomerQuotePreview,Fulfillment} from '@/domain';
import {fulfillmentTimeLabel,isExpired} from '@/server/quotes';
import {quoteDate} from '../quote-label';

// The PDF preview modal's words (spec §3, tasks 5.1 and 5.2), per quote state, and what the Accept
// and Request changes Confirm dialogs repeat. Pure, so each state's copy is tested without rendering.

const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});

/** The rep's first name, or "your rep". */
export const repFirstName=(p:Pick<CustomerQuotePreview,'rep'>)=>p.rep?.name.trim().split(/\s+/)[0]||'your rep';
const capitalized=(text:string)=>text.charAt(0).toUpperCase()+text.slice(1);

/** "Oct 7" for a YYYY-MM-DD day (UTC), with the year when it isn't `now`'s. */
export const day=(ymd:string,now:string)=>quoteDate(`${ymd}T00:00:00.000Z`,now);

/** The facts under the title, in reading order: what the revision on screen totals and until when it holds. */
export function previewFacts(p:CustomerQuotePreview,now:string):{label:string;value:string}[]{
  if(!p.shown)return [{label:'Requested',value:quoteDate(p.requested_at,now)}];
  return [
    {label:'Total',value:usd.format(p.shown.total)},
    {label:'Valid until',value:p.shown.valid_until?day(p.shown.valid_until,now):'Not set'},
    {label:'Revision',value:`${p.shown.revision} of ${p.latest_revision}`},
  ];
}

/** The revision on screen is an older one a chat message announced; a newer one replaced it. */
export const isOlderRevision=(p:CustomerQuotePreview)=>!!p.shown&&p.shown.revision<p.latest_revision;

/** "pickup" or "delivery". */
export const fulfillmentWord=(fulfillment:Fulfillment)=>fulfillment==='delivery'?'delivery':'pickup';
/** Where it happens, after the time: "at SLC" (pickup), "from SLC" (delivery). */
export const placeText=(shown:Pick<NonNullable<CustomerQuotePreview['shown']>,'fulfillment'|'branch'>)=>`${shown.fulfillment==='delivery'?'from':'at'} ${shown.branch}`;

/**
 * Accept and Request changes can be used (spec §3): the revision on screen is the latest one sent,
 * the quote waits for an answer, and it hasn't expired (checked again at `now`, in case the modal
 * stayed open past valid-until).
 */
export function canRespond(p:CustomerQuotePreview,now:string){
  return !!p.shown&&p.status==='sent'&&!isOlderRevision(p)&&!isExpired(p.shown.valid_until,now);
}

/**
 * What the action bar says: how to answer while the quote waits for one, what the customer answered,
 * or why Accept and Request changes can't be used (not sent yet, expired, an older revision).
 */
export function actionNote(p:CustomerQuotePreview,now:string){
  const rep=repFirstName(p);
  if(!p.shown)return `You can accept it or ask for changes once ${rep} sends it.`;
  if(p.status==='expired'||(p.status==='sent'&&isExpired(p.shown.valid_until,now)))
    return `This quote expired: it was valid until ${p.shown.valid_until?day(p.shown.valid_until,now):'its end date'}. Ask ${rep} for a new one.`;
  if(isOlderRevision(p))return `Revision ${p.latest_revision} replaced this one.`;
  const response=p.response;
  if(p.status==='accepted'){
    if(response?.kind!=='accepted')return 'You accepted this quote.';
    const when=response.fulfillment_time?`: ${fulfillmentWord(p.shown.fulfillment)} ${fulfillmentTimeLabel(response.fulfillment_time)} ${placeText(p.shown)}`:'';
    return `You accepted rev ${response.revision}${response.customer_po?` with PO ${response.customer_po}`:''}${when}.`;
  }
  if(p.status==='changes_requested')return `You asked for changes${response?` to rev ${response.revision}`:''}. ${capitalized(rep)} is revising the quote.`;
  return `Accept it with a ${fulfillmentWord(p.shown.fulfillment)} time and your PO, or ask ${rep} for changes.`;
}

/** The locked part of Accept (spec §3: changing it needs Request changes): "Pickup at SLC", "Delivery from SLC to 1800 W …". */
export function lockedSummary(shown:NonNullable<CustomerQuotePreview['shown']>){
  return shown.fulfillment==='delivery'?`Delivery from ${shown.branch}${shown.ship_to?` to ${shown.ship_to}`:''}`:`Pickup at ${shown.branch}`;
}

export interface AcceptSummary {quoteNumber:string;revision:number;total:number;fulfillment:Fulfillment;branch:string;
  /** The chosen time as the ISO instant the server stores. */
  at:string;po:string}

/** Spec §3's Confirm line: "Accept Q-24817 rev 2 for $1,122.40, pickup Tue Sep 29, 10:00 AM at SLC, PO 7781?". */
export function acceptQuestion(a:AcceptSummary){
  return `Accept ${a.quoteNumber} rev ${a.revision} for ${usd.format(a.total)}, ${fulfillmentWord(a.fulfillment)} ${fulfillmentTimeLabel(a.at)} ${placeText(a)}, PO ${a.po}?`;
}

/** Request changes' Confirm line: "Send your change request for Q-24817 rev 1 to Brandi?". */
export function changesQuestion(p:CustomerQuotePreview){
  return `Send your change request for ${p.quote_number} rev ${p.shown?.revision??p.latest_revision} to ${repFirstName(p)}?`;
}

/** The body before the rep's first send, when there is no PDF yet. */
export function awaitingCopy(p:CustomerQuotePreview){
  const rep=repFirstName(p);
  return {title:`${capitalized(rep)} is pricing this quote`,
    body:`It opens here once ${rep} sends it, and a message with the total arrives in your chat.`};
}
