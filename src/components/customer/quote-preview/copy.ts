import type {CustomerQuotePreview} from '@/domain';
import {quoteDate} from '../quote-label';

// The PDF preview modal's words (spec §3, task 5.1), per quote state. Pure, so each state's copy is
// tested without rendering.

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

/**
 * Why Accept and Request changes can't be used, under the action bar. They arrive in task 5.2; until
 * then a sent quote points the customer to the chat. An expired quote stays closed (spec §3).
 */
export function actionNote(p:CustomerQuotePreview,now:string){
  const rep=repFirstName(p);
  if(!p.shown)return `You can accept it or ask for changes once ${rep} sends it.`;
  if(p.status==='expired')return `This quote expired: it was valid until ${p.shown.valid_until?day(p.shown.valid_until,now):'its end date'}. Ask ${rep} for a new one.`;
  if(isOlderRevision(p))return `Revision ${p.latest_revision} replaced this one.`;
  if(p.status==='accepted')return 'You accepted this quote.';
  if(p.status==='changes_requested')return `You asked for changes. ${capitalized(rep)} is revising the quote.`;
  return `To accept it or ask for changes, reply to ${rep} in chat.`;
}

/** The body before the rep's first send, when there is no PDF yet. */
export function awaitingCopy(p:CustomerQuotePreview){
  const rep=repFirstName(p);
  return {title:`${capitalized(rep)} is pricing this quote`,
    body:`It opens here once ${rep} sends it, and a message with the total arrives in your chat.`};
}
