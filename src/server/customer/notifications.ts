import 'server-only';
import type {CustomerNotification,CustomerNotifications} from '@/domain';
import {effectiveStatus} from '@/server/quotes';
import {notificationReads,quoteNews,saveNotificationReads,shippedOrders,type QuoteNewsRow} from '@/server/repository/customer';

// The customer's notification bell (plan U10; decision 41; C_CVL4; new-ui-implementation-prompt
// Part 1 §10 and Appendix C). Derived on read, never stored:
//   quote_ready    a quote's latest revision was sent           "Quote Q-24791 is ready to review"
//   quote_updated  it was sent again after Dana asked for changes "Brandi updated Q-24790"
//   quote_expired  a sent quote passed its valid-until day      "Quote Q-24815 expired" (no frame copy)
//   order_shipped  an order's status is shipped                 "Order SO-51223 has shipped"
// One notification per quote: its latest news (an expiry replaces the ready notice). Newest first,
// the newest NOTIFICATION_LIMIT. Read when Dana marked it read (the bell, Mark all read), or, for a
// quote, when she answered or opened the quote after it happened (customer_viewed_at, responded_at).
// Customer-facing, so it reads only the customer-safe repository module: no cost, no margin.

/** How many notifications the bell lists (the newest). */
export const NOTIFICATION_LIMIT=10;

const DAY_MS=86_400_000;
const usd=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const dayMonth=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const dayMonthYear=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
/** "Sep 18", or "Dec 30, 2025" outside `now`'s year (as the customer's quote dates read). */
const quoteDate=(iso:string,now:string)=>(iso.slice(0,4)===now.slice(0,4)?dayMonth:dayMonthYear).format(new Date(iso));
const firstName=(name:string)=>name.trim().split(/\s+/)[0]||name;
const utcDay=(iso:string)=>iso.slice(0,10);
const dayBefore=(ymd:string)=>new Date(Date.parse(`${ymd}T00:00:00.000Z`)-DAY_MS).toISOString().slice(0,10);

/** "today", "yesterday" or "on Sep 18" (UTC days, like every date in the app). */
function sentWhen(at:string,now:string){
  if(utcDay(at)===utcDay(now))return 'today';
  if(utcDay(at)===dayBefore(utcDay(now)))return 'yesterday';
  return `on ${quoteDate(at,now)}`;
}

/** The moment a sent quote expired: the start of the day after valid_until (isExpired). */
const expiredAt=(validUntil:string)=>new Date(Date.parse(`${validUntil}T00:00:00.000Z`)+DAY_MS).toISOString();

/** A quote's latest news: its expiry, or its latest send. */
function quoteNotification(q:QuoteNewsRow,now:string,reads:ReadonlySet<string>):CustomerNotification{
  const quote={id:q.quote_id,quote_number:q.quote_number};
  const seen=(at:string,id:string)=>reads.has(id)||[q.customer_viewed_at,q.responded_at].some(t=>t!==null&&t>=at);
  const expired=q.valid_until!==null&&['sent','expired'].includes(q.status)&&effectiveStatus({status:q.status as 'sent',valid_until:q.valid_until},now)==='expired';
  if(expired){
    const id=`quote:${q.quote_id}:expired`,at=expiredAt(q.valid_until!);
    return {id,kind:'quote_expired',title:`Quote ${q.quote_number} expired`,body:`It was valid until ${quoteDate(`${q.valid_until}T00:00:00.000Z`,now)}.`,at,day_only:false,read:seen(at,id),quote};
  }
  const id=`quote:${q.quote_id}:rev:${q.revision}`,at=q.sent_at,rep=firstName(q.rep_name);
  if(q.revision>1&&q.after_changes)
    return {id,kind:'quote_updated',title:`${rep} updated ${q.quote_number}`,body:`The changes you asked for are in. Revision ${q.revision}.`,at,day_only:false,read:seen(at,id),quote};
  return {id,kind:'quote_ready',title:`Quote ${q.quote_number} is ready to review`,body:`${usd.format(q.total)}. ${rep} sent it ${sentWhen(at,now)}.`,at,day_only:false,read:seen(at,id),quote};
}

/** Every notification for the customer, newest first. */
function allNotifications(customerId:string,now:string){
  const reads=new Set(notificationReads(customerId));
  const quotes=quoteNews(customerId).map(q=>quoteNotification(q,now,reads));
  const orders=shippedOrders(customerId).map((o):CustomerNotification=>{
    const id=`order:${o.order_id}:shipped`;
    const how=`${o.fulfillment==='delivery'?'Delivery':'Will call'}, ${o.branch_code}.`;
    return {id,kind:'order_shipped',title:`Order ${o.order_number} has shipped`,body:o.quote_number?`${how} From quote ${o.quote_number}.`:how,
      at:`${o.shipped_on}T00:00:00.000Z`,day_only:true,read:reads.has(id),quote:null};
  });
  return [...quotes,...orders].sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
}

/** The bell: the newest `limit` notifications and how many of them are unread. `now` is for tests. */
export function customerNotifications(customerId:string,{now=new Date().toISOString(),limit=NOTIFICATION_LIMIT}:{now?:string;limit?:number}={}):CustomerNotifications{
  const items=allNotifications(customerId,now).slice(0,limit);
  return {unread:items.filter(n=>!n.read).length,items};
}

/**
 * Marks notifications read: the named ones (only ids that are this customer's notifications; others
 * are ignored), or every one the bell shows (Mark all read). Returns the bell as it now reads.
 */
export function markNotificationsRead(customerId:string,which:{ids:readonly string[]}|{all:true},{now=new Date().toISOString()}:{now?:string}={}):CustomerNotifications{
  const shown=customerNotifications(customerId,{now}).items;
  const own=new Set(allNotifications(customerId,now).map(n=>n.id));
  const ids='all' in which?shown.map(n=>n.id):which.ids.filter(id=>own.has(id));
  saveNotificationReads(customerId,[...new Set(ids)],now);
  return customerNotifications(customerId,{now});
}
