import type {Metadata} from 'next';
import {AnalyticsPage} from '@/components/rep/analytics/AnalyticsPage';

export const metadata:Metadata={title:'Analytics'};

/** Analytics (spec §4, task 6.2): the stat cards and trends for the rep's customers, then the query analytics. */
export default function Analytics(){
  return <AnalyticsPage/>;
}
