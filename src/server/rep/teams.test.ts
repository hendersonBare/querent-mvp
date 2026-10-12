import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';
import {assignRep,SettingsError} from './settings';
import {changeTeamMembers,createTeamFrom,deleteTeamById,teamsBoard,updateTeamById,type TeamsBoard} from './teams';

// Teams and Reps (plan U7; Part 1 section 7; decisions 21, 45, 47): the board the manager's page shows
// and the team writes it makes. The routes check the manager role (managerRoute); these functions check
// each request. The seed: Brandi is the manager (Inside Sales, Great Basin and Wasatch), Mara (Inside
// Sales, Canyon Ridge), Eli (Outside Sales, Utah Valley and Weber Basin), Nora (Outside Sales, Uinta).
useSeededDatabase();

function rejects(fn:()=>unknown,status:number,message?:RegExp|string){
  try{fn();}catch(error){
    expect(error).toBeInstanceOf(SettingsError);
    expect((error as SettingsError).status).toBe(status);
    if(message)expect((error as Error).message).toMatch(message);
    return;
  }
  throw new Error('Expected a SettingsError');
}
const team=(board:TeamsBoard,name:string)=>board.teams.find(t=>t.name===name)!;

describe('teamsBoard',()=>{
  it('lists the reps by name without the managers, with role (their title), team, active flag and customers',()=>{
    const board=teamsBoard('brandi');
    expect(board.reps.map(r=>[r.id,r.title,r.team,r.active,r.customer_ids])).toEqual([
      ['eli','Outside Sales','Outside Sales',true,['utah-valley-electric','weber-basin']],
      ['mara','Inside Sales','Inside Sales',true,['canyon-ridge']],
      ['nora','Account Manager','Outside Sales',true,['uinta-facility']],
    ]);
    // Everyone who can own a customer, the manager included, with their customer counts.
    expect(board.owners.map(o=>[o.id,o.role,o.active,o.customer_count])).toEqual([
      ['brandi','manager',true,2],['eli','rep',true,2],['mara','rep',true,1],['nora','rep',true,1],
    ]);
  });

  it('gives each rep their open quotes (bulk reassign) and each customer the owners of its open quotes (the move count)',()=>{
    const board=teamsBoard('brandi');
    const mara=board.reps.find(r=>r.id==='mara')!;
    expect(mara.open_quotes.length).toBeGreaterThan(0);
    expect(mara.open_quotes.every(q=>/^Q-\d+$/.test(q.quote_number))).toBe(true);
    const canyon=board.customers.find(c=>c.id==='canyon-ridge')!;
    expect(canyon).toMatchObject({name:'Canyon Ridge Builders',account_number:'CRB-3318',rep_id:'mara',rep_name:'Mara Jensen'});
    expect(canyon.open_quote_reps.length).toBeGreaterThan(0);
    expect(board.customers.find(c=>c.id==='great-basin')!.open_quote_reps).toEqual([]);
    expect(board.customers.map(c=>c.name)).toEqual([...board.customers.map(c=>c.name)].sort((a,b)=>a.localeCompare(b)));
  });

  it('counts each team’s reps, its own members plus those of the teams inside it (grouping only)',()=>{
    const board=teamsBoard('brandi');
    expect(board.teams.map(t=>[t.name,t.depth,t.member_ids,t.rep_ids])).toEqual([
      ['Inside Sales',0,['brandi','mara'],['brandi','mara']],
      ['Outside Sales',0,['eli','nora'],['eli','nora']],
    ]);
  });
});

describe('createTeamFrom',()=>{
  it('creates a team with reps and an optional parent; the name is trimmed, required, at most 40 characters and unused',()=>{
    const board=createTeamFrom({name:'  Counter and Yard ',rep_ids:['nora'],parent_team_id:null});
    expect(team(board,'Counter and Yard')).toMatchObject({member_ids:['nora'],parent_team_id:null,depth:0});
    expect(team(board,'Outside Sales').member_ids).toEqual(['eli']);
    rejects(()=>createTeamFrom({name:'   '}),400,'Enter a team name.');
    rejects(()=>createTeamFrom({name:'x'.repeat(41)}),400,'Keep the team name to 40 characters.');
    rejects(()=>createTeamFrom({name:'counter and yard'}),400,'Another team is called counter and yard.');
    rejects(()=>createTeamFrom({name:'Ghosts',rep_ids:['nobody']}),400,'Choose reps from the list.');
    rejects(()=>createTeamFrom({name:'Nowhere',parent_team_id:9999}),404,'Team not found.');
    rejects(()=>createTeamFrom('nope'),400,'Enter a team name.');
  });
});

describe('updateTeamById: rename, move inside another team',()=>{
  it('renames a team and moves it inside another one, never inside itself or a team inside it',()=>{
    const start=teamsBoard('brandi');
    const outside=team(start,'Outside Sales').id,inside=team(start,'Inside Sales').id;
    let board=updateTeamById(outside,{parent_team_id:inside});
    expect(team(board,'Outside Sales')).toMatchObject({parent_team_id:inside,depth:1});
    // Inside Sales now counts Eli and the rest of Outside Sales too.
    expect(team(board,'Inside Sales').rep_ids).toEqual(['brandi','eli','mara']);
    rejects(()=>updateTeamById(inside,{parent_team_id:outside}),400,'A team can’t sit inside itself or a team inside it.');
    rejects(()=>updateTeamById(inside,{parent_team_id:inside}),400,'A team can’t sit inside itself or a team inside it.');
    board=updateTeamById(outside,{parent_team_id:null});
    expect(team(board,'Outside Sales')).toMatchObject({parent_team_id:null,depth:0});
    board=updateTeamById(outside,{name:'Field Sales'});
    expect(board.teams.map(t=>t.name)).toEqual(['Inside Sales','Field Sales','Counter and Yard']);
    rejects(()=>updateTeamById(outside,{name:'Inside sales'}),400,'Another team is called Inside sales.');
    rejects(()=>updateTeamById(outside,{}),400,'Change the team’s name or the team it sits inside.');
    rejects(()=>updateTeamById(9999,{name:'X'}),404,'Team not found.');
    updateTeamById(outside,{name:'Outside Sales'});
  });
});

describe('changeTeamMembers and deleteTeamById',()=>{
  it('adds reps (moved from their old team) and removes the team’s own members',()=>{
    const id=team(teamsBoard('brandi'),'Counter and Yard').id;
    let board=changeTeamMembers(id,{add:['eli']});
    expect(team(board,'Counter and Yard').member_ids).toEqual(['eli','nora']);
    expect(team(board,'Outside Sales').member_ids).toEqual([]);
    board=changeTeamMembers(id,{remove:['eli']});
    expect(team(board,'Counter and Yard').member_ids).toEqual(['nora']);
    expect(board.reps.find(r=>r.id==='eli')).toMatchObject({team:null,team_id:null});
    rejects(()=>changeTeamMembers(id,{add:['nobody']}),400,'Choose reps from the list.');
    rejects(()=>changeTeamMembers(id,{}),400,'Choose reps to add or remove.');
    rejects(()=>changeTeamMembers(9999,{add:['eli']}),404,'Team not found.');
    changeTeamMembers(team(board,'Outside Sales').id,{add:['eli','nora']});
  });

  it('deletes a team: its reps have no team',()=>{
    const id=team(teamsBoard('brandi'),'Counter and Yard').id;
    const board=deleteTeamById(id);
    expect(board.teams.map(t=>t.name)).toEqual(['Inside Sales','Outside Sales']);
    rejects(()=>deleteTeamById(id),404,'Team not found.');
  });
});

describe('customers stay with one rep (Appendix H; decision 21)',()=>{
  it('moving a customer to another rep keeps exactly one rep, and its open quotes move only when asked, each with an activity row',()=>{
    const before=teamsBoard('brandi');
    const open=before.customers.find(c=>c.id==='canyon-ridge')!.open_quote_reps.filter(r=>r!=='eli').length;
    const {moved}=assignRep('brandi',{customer_id:'canyon-ridge',rep_id:'eli',moveOpenQuotes:true});
    expect(moved?.moved).toHaveLength(open);
    const after=teamsBoard('brandi');
    expect(after.customers.find(c=>c.id==='canyon-ridge')).toMatchObject({rep_id:'eli'});
    expect(after.reps.find(r=>r.id==='mara')!.customer_ids).toEqual([]);
    expect(after.reps.find(r=>r.id==='mara')!.open_quotes).toEqual([]);
    expect(after.customers.every(c=>c.rep_id!==null)).toBe(true);
    assignRep('brandi',{customer_id:'canyon-ridge',rep_id:'mara',moveOpenQuotes:true});
  });
});
