import {describe,expect,it} from 'vitest';
import {countedReps,descendantIds,moveTargets,repsInTeams,treeOrder,wouldCycle,type TeamNode} from './tree';

// Teams as a tree (plan U7; decision 47): a team may sit inside one other team. A parent is grouping
// only: its reps are its own members plus every member of the teams inside it, for counts, the Reps
// filter and the Analytics team filter, never for permissions.

const T=(id:number,name:string,parent_team_id:number|null=null):TeamNode=>({id,name,parent_team_id});
// Sales > (Inside Sales > Counter), Field Sales; Yard on its own.
const TEAMS=[T(1,'Sales'),T(2,'Inside Sales',1),T(3,'Counter',2),T(4,'Field Sales',1),T(5,'Yard')];
const MEMBERS=[{rep_id:'mara',team_id:2},{rep_id:'brandi',team_id:2},{rep_id:'ted',team_id:3},{rep_id:'eli',team_id:4},{rep_id:'nora',team_id:5}];

describe('descendantIds',()=>{
  it('is the team and every team inside it, at any depth',()=>{
    expect([...descendantIds(TEAMS,1)].sort()).toEqual([1,2,3,4]);
    expect([...descendantIds(TEAMS,2)].sort()).toEqual([2,3]);
    expect([...descendantIds(TEAMS,5)]).toEqual([5]);
  });
  it('stops on a broken loop instead of running forever',()=>{
    expect([...descendantIds([T(1,'A',2),T(2,'B',1)],1)].sort()).toEqual([1,2]);
  });
});

describe('wouldCycle and moveTargets',()=>{
  it('refuses a team inside itself or inside a team that is inside it',()=>{
    expect(wouldCycle(TEAMS,1,1)).toBe(true);
    expect(wouldCycle(TEAMS,1,3)).toBe(true);
    expect(wouldCycle(TEAMS,2,3)).toBe(true);
    expect(wouldCycle(TEAMS,3,4)).toBe(false);
    expect(wouldCycle(TEAMS,1,5)).toBe(false);
    expect(wouldCycle(TEAMS,1,null)).toBe(false);
  });
  it('offers every other team except the ones inside it, in the list’s order',()=>{
    expect(moveTargets(TEAMS,2).map(t=>t.name)).toEqual(['Sales','Field Sales','Yard']);
    expect(moveTargets(TEAMS,1).map(t=>t.name)).toEqual(['Yard']);
  });
});

describe('countedReps: a parent counts the reps of the teams inside it',()=>{
  it('maps each team to its own members and its children’s',()=>{
    const counted=countedReps(TEAMS,MEMBERS);
    expect(counted.get(1)).toEqual(['brandi','eli','mara','ted']);
    expect(counted.get(2)).toEqual(['brandi','mara','ted']);
    expect(counted.get(3)).toEqual(['ted']);
    expect(counted.get(4)).toEqual(['eli']);
    expect(counted.get(5)).toEqual(['nora']);
  });
  it('gives an empty team no reps',()=>{
    expect(countedReps([...TEAMS,T(6,'Empty')],MEMBERS).get(6)).toEqual([]);
  });
});

describe('repsInTeams: the filter by team names',()=>{
  it('is every rep counted in any picked team, each once',()=>{
    expect(repsInTeams(TEAMS,MEMBERS,['Inside Sales','Yard']).sort()).toEqual(['brandi','mara','nora','ted']);
    expect(repsInTeams(TEAMS,MEMBERS,['Sales']).sort()).toEqual(['brandi','eli','mara','ted']);
    expect(repsInTeams(TEAMS,MEMBERS,[])).toEqual([]);
  });
});

describe('treeOrder',()=>{
  it('lists each team after its parent, oldest first at each level (as created), with its depth',()=>{
    expect(treeOrder(TEAMS).map(({team,depth})=>`${depth}:${team.name}`)).toEqual(['0:Sales','1:Inside Sales','2:Counter','1:Field Sales','0:Yard']);
  });
});
