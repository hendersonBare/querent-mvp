import type {Metadata} from 'next';
import {PageFrame} from '@/features/shell/PageFrame';
import {requireUser} from '@/features/auth/server';

export const metadata:Metadata={title:'Settings'};

export default async function SettingsPage(){
  await requireUser('/settings');
  return <PageFrame title="Settings"><p>Match strictness and other settings will live here. Coming soon.</p></PageFrame>;
}
