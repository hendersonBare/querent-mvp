import {DECLINE_REASONS,QUOTE_STATUSES,type DeclineReason,type QuoteStatus,type TeamQuoteFact,type TeamStatusEvent} from '@/domain';
import {toCents} from '@/lib/money';
import {margin} from '@/server/floors';
import {aging,effectiveStatus,expiresAt,type AgingThresholds} from '@/server/quotes';

// The Team dashboard's numbers (v3 spec §7, §7.3; decisions 23–25; OA-10, OA-13, OA-15; task D3).
// Pure: the repository (src/server/repository/team) reads the cohort live, quotes created in the
// window and owned now by a selected rep, and this module aggregates it per rep and in total.
//
//   Created                  cohort quotes
//   Counts per status        effective status at `now`; open quotes split ok / amber / red by aging
//   Quote-to-order rate      accepted ÷ created
//   Unaccepted rate          (declined + expired) ÷ created; open quotes are shown on their own
//   Decided win rate         accepted ÷ (accepted + declined + expired); declined and expired stay apart
//   Time to send             mean hours, created to the first `sent` activity, over quotes ever sent
//   Customer response time   mean hours, each send to the next accepted / changes_requested / declined
//   Time in each status      mean hours per visit to ready_for_review, sent, changes_requested on the
//                            quote_activity timeline; open visits count to now, an unswept expiry
//                            ends the sent visit at its expiry instant
//   Total quoted value       Σ latest sent revision total, or the live draft total if never sent
//   Accepted value           Σ accepted quotes' latest revision total
//   Average quoted margin    mean of each priced quote's margin (floors' margin(), before recovery, OA-10)
//   Freight recovered        Σ freight_recovery × qty on accepted quotes, against Σ modelled_freight_cents
//                            on accepted delivery quotes
//   Decline reasons          count per reason (no reason counted apart), the Other notes listed
//   Upsell acceptance        suggestion lines ÷ suggestions offered (OA-13); rep upsell lines as a count
//   Why untouched (§7.3)     reasons 1–5 for amber or red quotes only, reason 6 for every expired one (OA-15)
//
// A rate, mean or average is null (shown "–") when there is nothing to divide by.
// TODO(R-1): quote-to-order is accepted ÷ created until accepted quotes create real orders; then redefine it.

export interface MetricsRep {id:string;name:string;team:string|null;active:boolean}

/** "Why quotes went untouched" (decision 25): inferred from events, never typed by reps. */
export const UNTOUCHED_REASONS=[
  {id:'draft_never_opened',label:'Draft never opened'},
  {id:'draft_opened_not_sent',label:'Draft opened but never sent'},
  {id:'changes_not_revised',label:'Changes requested but never revised'},
  {id:'sent_never_opened',label:'Sent but never opened'},
  {id:'sent_opened_no_reply',label:'Sent and opened but no reply'},
  {id:'expired_no_response',label:'Expired with no response'},
] as const;
export type UntouchedReason=typeof UNTOUCHED_REASONS[number]['id'];

/** A decline's reason, or `none` when the customer chose none (decision 14 allows it). */
export type DeclineBucket=DeclineReason|'none';
export const DECLINE_BUCKETS:readonly DeclineBucket[]=[...DECLINE_REASONS,'none'];

/** The open statuses (the rep or the customer still has to act), split by aging. */
export const OPEN_STATUSES:readonly QuoteStatus[]=['ready_for_review','sent','changes_requested'];
/** The statuses with a time-in-status figure. */
export type TimedStatus='ready_for_review'|'sent'|'changes_requested';

export interface TeamRow {
  /** The rep, or null for the totals row. */
  rep_id:string|null;
  name:string;team:string|null;active:boolean;
  created:number;
  statuses:Record<QuoteStatus,number>;
  open:{total:number;ok:number;amber:number;red:number};
  rates:{quote_to_order:number|null;unaccepted:number|null;decided_win:number|null};
  /** Mean hours. */
  hours:{to_send:number|null;customer_response:number|null}&Record<TimedStatus,number|null>;
  value:{quoted_cents:number;accepted_cents:number};
  /** A fraction (0.25 = 25%), or null with no priced quote. */
  avg_margin:number|null;
  freight:{recovered_cents:number;modelled_cents:number};
  declines:Record<DeclineBucket,number>;
  upsell:{suggestions_offered:number;suggestions_added:number;suggestion_rate:number|null;rep_upsell_lines:number};
  untouched:Record<UntouchedReason,number>;
}

/** An Other decline note in the customer's words, with its quote, rep and customer (rep-only, decision 14). */
export interface OtherNote {quote_id:string;quote_number:string;rep_id:string;rep_name:string;customer_id:string;customer_name:string;note:string;declined_at:string|null}

export interface TeamMetricRows {rows:TeamRow[];totals:TeamRow;other_notes:OtherNote[]}

export interface TeamMetricOptions {now:string;thresholds:AgingThresholds}

const H=3_600_000;
const ratio=(n:number,d:number)=>d>0?n/d:null;
const mean=(values:readonly number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
const zeros=<K extends string>(keys:readonly K[])=>Object.fromEntries(keys.map(k=>[k,0])) as Record<K,number>;
const RESPONSES=new Set<TeamStatusEvent['kind']>(['accepted','changes_requested','declined']);
const TIMED:readonly TimedStatus[]=['ready_for_review','sent','changes_requested'];
const NEXT:Record<TeamStatusEvent['kind'],QuoteStatus>={sent:'sent',accepted:'accepted',changes_requested:'changes_requested',declined:'declined',expired:'expired'};

/** One quote, measured: everything a row sums or averages. */
interface Measured {
  fact:TeamQuoteFact;status:QuoteStatus;level:'ok'|'amber'|'red'|null;
  toSend:number|null;responses:number[];visits:Record<TimedStatus,number[]>;
  untouched:UntouchedReason|null;
}

/**
 * The quote's timeline: it starts in ready_for_review at created_at, and each status event moves it
 * on (events that don't change the status are ignored). The last visit is open until now if the
 * quote is still in that status, ends at the expiry instant if the quote has since expired without
 * a sweep, and is dropped if the timeline doesn't explain the quote's status.
 */
function timeline(fact:TeamQuoteFact,events:readonly TeamStatusEvent[],status:QuoteStatus,now:string){
  const visits:Record<TimedStatus,number[]>={ready_for_review:[],sent:[],changes_requested:[]};
  const hours=(from:string,to:string)=>Math.max(0,Date.parse(to)-Date.parse(from))/H;
  let current:QuoteStatus='ready_for_review',since=fact.created_at,firstSend:string|null=null,lastSend:string|null=null;
  const responses:number[]=[];
  for(const e of events){
    const next=NEXT[e.kind];
    if(next===current)continue;
    if((TIMED as readonly string[]).includes(current))visits[current as TimedStatus].push(hours(since,e.at));
    if(e.kind==='sent'){firstSend??=e.at;lastSend=e.at;}
    else if(RESPONSES.has(e.kind)&&lastSend){responses.push(hours(lastSend,e.at));lastSend=null;}
    current=next;since=e.at;
  }
  if((TIMED as readonly string[]).includes(current)){
    const end=current===status?now:current==='sent'&&status==='expired'&&fact.valid_until?expiresAt(fact.valid_until):null;
    if(end)visits[current as TimedStatus].push(hours(since,end));
  }
  return {toSend:firstSend?hours(fact.created_at,firstSend):null,responses,visits};
}

/** Why the quote went untouched (spec §7.3, OA-15), or null. */
function untouchedReason(f:TeamQuoteFact,status:QuoteStatus,level:Measured['level']):UntouchedReason|null{
  if(status==='expired')return 'expired_no_response';
  if(level!=='amber'&&level!=='red')return null;
  if(status==='ready_for_review')return f.last_rep_touch_at?'draft_opened_not_sent':'draft_never_opened';
  if(status==='changes_requested')return 'changes_not_revised';
  if(status==='sent'){
    const opened=!!f.customer_viewed_at&&(!f.sent_at||Date.parse(f.customer_viewed_at)>=Date.parse(f.sent_at));
    return opened?'sent_opened_no_reply':'sent_never_opened';
  }
  return null;
}

function measure(fact:TeamQuoteFact,events:readonly TeamStatusEvent[],{now,thresholds}:TeamMetricOptions):Measured{
  const status=effectiveStatus(fact,now);
  const level=aging(fact,now,thresholds)?.level??null;
  return {fact,status,level,...timeline(fact,events,status,now),untouched:untouchedReason(fact,status,level)};
}

/** One row over `quotes` (a rep's, or every selected rep's for the totals). */
function row(rep:Pick<TeamRow,'rep_id'|'name'|'team'|'active'>,quotes:readonly Measured[]):TeamRow{
  const statuses=zeros(QUOTE_STATUSES),declines=zeros(DECLINE_BUCKETS),untouched=zeros(UNTOUCHED_REASONS.map(r=>r.id));
  const open={total:0,ok:0,amber:0,red:0},value={quoted_cents:0,accepted_cents:0},freight={recovered_cents:0,modelled_cents:0};
  const upsell={suggestions_offered:0,suggestions_added:0,rep_upsell_lines:0};
  const toSend:number[]=[],responses:number[]=[],margins:number[]=[];
  const visits:Record<TimedStatus,number[]>={ready_for_review:[],sent:[],changes_requested:[]};
  for(const q of quotes){
    const f=q.fact;
    statuses[q.status]++;
    if(OPEN_STATUSES.includes(q.status)){open.total++;if(q.level)open[q.level]++;}
    if(q.toSend!==null)toSend.push(q.toSend);
    responses.push(...q.responses);
    for(const s of TIMED)visits[s].push(...q.visits[s]);
    const quoted=toCents(f.sent_total??f.draft_total??0);
    value.quoted_cents+=quoted;
    if(q.status==='accepted'){
      value.accepted_cents+=quoted;
      freight.recovered_cents+=f.recovered_cents;
      if(f.fulfillment==='delivery')freight.modelled_cents+=f.modelled_freight_cents??0;
    }
    const quoteMargin=f.priced_subtotal>0?margin(f.priced_subtotal,f.priced_cost):null;
    if(quoteMargin!==null)margins.push(quoteMargin);
    if(q.status==='declined')declines[f.decline_reason??'none']++;
    upsell.suggestions_offered+=f.suggestions_offered;upsell.suggestions_added+=f.suggestion_lines;upsell.rep_upsell_lines+=f.upsell_lines;
    if(q.untouched)untouched[q.untouched]++;
  }
  const created=quotes.length,decided=statuses.accepted+statuses.declined+statuses.expired;
  return {...rep,created,statuses,open,
    rates:{quote_to_order:ratio(statuses.accepted,created),unaccepted:ratio(statuses.declined+statuses.expired,created),decided_win:ratio(statuses.accepted,decided)},
    hours:{to_send:mean(toSend),customer_response:mean(responses),ready_for_review:mean(visits.ready_for_review),sent:mean(visits.sent),changes_requested:mean(visits.changes_requested)},
    value,avg_margin:mean(margins),freight,declines,
    upsell:{...upsell,suggestion_rate:ratio(upsell.suggestions_added,upsell.suggestions_offered)},
    untouched};
}

/** Every fact of a selected rep, measured, in time order of its status events. */
function measureCohort(selected:ReadonlySet<string>,facts:readonly TeamQuoteFact[],events:readonly TeamStatusEvent[],options:TeamMetricOptions):Measured[]{
  const byQuote=new Map<string,TeamStatusEvent[]>();
  for(const e of [...events].sort((a,b)=>a.at.localeCompare(b.at))){
    let list=byQuote.get(e.quote_id);
    if(!list)byQuote.set(e.quote_id,list=[]);
    list.push(e);
  }
  return facts.filter(f=>selected.has(f.rep_id)).map(f=>measure(f,byQuote.get(f.id)??[],options));
}

/** The Other notes of the measured quotes, newest first, each with its rep's name and its customer. */
function otherNotes(measured:readonly Measured[],repName:(id:string)=>string):OtherNote[]{
  return measured.filter(q=>q.status==='declined'&&q.fact.decline_reason==='other'&&q.fact.decline_note)
    .map(({fact:f}):OtherNote=>({quote_id:f.id,quote_number:f.quote_number,rep_id:f.rep_id,rep_name:repName(f.rep_id),customer_id:f.customer_id,customer_name:f.customer_name,note:f.decline_note!,declined_at:f.declined_at}))
    .sort((a,b)=>(b.declined_at??'').localeCompare(a.declined_at??''));
}

const TOTALS={rep_id:null,name:'Total',team:null,active:true};

/**
 * One row per selected rep (in the order given) and the totals row over all of them, from the
 * cohort's facts and status events. Quotes of reps not in `reps` are left out.
 */
export function teamMetricRows(reps:readonly MetricsRep[],facts:readonly TeamQuoteFact[],events:readonly TeamStatusEvent[],options:TeamMetricOptions):TeamMetricRows{
  const selected=new Map(reps.map(r=>[r.id,r]));
  const measured=measureCohort(new Set(selected.keys()),facts,events,options);
  const rows=reps.map(r=>row({rep_id:r.id,name:r.name,team:r.team,active:r.active},measured.filter(q=>q.fact.rep_id===r.id)));
  return {rows,totals:row(TOTALS,measured),other_notes:otherNotes(measured,id=>selected.get(id)!.name)};
}

// ---- Analytics' "Break the numbers down by" (plan U6) ----
//
// The same rows grouped by rep, team or customer. Only the grouping is new: every figure is row()'s,
// so the definitions above (decisions 23 to 25) hold for any group. The whole organization groups by
// rep, as the Rep leaderboard always has (C_AN6). The totals row is every selected rep's cohort.

/** The filter's choice (C_AN4): the whole organization, rep, team or customer. */
export type Breakdown='org'|'rep'|'team'|'customer';
/** What a row stands for. */
export type GroupDimension='rep'|'team'|'customer';
/** The row of the reps with no team label (no frame: the frames draw only labelled teams). */
export const NO_TEAM='No team';

export interface MetricGroup {
  /** Stable: the rep id, "team:<label>" ("team:" for no team) or "customer:<id>". */
  key:string;
  dimension:GroupDimension;
  name:string;team:string|null;active:boolean;
  /** Set for a rep row. */
  rep_id:string|null;
  /** Set for a customer row. */
  customer_id:string|null;
  /** The reps whose quotes the row counts (every selected rep for a customer row): its drill-down. */
  rep_ids:string[];
  members:readonly MetricsRep[];
}

/** A row of the breakdown: the TeamRow figures, its key, reps and customer. */
export interface GroupRow extends TeamRow {key:string;rep_ids:string[];customer_id:string|null}
export interface GroupMetricRows {dimension:GroupDimension;rows:GroupRow[];totals:TeamRow;other_notes:OtherNote[]}

/** A team as the breakdown reads it (plan U7): its name and every rep it counts, the members of the teams inside it too (decision 47). */
export interface MetricsTeam {name:string;rep_ids:readonly string[]}

/**
 * The rows for a breakdown over the selected reps: one per rep (in the order given); one per team with
 * any of those reps, in the teams' order (a parent counting the reps of the teams inside it, so a rep can
 * sit in more than one row; the totals still count each quote once), then the reps with no team; or one
 * per customer given, in that order. Without `teams`, each rep's team name stands for a team of its members.
 */
export function metricGroups(breakdown:Breakdown,reps:readonly MetricsRep[],customers:readonly {id:string;name:string}[],teams?:readonly MetricsTeam[]):MetricGroup[]{
  if(breakdown==='team'){
    const listed=teams??[...new Set(reps.flatMap(r=>r.team?[r.team]:[]))].sort((a,b)=>a.localeCompare(b)).map(name=>({name,rep_ids:reps.filter(r=>r.team===name).map(r=>r.id)}));
    const group=(name:string|null,members:MetricsRep[]):MetricGroup=>
      ({key:`team:${name??''}`,dimension:'team',name:name??NO_TEAM,team:name,active:true,rep_id:null,customer_id:null,rep_ids:members.map(r=>r.id),members});
    const rows=listed.map(t=>group(t.name,reps.filter(r=>t.rep_ids.includes(r.id)))).filter(g=>g.members.length);
    const none=reps.filter(r=>!r.team);
    return [...rows,...(none.length?[group(null,none)]:[])];
  }
  if(breakdown==='customer')return customers.map(c=>({key:`customer:${c.id}`,dimension:'customer',name:c.name,team:null,active:true,rep_id:null,customer_id:c.id,rep_ids:reps.map(r=>r.id),members:reps}));
  return reps.map(r=>({key:r.id,dimension:'rep',name:r.name,team:r.team,active:r.active,rep_id:r.id,customer_id:null,rep_ids:[r.id],members:[r]}));
}

/** The breakdown's rows and the totals over every group's reps, from the cohort's facts and status events. */
export function groupMetricRows(groups:readonly MetricGroup[],facts:readonly TeamQuoteFact[],events:readonly TeamStatusEvent[],options:TeamMetricOptions):GroupMetricRows{
  const reps=new Map(groups.flatMap(g=>g.members.map(r=>[r.id,r] as const)));
  const measured=measureCohort(new Set(reps.keys()),facts,events,options);
  const counts=(g:MetricGroup)=>(q:Measured)=>g.dimension==='customer'?q.fact.customer_id===g.customer_id:g.rep_ids.includes(q.fact.rep_id);
  const rows=groups.map((g):GroupRow=>({...row({rep_id:g.rep_id,name:g.name,team:g.team,active:g.active},measured.filter(counts(g))),key:g.key,rep_ids:g.rep_ids,customer_id:g.customer_id}));
  return {dimension:groups[0]?.dimension??'rep',rows,totals:row(TOTALS,measured),other_notes:otherNotes(measured,id=>reps.get(id)?.name??id)};
}
