// Teams as a tree (plan U7; decision 47). Pure: the teams and memberships are passed in.
// A team may sit inside one other team. A parent is grouping only: the reps it counts are its own
// members plus every member of the teams inside it, at any depth. That serves the Teams card's counts,
// the Reps filter and the Analytics team filter and breakdown; it never grants anything (TODO(R-12):
// hierarchical visibility). The list order is creation order (id) at each level, children after their parent.

export interface TeamNode {id:number;name:string;parent_team_id:number|null}
export interface Membership {rep_id:string;team_id:number}

/** The team and every team inside it, at any depth. A loop in the data (refused on write) cannot run forever. */
export function descendantIds(teams:readonly TeamNode[],id:number):Set<number>{
  const found=new Set<number>([id]);
  let grew=true;
  while(grew){
    grew=false;
    for(const t of teams)if(t.parent_team_id!==null&&found.has(t.parent_team_id)&&!found.has(t.id)){found.add(t.id);grew=true;}
  }
  return found;
}

/** Whether putting `id` inside `parentId` would make a loop: the team itself or a team inside it. */
export const wouldCycle=(teams:readonly TeamNode[],id:number,parentId:number|null)=>parentId!==null&&descendantIds(teams,id).has(parentId);

/** Each team after its parent, oldest first at each level, with its depth (0 for a team on its own). */
export function treeOrder<T extends TeamNode>(teams:readonly T[]):{team:T;depth:number}[]{
  const ids=new Set(teams.map(t=>t.id));
  const byId=[...teams].sort((a,b)=>a.id-b.id);
  const out:{team:T;depth:number}[]=[];
  const seen=new Set<number>();
  const visit=(parent:number|null,depth:number)=>{
    for(const team of byId){
      const top=team.parent_team_id===null||!ids.has(team.parent_team_id);
      if((parent===null?top:team.parent_team_id===parent)&&!seen.has(team.id)){seen.add(team.id);out.push({team,depth});visit(team.id,depth+1);}
    }
  };
  visit(null,0);
  // Teams caught in a loop (refused on write) still show, on their own.
  for(const team of byId)if(!seen.has(team.id)){seen.add(team.id);out.push({team,depth:0});}
  return out;
}

/** The teams a team can move inside: every other team except the ones inside it, in the list's order. */
export const moveTargets=<T extends TeamNode>(teams:readonly T[],id:number):T[]=>{
  const inside=descendantIds(teams,id);
  return treeOrder(teams).map(t=>t.team).filter(t=>!inside.has(t.id));
};

/** Each team's counted reps: its own members and those of the teams inside it, sorted by id. */
export function countedReps(teams:readonly TeamNode[],members:readonly Membership[]):Map<number,string[]>{
  return new Map(teams.map(t=>{
    const inside=descendantIds(teams,t.id);
    return [t.id,members.filter(m=>inside.has(m.team_id)).map(m=>m.rep_id).sort()] as const;
  }));
}

/** Every rep counted in any of the named teams, each once (the Reps and Analytics team filters). */
export function repsInTeams(teams:readonly TeamNode[],members:readonly Membership[],names:readonly string[]):string[]{
  const counted=countedReps(teams,members);
  return [...new Set(teams.filter(t=>names.includes(t.name)).flatMap(t=>counted.get(t.id)??[]))];
}
