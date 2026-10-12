import {fromCents} from '@/lib/money';
import {csvDocument,type CsvValue} from '@/server/export/csv';
import {plainAmount} from '@/server/export/line-items';
import {DECLINE_REASON_LABELS} from '@/server/quotes';
import {DECLINE_BUCKETS,UNTOUCHED_REASONS,type DeclineBucket,type TeamMetricRows,type TeamRow} from './metrics';

// Export CSV on the Team dashboard (v3 spec §5, §6 Team; decision 23; task D3): the leaderboard as
// GET /api/rep/team/metrics.csv serves it, through src/server/export/csv.ts (BOM, CRLF, formula
// guard). One line per selected rep, then the totals. Rates and margins are percentages to one
// decimal, times are hours to one decimal, money is dollars to the cent; a rate with nothing to
// divide by is an empty cell. Internal: it carries margin, for the manager only.

export const TEAM_CSV_FILENAME='team-metrics.csv';

const DECLINE_LABELS:Record<DeclineBucket,string>={...DECLINE_REASON_LABELS,none:'No reason given'};

const COLUMNS:readonly [header:string,value:(r:TeamRow)=>CsvValue][]=[
  ['Rep',r=>r.name],['Team',r=>r.team],['Created',r=>r.created],
  ['Draft ready',r=>r.statuses.ready_for_review],['Changes requested',r=>r.statuses.changes_requested],['Sent',r=>r.statuses.sent],
  ['Accepted',r=>r.statuses.accepted],['Declined',r=>r.statuses.declined],['Expired',r=>r.statuses.expired],
  ['Open',r=>r.open.total],['Open ok',r=>r.open.ok],['Open aging (amber)',r=>r.open.amber],['Open overdue (red)',r=>r.open.red],
  ['Quote-to-order rate (%)',r=>percent(r.rates.quote_to_order)],['Unaccepted rate (%)',r=>percent(r.rates.unaccepted)],['Decided win rate (%)',r=>percent(r.rates.decided_win)],
  ['Time to send (h)',r=>tenths(r.hours.to_send)],['Customer response time (h)',r=>tenths(r.hours.customer_response)],
  ['Time in draft ready (h)',r=>tenths(r.hours.ready_for_review)],['Time in sent (h)',r=>tenths(r.hours.sent)],['Time in changes requested (h)',r=>tenths(r.hours.changes_requested)],
  ['Total quoted value ($)',r=>dollars(r.value.quoted_cents)],['Accepted value ($)',r=>dollars(r.value.accepted_cents)],['Average quoted margin (%)',r=>percent(r.avg_margin)],
  ['Freight recovered ($)',r=>dollars(r.freight.recovered_cents)],['Modelled freight cost ($)',r=>dollars(r.freight.modelled_cents)],
  ...DECLINE_BUCKETS.map((b):[string,(r:TeamRow)=>CsvValue]=>[`Declined: ${DECLINE_LABELS[b]}`,r=>r.declines[b]]),
  ['Suggestions offered',r=>r.upsell.suggestions_offered],['Suggestions added',r=>r.upsell.suggestions_added],
  ['Suggestion acceptance rate (%)',r=>percent(r.upsell.suggestion_rate)],['Rep upsell lines',r=>r.upsell.rep_upsell_lines],
  ...UNTOUCHED_REASONS.map(({id,label}):[string,(r:TeamRow)=>CsvValue]=>[`Untouched: ${label}`,r=>r.untouched[id]]),
];

/** The header row. */
export const TEAM_CSV_COLUMNS=COLUMNS.map(([header])=>header);

const tenths=(value:number|null)=>value===null?null:Math.round(value*10)/10;
const percent=(rate:number|null)=>rate===null?null:tenths(rate*100);
const dollars=(cents:number)=>plainAmount(fromCents(cents));

/**
 * The CSV text: the header, each row's line, then the totals. `first` names the first column after
 * what a row stands for (Analytics' breakdown, plan U6: Rep, Team or Customer); every other column is the same.
 */
export function teamMetricsCsv({rows,totals}:Pick<TeamMetricRows,'rows'|'totals'>,{first='Rep'}:{first?:'Rep'|'Team'|'Customer'}={}):string{
  return csvDocument([[first,...TEAM_CSV_COLUMNS.slice(1)],...[...rows,totals].map(r=>COLUMNS.map(([,value])=>value(r)))]);
}
