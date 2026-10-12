import 'server-only';
import type {Membership,TeamNode} from '@/server/teams/tree';
import {all,inTransaction,list,one,run} from './sql';

// Teams (011_teams; plan U7; Appendix C "teams"; decision 47): a name, an optional parent team, and
// members (each rep in at most one team). The service (src/server/rep/teams.ts) checks each request
// first; these functions recheck what the database decides in the same statement (unique names, the
// parent exists, no loop), so a write that raced another one is still refused. A parent is grouping only.

/** Every team, oldest first (the Teams card's order at each level). */
export function teamList():TeamNode[]{return all<TeamNode>('SELECT id,name,parent_team_id FROM teams ORDER BY id');}

/** Every rep's team, by rep. */
export function teamMemberships():Membership[]{return all<Membership>('SELECT rep_id,team_id FROM team_members ORDER BY rep_id');}

const exists=(id:number)=>!!one('SELECT 1 FROM teams WHERE id=?',id);
/** Another team already has this name, whatever its case. */
const taken=(name:string,except:number|null=null)=>!!one('SELECT 1 FROM teams WHERE name=? COLLATE NOCASE AND (? IS NULL OR id<>?)',name,except,except);
const allReps=(repIds:readonly string[])=>(one<{n:number}>('SELECT count(*) n FROM reps WHERE id IN (SELECT value FROM json_each(?))',list(repIds))?.n??0)===new Set(repIds).size;

/** Moves the reps into the team (out of any other): one team per rep. */
function join(teamId:number,repIds:readonly string[]){
  run(`INSERT INTO team_members(rep_id,team_id) SELECT value,? FROM json_each(?) WHERE 1
    ON CONFLICT(rep_id) DO UPDATE SET team_id=excluded.team_id`,teamId,list(repIds));
}

export type CreateTeamResult={ok:true;id:number}|{ok:false;reason:'duplicate'|'no_parent'|'no_rep'};

/** Creates a team, inside `parentId` or on its own, with the reps moved into it. Nothing is written if any part is refused. */
export function createTeam({name,parentId,repIds}:{name:string;parentId:number|null;repIds:readonly string[]}):CreateTeamResult{
  return inTransaction(():CreateTeamResult=>{
    if(taken(name))return {ok:false,reason:'duplicate'};
    if(parentId!==null&&!exists(parentId))return {ok:false,reason:'no_parent'};
    if(!allReps(repIds))return {ok:false,reason:'no_rep'};
    const id=Number(run('INSERT INTO teams(name,parent_team_id) VALUES(?,?)',name,parentId).lastInsertRowid);
    join(id,repIds);
    return {ok:true,id};
  });
}

/** Renames a team. A name another team has (whatever its case) is refused. */
export function renameTeam(id:number,name:string):'ok'|'not_found'|'duplicate'{
  return inTransaction(()=>{
    if(!exists(id))return 'not_found';
    if(taken(name,id))return 'duplicate';
    run('UPDATE teams SET name=? WHERE id=?',name,id);
    return 'ok';
  });
}

/** Deletes a team: its reps have no team, and the teams inside it stand on their own. */
export function deleteTeam(id:number){
  return inTransaction(()=>{
    run('DELETE FROM team_members WHERE team_id=?',id);
    run('UPDATE teams SET parent_team_id=NULL WHERE parent_team_id=?',id);
    return run('DELETE FROM teams WHERE id=?',id).changes>0;
  });
}

/**
 * Puts a team inside another one, or on its own (null). Refused when the parent is the team itself or a
 * team inside it (checked in the same statement, so two moves at once can't make a loop).
 */
export function setTeamParent(id:number,parentId:number|null):'ok'|'not_found'|'no_parent'|'cycle'{
  return inTransaction(()=>{
    if(!exists(id))return 'not_found';
    if(parentId!==null&&!exists(parentId))return 'no_parent';
    const changed=run(`UPDATE teams SET parent_team_id=@parent WHERE id=@id AND (@parent IS NULL OR NOT EXISTS(
        WITH RECURSIVE inside(id) AS (SELECT @id UNION SELECT t.id FROM teams t JOIN inside ON t.parent_team_id=inside.id)
        SELECT 1 FROM inside WHERE id=@parent))`,{id,parent:parentId}).changes;
    return changed?'ok':'cycle';
  });
}

/** Moves the reps into the team (out of any other). False for an unknown team or rep: nothing is written. */
export function addTeamMembers(teamId:number,repIds:readonly string[]){
  return inTransaction(()=>{
    if(!exists(teamId)||!allReps(repIds))return false;
    join(teamId,repIds);
    return true;
  });
}

/** Takes the reps out of the team; a rep in another team stays there. Returns how many left it. */
export function removeTeamMembers(teamId:number,repIds:readonly string[]){
  return run('DELETE FROM team_members WHERE team_id=? AND rep_id IN (SELECT value FROM json_each(?))',teamId,list(repIds)).changes;
}
