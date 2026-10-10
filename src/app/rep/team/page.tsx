import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {TeamDashboard} from '@/components/rep/team/TeamDashboard';
import {managerListOptions} from '@/server/rep/quotes';
import {signedInRep} from '@/server/rep/session';

export const metadata:Metadata={title:'Team'};

/**
 * Team (v3 spec §6 Team, §7; decisions 23–25; task D3): the manager's dashboard. A rep has no Team
 * section and goes to their Quotes; anyone else goes back to the workspace chooser (signedInRep).
 * The page renders the rep and team options; the browser picks its window (its own local midnights,
 * OA-19) and reads GET /api/rep/team/metrics.
 */
export default async function TeamPage(){
  const {manager}=await signedInRep();
  if(!manager)redirect('/rep/quotes');
  const {reps,teams}=managerListOptions();
  return <TeamDashboard reps={reps} teams={teams}/>;
}
