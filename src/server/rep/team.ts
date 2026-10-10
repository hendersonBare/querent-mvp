import 'server-only';
import type {TeamRep} from '@/domain';
import {checkAgingThresholds,type AgingThresholds} from '@/server/quotes/aging';
import {agingThresholds,inTransaction,setAgingThresholds,setRepActive,setRepTeam,teamReps} from '@/server/repository';
import {SettingsError} from './settings';

// The manager's settings (v3 spec §5, §6 Settings, §8; decisions 16, 20, 21; task D1): each rep's
// team label (a free-text filter) and active flag, and the supplier's aging thresholds. The routes
// serve them to the manager only (managerRoute); these functions check each request before it
// reaches the repository.
//
// Deactivation: refused while any customer is the rep's (customer_rep): reassign them in Rep
// assignments first. A manager can't deactivate themselves. An inactive rep's session is refused
// (repAccess), they can't be given customers, and they stay in Team history. Reactivating is always allowed.

/** A team label: up to 40 characters after trimming, plain text. Blank clears it. */
export const TEAM_LABEL_MAX=40;
const CONTROL=/[\u0000-\u001f\u007f]/;

export interface TeamSettings {reps:TeamRep[]}

/** GET /api/rep/team/reps: every rep with role, team label, active flag and customer count. */
export function teamSettings():TeamSettings{return {reps:teamReps()};}

const plural=(n:number,word:string)=>`${n} ${word}${n===1?'':'s'}`;

/**
 * PUT /api/rep/team/reps/<id> {team?, active?}: sets the rep's team label (string or null) and/or
 * active flag, both or neither (nothing is written if any part is refused). Returns every rep.
 */
export function updateTeamRep(actingRepId:string,repId:string,input:unknown):TeamSettings{
  const body=typeof input==='object'&&input!==null&&!Array.isArray(input)?input as Record<string,unknown>:{};
  const hasTeam=Object.hasOwn(body,'team'),hasActive=Object.hasOwn(body,'active');
  if(!hasTeam&&!hasActive)throw new SettingsError('Change the team label or the active setting.');
  let team:string|null=null;
  if(hasTeam){
    const value=body.team;
    if(value!==null&&(typeof value!=='string'||CONTROL.test(value)))throw new SettingsError('Enter a team label, or leave it blank.');
    team=value?.trim()||null;
    if(team&&team.length>TEAM_LABEL_MAX)throw new SettingsError(`Keep the team label to ${TEAM_LABEL_MAX} characters.`);
  }
  if(hasActive&&typeof body.active!=='boolean')throw new SettingsError('Choose active or inactive.');
  const active=body.active as boolean|undefined;
  const rep=teamReps().find(r=>r.id===repId);
  if(!rep)throw new SettingsError('Rep not found.',404);
  if(active===false){
    if(repId===actingRepId)throw new SettingsError('You can’t mark yourself inactive.');
    if(rep.customer_count>0)throw hasCustomers(rep.name,rep.customer_count);
  }
  inTransaction(()=>{
    if(hasTeam)setRepTeam(repId,team);
    // The repository checks customers again in the same statement; a customer assigned meanwhile rolls the label back too.
    if(active!==undefined&&setRepActive(repId,active)==='has_customers')throw hasCustomers(rep.name,teamReps().find(r=>r.id===repId)?.customer_count??1);
  });
  return teamSettings();
}

function hasCustomers(name:string,count:number){
  return new SettingsError(`${name} still has ${plural(count,'customer')}. Reassign ${count===1?'it':'them'} in Rep assignments before marking ${name} inactive.`,409,'has_customers');
}

/** GET /api/rep/settings/aging: the six thresholds in hours (defaults in code, spec §1.3). */
export function agingSettings():AgingThresholds{return agingThresholds();}

/** PUT /api/rep/settings/aging: all six, whole hours, amber before red (checkAgingThresholds). The aging rule reads them on the next request. */
export function updateAgingSettings(input:unknown):AgingThresholds{
  const {thresholds,problem}=checkAgingThresholds(input);
  if(!thresholds)throw new SettingsError(problem);
  return setAgingThresholds(thresholds);
}
