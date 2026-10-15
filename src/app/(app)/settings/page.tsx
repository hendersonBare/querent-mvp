import type {Metadata} from 'next';
import {PageFrame} from '@/features/shell/PageFrame';

export const metadata:Metadata={title:'Settings'};

export default function SettingsPage(){
  return <PageFrame title="Settings"><p>Match strictness and other settings will live here. Coming soon.</p></PageFrame>;
}
