import {repJson,repRoute} from '@/server/rep/http';
import {quoteListOptions,repQuoteList} from '@/server/rep/quotes';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/quotes: the Quotes list (spec §4; plan U3), newest request first, with per-status
 * counts (the board's lanes). The Quotes page renders it and its poll re-reads it with the same query.
 * Rep-only: it carries margin.
 *
 * The filter panel (C_QOB2): ?status=<status> or a list (?status=sent,accepted), ?customer=<id> (the
 * page's own filter; a customer the rep can't read is ignored), ?requested_from=&requested_to=
 * (YYYY-MM-DD, UTC days) and ?only=overdue,aging,below_floor. The counts cover every filter but the
 * status ones. ?attention=1 is the old Needs attention view (red then amber then quoted total, or
 * oldest first with &sort=oldest), kept for links (v3 spec §3, task A2).
 *
 * Scope is role based (Appendix B; decisions 20, 22; task U1): a rep's own quotes, or every rep's for
 * the manager; the old ?scope=all is ignored. The manager also filters by &rep=<id>&team=<label>; the
 * Team dashboard's drill-down (task D3) adds &rep=a,b, &from=&to= (created in [from, to)) and &aging=ok|amber|red.
 */
export const GET=repRoute(async(repId,request,_context,session)=>
  repJson(await repQuoteList(repId,{...quoteListOptions(request.nextUrl.searchParams),manager:session.manager})));
