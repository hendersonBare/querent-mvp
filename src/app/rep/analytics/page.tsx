import type {Metadata} from 'next';
import {AnalyticsPage} from '@/components/rep/analytics/AnalyticsPage';
import {signedInRep} from '@/server/rep/session';

/** The rail's label for the reader (plan U2): Analytics for the manager, My Analytics for a rep. */
export async function generateMetadata():Promise<Metadata>{
  return {title:(await signedInRep()).manager?'Analytics':'My Analytics'};
}

/** Analytics (spec §4, task 6.2): the stat cards and trends for the rep's customers, then the query analytics. */
export default function Analytics(){
  return <AnalyticsPage/>;
}
