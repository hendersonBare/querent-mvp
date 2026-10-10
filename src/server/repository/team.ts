import 'server-only';
import type {TeamQuoteFact,TeamStatusEvent} from '@/domain';
import {roundDollars} from '@/lib/money';
import {all,list} from './sql';

// The Team dashboard's live reads (v3 spec §7; decisions 23–25; OA-13, OA-19; task D3). Live SQL
// over the quotes as they are, no materialised tables. The cohort is the quotes created in
// [from, to) (UTC ISO instants the browser computed at its local midnights) whose current owner
// (quotes.rep_id, so a reassigned quote counts under its new rep) is one of `repIds`.
// Internal: the facts carry cost, for the manager's dashboard only.

export interface TeamCohort {from:string;to:string;repIds:readonly string[]}

const COHORT='q.created_at>=@from AND q.created_at<@to AND q.rep_id IN (SELECT value FROM json_each(@repIds))';
const bind=({from,to,repIds}:TeamCohort)=>({from,to,repIds:list(repIds)});

/**
 * The pop-up behind each quote (task E1, OA-42): the quote_requested message names the quote and
 * the item_popup message it came from, which recorded how many suggestions it offered.
 */
const OFFERED=`coalesce((SELECT sum(coalesce(json_extract(p.payload,'$.suggestions_offered'),0)) FROM messages r JOIN messages p ON p.id=json_extract(r.payload,'$.popup_message_id')
  WHERE r.kind='quote_requested' AND json_valid(r.payload) AND json_extract(r.payload,'$.quote_id')=q.id AND json_valid(p.payload)),0)`;

/** The cohort's quotes, oldest first, with what the metrics sum: totals, priced cost, recovery, line sources, the pop-up's offer count. The live draft total is the service's (it prices freight). */
export function teamQuoteFacts(cohort:TeamCohort):Omit<TeamQuoteFact,'draft_total'>[]{
  const rows=all<Omit<TeamQuoteFact,'draft_total'>>(`SELECT q.id,q.quote_number,q.rep_id,q.status,q.created_at,q.sent_at,q.responded_at,q.valid_until,q.fulfillment,
      q.last_rep_touch_at,q.customer_viewed_at,q.decline_reason,q.decline_note,q.declined_at,
      (SELECT v.total FROM quote_revisions v WHERE v.quote_id=q.id ORDER BY v.revision DESC LIMIT 1) sent_total,
      (SELECT coalesce(sum(l.qty*l.unit_price),0) FROM quote_lines l WHERE l.quote_id=q.id AND l.unit_price IS NOT NULL) priced_subtotal,
      (SELECT coalesce(sum(l.qty*l.unit_cost),0) FROM quote_lines l WHERE l.quote_id=q.id AND l.unit_price IS NOT NULL) priced_cost,
      (SELECT coalesce(sum(l.qty*l.freight_recovery),0) FROM quote_lines l WHERE l.quote_id=q.id) recovered_cents,
      q.modelled_freight_cents,
      (SELECT count(*) FROM quote_lines l WHERE l.quote_id=q.id AND l.added_by='suggestion') suggestion_lines,
      (SELECT count(*) FROM quote_lines l WHERE l.quote_id=q.id AND l.added_by='upsell') upsell_lines,
      ${OFFERED} suggestions_offered
    FROM quotes q WHERE ${COHORT} ORDER BY q.created_at,q.quote_number`,bind(cohort));
  return rows.map(r=>({...r,priced_subtotal:roundDollars(r.priced_subtotal),priced_cost:roundDollars(r.priced_cost)}));
}

/** The cohort's status changes (quote_activity sent, accepted, changes_requested, declined, expired), in time order: time to send, response time, time in status. */
export function teamStatusEvents(cohort:TeamCohort):TeamStatusEvent[]{
  return all<TeamStatusEvent>(`SELECT a.quote_id,a.at,a.kind FROM quote_activity a JOIN quotes q ON q.id=a.quote_id
    WHERE ${COHORT} AND a.kind IN ('sent','accepted','changes_requested','declined','expired') ORDER BY a.at,a.id`,bind(cohort));
}
