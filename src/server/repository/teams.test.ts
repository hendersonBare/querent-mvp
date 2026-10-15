import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from './test-db';

// Teams (011_teams; plan U7; decision 47): create, rename, delete, members in and out (one team per
// rep), and a team moved inside another one, never inside itself or a team inside it. The seed turns
// the reps' labels into Inside Sales (Brandi, Mara) and Outside Sales (Eli, Nora).
useSeededDatabase();

const repo=()=>import('./index');
const names=async()=>(await repo()).teamList().map(t=>t.name);
async function membersOf(name:string){
  const r=await repo();
  const team=r.teamList().find(t=>t.name===name)!;
  return r.teamMemberships().filter(m=>m.team_id===team.id).map(m=>m.rep_id).sort();
}
const idOf=async(name:string)=>(await repo()).teamList().find(t=>t.name===name)!.id;

describe('the seed’s teams',()=>{
  it('are the reps’ labels as teams, oldest first, each rep a member of their own',async()=>{
    const r=await repo();
    expect(r.teamList().map(({name,parent_team_id})=>({name,parent_team_id}))).toEqual([
      {name:'Inside Sales',parent_team_id:null},{name:'Outside Sales',parent_team_id:null},
    ]);
    expect(await membersOf('Inside Sales')).toEqual(['brandi','mara']);
    expect(await membersOf('Outside Sales')).toEqual(['eli','nora']);
    // The Reps card's team is the rep's team entity.
    expect(r.teamReps().map(t=>[t.id,t.team,t.team_id===null?null:'id'])).toEqual([
      ['brandi','Inside Sales','id'],['eli','Outside Sales','id'],['mara','Inside Sales','id'],['nora','Outside Sales','id'],
    ]);
  });
});

describe('createTeam, renameTeam, deleteTeam',()=>{
  it('creates a team with reps taken from their old team, inside another team or on its own',async()=>{
    const r=await repo();
    const created=r.createTeam({name:'Counter and Yard',parentId:null,repIds:['nora']});
    expect(created).toEqual({ok:true,id:expect.any(Number)});
    expect(await names()).toEqual(['Inside Sales','Outside Sales','Counter and Yard']);
    expect(await membersOf('Counter and Yard')).toEqual(['nora']);
    expect(await membersOf('Outside Sales')).toEqual(['eli']);
    expect(r.createTeam({name:'counter AND yard',parentId:null,repIds:[]})).toEqual({ok:false,reason:'duplicate'});
    expect(r.createTeam({name:'Nowhere',parentId:9999,repIds:[]})).toEqual({ok:false,reason:'no_parent'});
    expect(r.createTeam({name:'Ghosts',parentId:null,repIds:['nobody']})).toEqual({ok:false,reason:'no_rep'});
    expect(await names()).toEqual(['Inside Sales','Outside Sales','Counter and Yard']);
    const child=r.createTeam({name:'Will call',parentId:await idOf('Counter and Yard'),repIds:[]});
    expect(child.ok).toBe(true);
    expect(r.teamList().find(t=>t.name==='Will call')!.parent_team_id).toBe(await idOf('Counter and Yard'));
  });

  it('renames a team, refusing a name another team has',async()=>{
    const r=await repo();
    const id=await idOf('Counter and Yard');
    expect(r.renameTeam(id,'Counter')).toBe('ok');
    expect(r.renameTeam(id,'inside sales')).toBe('duplicate');
    expect(r.renameTeam(id,'COUNTER')).toBe('ok');
    expect(r.renameTeam(9999,'X')).toBe('not_found');
    expect(await names()).toEqual(['Inside Sales','Outside Sales','COUNTER','Will call']);
  });

  it('deletes a team: its reps have no team, the teams inside it stand on their own',async()=>{
    const r=await repo();
    expect(r.deleteTeam(await idOf('COUNTER'))).toBe(true);
    expect(r.deleteTeam(9999)).toBe(false);
    expect(await names()).toEqual(['Inside Sales','Outside Sales','Will call']);
    expect(r.teamList().find(t=>t.name==='Will call')!.parent_team_id).toBeNull();
    expect(r.teamReps().find(t=>t.id==='nora')).toMatchObject({team:null,team_id:null});
    expect(r.deleteTeam(await idOf('Will call'))).toBe(true);
  });
});

describe('members',()=>{
  it('adds reps, moving each from their old team (one team per rep), and removes only the team’s own members',async()=>{
    const r=await repo();
    const inside=await idOf('Inside Sales'),outside=await idOf('Outside Sales');
    expect(r.addTeamMembers(inside,['nora','eli'])).toBe(true);
    expect(await membersOf('Inside Sales')).toEqual(['brandi','eli','mara','nora']);
    expect(await membersOf('Outside Sales')).toEqual([]);
    expect(r.addTeamMembers(inside,['nobody'])).toBe(false);
    expect(r.addTeamMembers(9999,['eli'])).toBe(false);
    expect(r.removeTeamMembers(outside,['mara'])).toBe(0);
    expect(r.removeTeamMembers(inside,['eli','nora'])).toBe(2);
    expect(await membersOf('Inside Sales')).toEqual(['brandi','mara']);
    expect(r.addTeamMembers(outside,['eli','nora'])).toBe(true);
  });
});

describe('setTeamParent: a parent is grouping only, and never a loop',()=>{
  it('moves a team inside another, refuses itself and the teams inside it, and clears the parent',async()=>{
    const r=await repo();
    const inside=await idOf('Inside Sales'),outside=await idOf('Outside Sales');
    expect(r.setTeamParent(outside,inside)).toBe('ok');
    expect(r.setTeamParent(inside,outside)).toBe('cycle');
    expect(r.setTeamParent(inside,inside)).toBe('cycle');
    const deep=r.createTeam({name:'Deep',parentId:outside,repIds:[]});
    if(!deep.ok)throw new Error('not created');
    expect(r.setTeamParent(inside,deep.id)).toBe('cycle');
    expect(r.setTeamParent(inside,9999)).toBe('no_parent');
    expect(r.setTeamParent(9999,inside)).toBe('not_found');
    expect(r.teamList().find(t=>t.id===outside)!.parent_team_id).toBe(inside);
    expect(r.setTeamParent(outside,null)).toBe('ok');
    expect(r.teamList().find(t=>t.id===outside)!.parent_team_id).toBeNull();
    r.deleteTeam(deep.id);
  });
});
