import type {CustomerListItem,ProductCategory,QuoteFact,QuoteLineFact,RequestedItem,SentLineFact} from '@/domain';
import type {AccessRule,Analytics} from '@/lib/contracts';
import {DEFAULT_FLOOR,margin,priceBelowFloor} from '@/server/floors';
import {gpVsCustomer,querentFoundGp} from '@/server/pricing';
import {quoteOutcome,winRate} from '@/server/quotes';

// The Analytics tab's numbers (spec §4, task 6.2): five stat cards, then the trends. Pure: each
// metric takes the repository's analytics facts (src/server/repository/analytics) and `now`, so
// the rules are tested without a database. ./service loads the facts for the signed-in rep.
//
// The rules the cards share with the rest of the app come from their owners, so the numbers agree:
//   win/loss and expiry    src/server/quotes (task 1.5): expired, and sent past valid_until, is lost
//   GP Querent found       src/server/pricing querentFoundGp (task 1.1), the number behind
//                          explainQuoteGp's "Querent found +$Y GP" on the quote
//   margin and floors      src/server/floors (task 1.2): margin(), DEFAULT_FLOOR, priceBelowFloor()

/** Rep time a quote saves (spec §4: fixed, not configurable): matching SKUs, checking stock, pricing and typing it up. */
export const MINUTES_SAVED_PER_QUOTE=20;
/** Weeks in the quotes-and-wins trend: about six months, ending this week. */
export const TREND_WEEKS=26;
/** Items in Top requested items. */
export const TOP_ITEMS=5;

const MINUTE_MS=60_000,DAY_MS=86_400_000;
const cents=(amount:number)=>Math.round(amount*100);
const dollars=(amountCents:number)=>amountCents/100;
const sent=(q:QuoteFact)=>q.revisions>0;

/** The middle value (the mean of the two middle values for an even count), or null for none. */
export function median(values:readonly number[]):number|null{
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),mid=sorted.length>>1;
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}

// ---- The five stat cards ----

export interface Turnaround {
  /** Median minutes from the customer's request to the rep's first send, or null with no sent quote. */
  median_minutes:number|null;
  /** Sent quotes it covers. */
  quotes:number;
  fastest_minutes:number|null;slowest_minutes:number|null;
}

/** Median time from request to sent: each sent quote's first send (a revision after a change request isn't a new turnaround). */
export function turnaround(quotes:readonly QuoteFact[]):Turnaround{
  const minutes=quotes.filter(q=>q.first_sent_at!==null).map(q=>(Date.parse(q.first_sent_at!)-Date.parse(q.requested_at))/MINUTE_MS);
  return {median_minutes:median(minutes),quotes:minutes.length,fastest_minutes:minutes.length?Math.min(...minutes):null,slowest_minutes:minutes.length?Math.max(...minutes):null};
}

export interface WinRateCard {rate:number|null;won:number;lost:number;open:number}

/** Quote win rate: winRate() over effective statuses, so a sent quote past valid_until is lost before the sweep stores it. */
export function winRateCard(quotes:readonly QuoteFact[],now:string):WinRateCard{
  const {rate,won,lost,open}=winRate(quotes,now);
  return {rate,won,lost,open};
}

export interface QuotedVsAccepted {
  /** Dollars: the last sent revision's total (items + freight, before tax) over every sent quote. */
  quoted:number;
  /** Dollars: the same over accepted quotes. */
  accepted:number;
  quoted_count:number;accepted_count:number;
  /** accepted / quoted, or null with nothing quoted. */
  share:number|null;
}

/** $ quoted vs $ accepted: what the customer saw (the last revision sent), not the rep's working draft. */
export function quotedVsAccepted(quotes:readonly QuoteFact[]):QuotedVsAccepted{
  const quoted=quotes.filter(q=>q.sent_total!==null);
  const accepted=quoted.filter(q=>q.status==='accepted');
  const total=(rows:QuoteFact[])=>dollars(rows.reduce((sum,q)=>sum+cents(q.sent_total!),0));
  const quotedTotal=total(quoted),acceptedTotal=total(accepted);
  return {quoted:quotedTotal,accepted:acceptedTotal,quoted_count:quoted.length,accepted_count:accepted.length,share:quotedTotal>0?acceptedTotal/quotedTotal:null};
}

export interface HoursSaved {hours:number;minutes:number;quotes_sent:number;minutes_per_quote:number}

/** Hours saved: a fixed 20 minutes per quote sent. A quote counts once, however many revisions it took. */
export function hoursSaved(quotes:readonly QuoteFact[]):HoursSaved{
  const quotesSent=quotes.filter(sent).length,minutes=quotesSent*MINUTES_SAVED_PER_QUOTE;
  return {hours:minutes/60,minutes,quotes_sent:quotesSent,minutes_per_quote:MINUTES_SAVED_PER_QUOTE};
}

export interface ExtraGp {
  /** Dollars. */
  amount:number;
  /** Lines that added GP, and the accepted quotes they are on. */
  lines:number;quotes:number;
  accepted_quotes:number;
}

/**
 * Extra GP Querent found: on accepted quotes, qty x (final price - customer price) over the lines
 * where Querent raised its suggestion above customer price on a fact (last paid, broken case,
 * scarcity) and the rep kept it (the final price is Querent's, to the cent). It is querentFoundGp()
 * over those lines, so contract lines (binding, not Querent's choice) and lines at or below
 * customer price add nothing. A price the rep raised further on their own isn't Querent's find.
 * It reads the quote lines: an accepted quote is final (no more edits), so they are the lines of
 * the revision the customer accepted, and they still carry Querent's suggestion.
 */
export function extraGp(quotes:readonly QuoteFact[],lines:readonly QuoteLineFact[]):ExtraGp{
  const accepted=new Set(quotes.filter(q=>q.status==='accepted').map(q=>q.id));
  const kept=lines.filter(l=>accepted.has(l.quote_id)&&l.suggested_basis!=='contract'&&l.unit_price!==null&&l.suggested_price!==null
    &&cents(l.unit_price)===cents(l.suggested_price)&&(gpVsCustomer(l.suggested_price,l.customer_price,l.qty)??0)>0);
  return {amount:querentFoundGp(kept),lines:kept.length,quotes:new Set(kept.map(l=>l.quote_id)).size,accepted_quotes:accepted.size};
}

// ---- Trends ----

/** The Monday (UTC) starting the week `iso` falls in, as YYYY-MM-DD. */
export function weekStart(iso:string){
  const day=new Date(`${iso.slice(0,10)}T00:00:00.000Z`);
  return new Date(day.getTime()-((day.getUTCDay()+6)%7)*DAY_MS).toISOString().slice(0,10);
}
const addDays=(day:string,days:number)=>new Date(Date.parse(`${day}T00:00:00.000Z`)+days*DAY_MS).toISOString().slice(0,10);

export interface WeekPoint {
  /** Monday, YYYY-MM-DD. */
  week_start:string;
  /** Quotes requested that week, and how each stands today. */
  quotes:number;won:number;lost:number;open:number;
}

/** Weekly quotes and wins: the last `weeks` weeks to this one, oldest first. A quote counts in the week it was requested. */
export function weeklyTrend(quotes:readonly QuoteFact[],now:string,weeks=TREND_WEEKS):WeekPoint[]{
  const last=weekStart(now);
  const points=Array.from({length:weeks},(_,i)=>({week_start:addDays(last,(i-weeks+1)*7),quotes:0,won:0,lost:0,open:0}));
  const byWeek=new Map(points.map(p=>[p.week_start,p]));
  for(const q of quotes){
    const point=byWeek.get(weekStart(q.requested_at));
    if(!point)continue;
    point.quotes++;
    point[quoteOutcome(q,now)]++;
  }
  return points;
}

export interface MarginFigures {
  /** Revenue-weighted margin, (revenue - cost) / revenue, or null with no priced line. */
  margin:number|null;
  /** Revenue-weighted floor of those lines: floor[quote rep][line category]. */
  floor:number|null;
  /** Dollars: qty x unit price. */
  revenue:number;
  lines:number;
  /** Lines under their floor (priceBelowFloor, the same check as the red warning). */
  below_floor:number;
}
export interface CategoryMargin extends MarginFigures {category_id:string;name:string}
export interface MarginVsFloor {overall:MarginFigures;categories:CategoryMargin[]}

interface Totals {revenue:number;cost:number;floorRevenue:number;lines:number;below:number}
const emptyTotals=():Totals=>({revenue:0,cost:0,floorRevenue:0,lines:0,below:0});
const figures=(t:Totals):MarginFigures=>({margin:t.revenue>0?margin(t.revenue,t.cost):null,floor:t.revenue>0?t.floorRevenue/t.revenue:null,revenue:dollars(t.revenue),lines:t.lines,below_floor:t.below});

/**
 * Average margin vs floor over the lines of each quote's last sent revision (the prices the
 * customer saw, from the frozen snapshot: a draft the rep is reworking after a change request
 * doesn't count until it is sent again), per product category and overall. Both are weighted by
 * line revenue, so a big line counts for more, as it does in a quote's own margin (spec §5.2). A
 * rep with no floor row uses DEFAULT_FLOOR (20%).
 */
export function marginVsFloor(lines:readonly SentLineFact[],categories:readonly ProductCategory[]):MarginVsFloor{
  const overall=emptyTotals(),byCategory=new Map<string,Totals>();
  for(const l of lines){
    if(!(l.unit_price>0)||!(l.qty>0))continue;
    const floor=l.margin_floor??DEFAULT_FLOOR,revenue=cents(l.qty*l.unit_price),cost=cents(l.qty*l.unit_cost),below=priceBelowFloor(l.unit_price,l.unit_cost,floor)?1:0;
    let category=byCategory.get(l.category_id);
    if(!category)byCategory.set(l.category_id,category=emptyTotals());
    for(const t of [overall,category]){t.revenue+=revenue;t.cost+=cost;t.floorRevenue+=revenue*floor;t.lines++;t.below+=below;}
  }
  const rows=[...categories].sort((a,b)=>a.sort_order-b.sort_order).filter(c=>byCategory.has(c.id));
  return {overall:figures(overall),categories:rows.map(c=>({category_id:c.id,name:c.name,...figures(byCategory.get(c.id)!)}))};
}

export interface QuestionsAnswered {
  total:number;
  /** Querent answered without the rep: with data, or "we don't carry that". */
  answered:number;with_data:number;no_match:number;
  /** Refused by the customer's access settings, or an error: the customer had to ask the rep. */
  needed_rep:number;
  rate:number|null;
}

/**
 * Questions answered without a rep, from the chat log's outcomes (task 2.1): 'answered' and
 * 'no_rows' are answers Querent gave on its own (the old query analytics counts the same two as
 * time saved); 'restricted' (the category is off for the customer) and 'error' send the customer
 * to the rep.
 */
export function questionsAnswered(outcomes:Readonly<Record<string,number>>):QuestionsAnswered{
  const total=Object.values(outcomes).reduce((sum,count)=>sum+count,0);
  const withData=outcomes.answered??0,noMatch=outcomes.no_rows??0,answered=withData+noMatch;
  return {total,answered,with_data:withData,no_match:noMatch,needed_rep:total-answered,rate:total?answered/total:null};
}

// ---- The page ----

/** Everything the Analytics page shows, for the signed-in rep and the "Viewing" picker (GET /api/rep/analytics). */
export interface RepAnalytics {
  /** Statuses are effective as of this instant, and the trend ends in its week. */
  as_of:string;
  scope:{
    /** The picked customer, or null for All customers. */
    customer:CustomerListItem|null;
    /** Customers the numbers cover: the rep's own, narrowed by the picker. */
    customer_ids:string[];
    /** The picked customer is another rep's, so the numbers are empty. */
    other_rep:boolean;
  };
  turnaround:Turnaround;
  win_rate:WinRateCard;
  quoted:QuotedVsAccepted;
  hours_saved:HoursSaved;
  extra_gp:ExtraGp;
  weekly:WeekPoint[];
  margin:MarginVsFloor;
  top_items:RequestedItem[];
  questions:QuestionsAnswered;
  /** The original query analytics (questions by information category), and the access rules it names reps from. */
  queries:Analytics;
  access:AccessRule[];
}
