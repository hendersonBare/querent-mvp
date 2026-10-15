import {describe,expect,it} from 'vitest';
import {agingThresholds,setAssignedRep} from '@/server/repository';
import {useSeededDatabase} from '@/server/repository/test-db';
import {SettingsError} from './settings';
import {agingSettings,teamSettings,updateAgingSettings,updateTeamRep} from './team';

// Manager settings (v3 spec §5, §6 Settings, §8; decisions 16, 20, 21; tasks D1, U7):
// deactivation (blocked while the rep has customers; never yourself) and the aging thresholds.
// The routes check the manager role (managerRoute); these functions check the request.
useSeededDatabase();

function rejects(fn:()=>unknown,status:number,message?:RegExp|string,code?:string){
  try{fn();}catch(error){
    expect(error).toBeInstanceOf(SettingsError);
    expect((error as SettingsError).status).toBe(status);
    if(message)expect((error as Error).message).toMatch(message);
    if(code)expect((error as SettingsError).code).toBe(code);
    return;
  }
  throw new Error('Expected a SettingsError');
}
const row=(id:string)=>teamSettings().reps.find(r=>r.id===id)!;

describe('updateTeamRep: the request',()=>{
  it('takes the active flag only (teams are entities since U7, set on Teams and Reps), changing nothing on a bad request',()=>{
    rejects(()=>updateTeamRep('brandi','eli',{}),400,'Change the active setting.');
    rejects(()=>updateTeamRep('brandi','eli',{team:'Field Sales'}),400,'Change the active setting.');
    rejects(()=>updateTeamRep('brandi','eli','nope'),400);
    rejects(()=>updateTeamRep('brandi','eli',{active:'no'}),400,'Choose active or inactive.');
    rejects(()=>updateTeamRep('brandi','nobody',{active:true}),404,'Rep not found.');
    expect(row('eli')).toMatchObject({team:'Outside Sales',active:true});
  });
});

describe('updateTeamRep: deactivation',()=>{
  it("refuses Mara while she has a customer (409 has_customers, in plain words), then allows it after reassigning",()=>{
    rejects(()=>updateTeamRep('brandi','mara',{active:false}),409,'Mara Jensen still has 1 customer. Reassign it before marking Mara Jensen inactive.','has_customers');
    expect(row('mara').active).toBe(true);
    setAssignedRep('canyon-ridge','eli');
    expect(updateTeamRep('brandi','mara',{active:false}).reps.find(r=>r.id==='mara')).toMatchObject({active:false,customer_count:0});
    // Back on, and the customer back with her.
    expect(updateTeamRep('brandi','mara',{active:true}).reps.find(r=>r.id==='mara')?.active).toBe(true);
    setAssignedRep('canyon-ridge','mara');
  });

  it('counts customers in the message; once they have another rep the flag changes, and the team stays',()=>{
    rejects(()=>updateTeamRep('mara','brandi',{active:false}),409,/^Brandi Gallegos still has 2 customers\. Reassign them before/,'has_customers');
    // Eli's two demo customers (task F1) move to Nora first, and back after.
    for(const id of ['utah-valley-electric','weber-basin'])setAssignedRep(id,'nora');
    expect(updateTeamRep('brandi','eli',{active:false}).reps.find(r=>r.id==='eli')).toMatchObject({team:'Outside Sales',active:false});
    updateTeamRep('brandi','eli',{active:true});
    for(const id of ['utah-valley-electric','weber-basin'])setAssignedRep(id,'eli');
  });

  it('never lets a manager deactivate themselves',()=>{
    rejects(()=>updateTeamRep('brandi','brandi',{active:false}),400,'You can’t mark yourself inactive.');
    expect(row('brandi').active).toBe(true);
    expect(updateTeamRep('brandi','brandi',{active:true}).reps.find(r=>r.id==='brandi')).toMatchObject({team:'Inside Sales',active:true});
  });
});

describe('aging settings',()=>{
  it('reads the six thresholds in hours (the defaults on the seed)',()=>{
    expect(agingSettings()).toEqual({rfrAmberH:4,rfrRedH:24,crAmberH:4,crRedH:24,sentAmberH:72,sentRedH:168});
  });

  it('saves all six, which the aging rule then reads (agingThresholds)',()=>{
    const next={rfrAmberH:2,rfrRedH:8,crAmberH:3,crRedH:12,sentAmberH:48,sentRedH:96};
    expect(updateAgingSettings(next)).toEqual(next);
    expect(agingThresholds()).toEqual(next);
    expect(agingSettings()).toEqual(next);
  });

  it('refuses a bad set with the reason, keeping what was stored',()=>{
    const before=agingThresholds();
    rejects(()=>updateAgingSettings({...before,crAmberH:12}),400,'Changes requested: amber must come before red.');
    rejects(()=>updateAgingSettings({...before,sentRedH:5000}),400,'Sent red must be from 1 to 2160 hours.');
    rejects(()=>updateAgingSettings({rfrAmberH:1}),400,'Enter whole hours for Ready for review red.');
    rejects(()=>updateAgingSettings(undefined),400);
    expect(agingThresholds()).toEqual(before);
    updateAgingSettings({rfrAmberH:4,rfrRedH:24,crAmberH:4,crRedH:24,sentAmberH:72,sentRedH:168});
  });
});
