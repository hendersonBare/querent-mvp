import type {Metadata} from 'next';
import {AnalyticsSection} from '@/components/rep/AnalyticsSection';

export const metadata:Metadata={title:'Analytics'};

/** Analytics (spec §4). Task 6.2 adds the stat cards and trends above the query analytics. */
export default function AnalyticsPage(){
  return <AnalyticsSection/>;
}
