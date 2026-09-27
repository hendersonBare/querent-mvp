import type {Metadata} from 'next';
import {SettingsSection} from '@/components/rep/SettingsSection';

export const metadata:Metadata={title:'Settings'};

/** Settings (spec §4). Task 6.1 adds Rep assignments, delivery rates, margin floors and the scarcity toggle. */
export default function SettingsPage(){
  return <SettingsSection/>;
}
