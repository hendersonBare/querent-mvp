import 'server-only';
import type {RepRole} from '@/domain';
import {effectiveStatus} from '@/server/quotes/lifecycle';
import {expireOverdueQuotes} from '@/server/quotes/service';
import {
  addTeamMembers,createTeam,customers,deleteTeam,inTransaction,quotes,removeTeamMembers,renameTeam,setTeamParent,teamList,teamMemberships,teamReps,
} from '@/server/repository';
import {countedReps,treeOrder,wouldCycle} from '@/server/teams/tree';
import {SettingsError} from './settings';

// Teams and Reps (plan U7; Part 1 section 7; decisions 21, 45, 47): the manager's board and the team
// writes. The routes (/api/rep/teams/**) serve them to the manager only (managerRoute); these functions
// check each request before it reaches the repository. Customers move through the existing Rep
// assignments route (PUT /api/rep/settings/assignments: one rep per customer, "Also move this customer's
// open quotes" with an Activity entry each), quotes through POST /api/rep/quotes/reassign, and the
// active flag through PUT /api/rep/team/reps/<id> (refused while the rep has customers, decision 21).
// A parent team is grouping only (decision 47): its count takes in the reps of the teams inside it.

/** A team name: 1 to 40 characters after trimming, plain text. */
export const TEAM_NAME_MAX=40;
const CONTROL=/[\u0000-\u001f\u007f]/;

/** A rep the Reps card lists (no managers): their title (the frame's Role), team, active flag, customers and open quotes. */
export interface BoardRep {
  id:string;name:string;title:string;team_id:number|null;team:string|null;active:boolean;
  /** Their customers (customer_rep), by customer name. */
  customer_ids:string[];
  /** Their open quotes (drafts, change requests, sent and not expired): what a bulk reassign moves (decision 45). */
  open_quotes:{id:string;quote_number:string}[];
}
/** Anyone who can own a customer or sit in a team, the manager included. */
export interface BoardOwner {id:string;name:string;role:RepRole;active:boolean;customer_count:number}
export interface BoardTeam {
  id:number;name:string;parent_team_id:number|null;
  /** 0 for a team on its own, 1 inside another, and so on (the list's order: each team after its parent). */
  depth:number;
  /** Its own members, by id. */
  member_ids:string[];
  /** The reps it counts: its own members and those of the teams inside it, by id. */
  rep_ids:string[];
}
export interface BoardCustomer {
  id:string;name:string;account_number:string;rep_id:string|null;rep_name:string|null;
  /** The owner of each of its open quotes: how many move with it to a new rep (the ones that rep doesn't own yet). */
  open_quote_reps:string[];
}
export interface TeamsBoard {me:string;reps:BoardRep[];owners:BoardOwner[];teams:BoardTeam[];customers:BoardCustomer[]}

/** The statuses that move with a customer or in a bulk reassign: a sent quote only while it hasn't expired. */
const OPEN=['ready_for_review','changes_requested','sent'] as const;

/** GET /api/rep/teams: the whole board. Lazy expiry is stored first, so a sent quote past valid until is not open. */
export function teamsBoard(me:string,{now=new Date().toISOString()}:{now?:string}={}):TeamsBoard{
  expireOverdueQuotes({now});
  const people=teamReps();
  const everyone=customers();
  const open=quotes({statuses:[...OPEN]}).filter(q=>(OPEN as readonly string[]).includes(effectiveStatus(q,now)));
  const nodes=teamList(),members=teamMemberships();
  const counted=countedReps(nodes,members);
  return {
    me,
    reps:people.filter(p=>p.role==='rep').map(p=>({id:p.id,name:p.name,title:p.title,team_id:p.team_id,team:p.team,active:p.active,
      customer_ids:everyone.filter(c=>c.rep_id===p.id).map(c=>c.id),
      open_quotes:open.filter(q=>q.rep_id===p.id).sort((a,b)=>a.quote_number.localeCompare(b.quote_number)).map(q=>({id:q.id,quote_number:q.quote_number}))})),
    owners:people.map(p=>({id:p.id,name:p.name,role:p.role,active:p.active,customer_count:p.customer_count})),
    teams:treeOrder(nodes).map(({team,depth})=>({id:team.id,name:team.name,parent_team_id:team.parent_team_id,depth,
      member_ids:members.filter(m=>m.team_id===team.id).map(m=>m.rep_id).sort(),rep_ids:counted.get(team.id)??[]})),
    customers:everyone.map(c=>({id:c.id,name:c.name,account_number:c.account_number,rep_id:c.rep_id,rep_name:c.rep_name,
      open_quote_reps:open.filter(q=>q.customer_id===c.id).map(q=>q.rep_id)})),
  };
}

const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const NOT_FOUND=()=>new SettingsError('Team not found.',404);
const CYCLE='A team can’t sit inside itself or a team inside it.';

function teamName(value:unknown){
  if(typeof value!=='string'||CONTROL.test(value)||!value.trim())throw new SettingsError('Enter a team name.');
  const name=value.trim();
  if(name.length>TEAM_NAME_MAX)throw new SettingsError(`Keep the team name to ${TEAM_NAME_MAX} characters.`);
  return name;
}
function repIds(value:unknown){
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.some(v=>typeof v!=='string')||value.length>200)throw new SettingsError('Choose reps from the list.');
  return [...new Set(value as string[])];
}
function parentId(value:unknown){
  if(value===undefined||value===null)return null;
  if(typeof value!=='number'||!Number.isInteger(value))throw new SettingsError('Choose a team from the list.');
  return value;
}
const duplicate=(name:string)=>new SettingsError(`Another team is called ${name}.`);

/** POST /api/rep/teams {name, rep_ids?, parent_team_id?}: a new team, its reps moved out of their old teams. */
export function createTeamFrom(input:unknown,me=''):TeamsBoard{
  if(!isRecord(input))throw new SettingsError('Enter a team name.');
  const name=teamName(input.name),reps=repIds(input.rep_ids),parent=parentId(input.parent_team_id);
  const result=createTeam({name,parentId:parent,repIds:reps});
  if(!result.ok)throw result.reason==='duplicate'?duplicate(name):result.reason==='no_parent'?NOT_FOUND():new SettingsError('Choose reps from the list.');
  return teamsBoard(me);
}

/** PATCH /api/rep/teams/<id> {name?, parent_team_id?}: renames it and/or puts it inside another team (null: on its own). */
export function updateTeamById(id:number,input:unknown,me=''):TeamsBoard{
  const body=isRecord(input)?input:{};
  const hasName=Object.hasOwn(body,'name'),hasParent=Object.hasOwn(body,'parent_team_id');
  if(!hasName&&!hasParent)throw new SettingsError('Change the team’s name or the team it sits inside.');
  const name=hasName?teamName(body.name):null,parent=hasParent?parentId(body.parent_team_id):null;
  if(!teamList().some(t=>t.id===id))throw NOT_FOUND();
  if(hasParent&&wouldCycle(teamList(),id,parent))throw new SettingsError(CYCLE);
  inTransaction(()=>{
    if(name!==null){
      const renamed=renameTeam(id,name);
      if(renamed==='not_found')throw NOT_FOUND();
      if(renamed==='duplicate')throw duplicate(name);
    }
    if(hasParent){
      const moved=setTeamParent(id,parent);
      if(moved==='not_found'||moved==='no_parent')throw NOT_FOUND();
      if(moved==='cycle')throw new SettingsError(CYCLE);
    }
  });
  return teamsBoard(me);
}

/** DELETE /api/rep/teams/<id>: its reps have no team, the teams inside it stand on their own. */
export function deleteTeamById(id:number,me=''):TeamsBoard{
  if(!deleteTeam(id))throw NOT_FOUND();
  return teamsBoard(me);
}

/** PUT /api/rep/teams/<id>/members {add?, remove?}: reps moved into the team (out of their old one), or out of it. */
export function changeTeamMembers(id:number,input:unknown,me=''):TeamsBoard{
  const body=isRecord(input)?input:{};
  const add=repIds(body.add),remove=repIds(body.remove);
  if(!add.length&&!remove.length)throw new SettingsError('Choose reps to add or remove.');
  if(!teamList().some(t=>t.id===id))throw NOT_FOUND();
  inTransaction(()=>{
    if(add.length&&!addTeamMembers(id,add))throw new SettingsError('Choose reps from the list.');
    if(remove.length)removeTeamMembers(id,remove);
  });
  return teamsBoard(me);
}
