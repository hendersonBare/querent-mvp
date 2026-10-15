import type {Metadata} from 'next';
import {PageFrame} from '@/features/shell/PageFrame';
import {requireUser} from '@/features/auth/server';
import {SETTINGS_COPY} from '@/features/settings/copy';
import {MatchStrictnessForm} from '@/features/settings/MatchStrictnessForm';
import s from '@/features/settings/Settings.module.css';
import {getOrgSettings} from '@/server/repository';

export const metadata:Metadata={title:'Settings'};

// The organization's settings (docs/boxt/plan.md B7): the Match strictness card
// (src/features/settings/MatchStrictnessForm.tsx) with the saved level, then a line saying more is coming.
export default async function SettingsPage(){
  const {db}=await requireUser('/settings');
  const {matchStrictness}=await getOrgSettings(db);
  return <PageFrame title={SETTINGS_COPY.title}>
    <div className={s.page}>
      <MatchStrictnessForm initial={matchStrictness}/>
      <p className={s.comingSoon}>{SETTINGS_COPY.comingSoon}</p>
    </div>
  </PageFrame>;
}
