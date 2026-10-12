import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {REPS_TABLE,TeamsAndReps} from '@/components/rep/teams/TeamsAndReps';
import {tablePrefs} from '@/server/repository';
import {signedInRep} from '@/server/rep/session';
import {teamsBoard} from '@/server/rep/teams';

export const metadata:Metadata={title:'Teams and Reps'};

/**
 * Teams and Reps (/rep/teams, decision 46; plan U7; C_TRBase to C_TR7): the manager's reps, their
 * customers and the teams. A rep has no Teams and Reps (Appendix B) and goes to their Quotes; anyone else
 * goes back to the workspace chooser (signedInRep). The page renders the board; every change saves
 * through its route (/api/rep/teams/**, /api/rep/settings/assignments, /api/rep/team/reps/<id>,
 * /api/rep/quotes/reassign) and the page shows the board the server returns.
 */
export default async function TeamsPage(){
  const {repId,manager}=await signedInRep();
  if(!manager)redirect('/rep/quotes');
  return <TeamsAndReps initial={teamsBoard(repId)} initialPrefs={tablePrefs(repId,REPS_TABLE)}/>;
}
