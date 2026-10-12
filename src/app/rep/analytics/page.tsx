import type {Metadata} from 'next';
import {AnalyticsPage} from '@/components/rep/analytics/AnalyticsPage';
import {readTablePrefs} from '@/server/rep/table-prefs';
import {signedInRep} from '@/server/rep/session';

/** The rail's label for the reader (plan U2): Analytics for the manager, My Analytics for a rep. */
export async function generateMetadata():Promise<Metadata>{
  return {title:(await signedInRep()).manager?'Analytics':'My Analytics'};
}

/** The Analytics tables whose column order (and hidden columns) are the reader's own (plan U0, U6). */
const TABLES=['analytics-weeks','analytics-leaderboard','analytics-declines','analytics-untouched','analytics-queries'] as const;

/**
 * Analytics (spec §4; plan U6): the Overview, the Rep leaderboard (manager), Decline reasons, Untouched
 * quotes and Customer questions, read from GET /api/rep/analytics in the browser (its own midnights,
 * OA-19). The page passes the reader's saved column prefs for its tables.
 */
export default async function Analytics(){
  const {repId}=await signedInRep();
  return <AnalyticsPage prefs={Object.fromEntries(TABLES.map(table=>[table,readTablePrefs(repId,table).prefs]))}/>;
}
