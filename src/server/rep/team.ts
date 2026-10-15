import 'server-only';
import type {TeamRep} from '@/domain';
import {checkAgingThresholds,type AgingThresholds} from '@/server/quotes/aging';
import {agingThresholds,setAgingThresholds,setRepActive,teamReps} from '@/server/repository';
import {SettingsError} from './settings';

// The manager's settings (v3 spec §5, §6 Settings, §8; decisions 16, 20, 21; tasks D1, U7): each rep's
// active flag, set on Teams and Reps, and the supplier's aging thresholds. The routes serve them to the
// manager only (managerRoute); these functions check each request before it reaches the repository.
// Teams are entities since U7 (src/server/rep/teams.ts); the free-text team label is gone.
//
// Deactivation: refused while any customer is the rep's (customer_rep): give them another rep on Teams
// and Reps first. A manager can't deactivate themselves. An inactive rep's session is refused
// (repAccess), they can't be given customers, and they stay in Analytics history. Reactivating is always allowed.

export interface TeamSettings {reps:TeamRep[]}

/** GET /api/rep/team/reps: every rep with role, team, active flag and customer count. */
export function teamSettings():TeamSettings{return {reps:teamReps()};}

const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;

/** PUT /api/rep/team/reps/<id> {active}: marks the rep active or inactive. Returns every rep. */
export function updateTeamRep(actingRepId:string,repId:string,input:unknown):TeamSettings{
  const body=typeof input==='object'&&input!==null&&!Array.isArray(input)?input as Record<string,unknown>:{};
  if(!Object.hasOwn(body,'active'))throw new SettingsError('Change the active setting.');
  if(typeof body.active!=='boolean')throw new SettingsError('Choose active or inactive.');
  const active=body.active;
  const rep=teamReps().find(r=>r.id===repId);
  if(!rep)throw new SettingsError('Rep not found.',404);
  if(!active){
    if(repId===actingRepId)throw new SettingsError('You can’t mark yourself inactive.');
    if(rep.customer_count>0)throw hasCustomers(rep.name,rep.customer_count);
  }
  // The repository checks customers again in the same statement: a customer assigned meanwhile still blocks it.
  if(setRepActive(repId,active)==='has_customers')throw hasCustomers(rep.name,teamReps().find(r=>r.id===repId)?.customer_count??1);
  return teamSettings();
}

function hasCustomers(name:string,count:number){
  return new SettingsError(`${name} still has ${plural(count,'customer')}. Reassign ${count===1?'it':'them'} before marking ${name} inactive.`,409,'has_customers');
}

/** GET /api/rep/settings/aging: the six thresholds in hours (defaults in code, spec §1.3). */
export function agingSettings():AgingThresholds{return agingThresholds();}

/** PUT /api/rep/settings/aging: all six, whole hours, amber before red (checkAgingThresholds). The aging rule reads them on the next request. */
export function updateAgingSettings(input:unknown):AgingThresholds{
  const {thresholds,problem}=checkAgingThresholds(input);
  if(!thresholds)throw new SettingsError(problem);
  return setAgingThresholds(thresholds);
}
