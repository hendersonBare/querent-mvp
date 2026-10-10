import {describe,expect,it} from 'vitest';
import {customers,repStanding,reps,setAssignedRep,setRepActive,setRepTeam,teamReps} from './accounts';
import {useSeededDatabase} from './test-db';

// Roles, team labels and deactivation in the repository (v3 spec §1.2 "006" row, §8; decisions 20,
// 21; task D1). Seed: Brandi (manager) has Wasatch and Great Basin, Mara has Canyon Ridge, Nora has
// Uinta, Eli has no customers.
useSeededDatabase();

describe('the seeded team',()=>{
  it('lists every rep by name with role, team label, active flag and customer count',()=>{
    expect(teamReps()).toEqual([
      {id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',role:'manager',team:'Inside Sales',active:true,customer_count:2},
      {id:'eli',name:'Eli Porter',initials:'EP',title:'Outside Sales',role:'rep',team:'Outside Sales',active:true,customer_count:0},
      {id:'mara',name:'Mara Jensen',initials:'MJ',title:'Inside Sales',role:'rep',team:'Inside Sales',active:true,customer_count:1},
      {id:'nora',name:'Nora Chen',initials:'NC',title:'Account Manager',role:'rep',team:'Outside Sales',active:true,customer_count:1},
    ]);
  });

  it("reads one rep's stored role and active flag, and nothing for an unknown rep",()=>{
    expect(repStanding('brandi')).toEqual({role:'manager',active:true});
    expect(repStanding('mara')).toEqual({role:'rep',active:true});
    expect(repStanding('nobody')).toBeUndefined();
  });
});

describe('setRepTeam',()=>{
  it('stores a label or clears it, and says when the rep does not exist',()=>{
    expect(setRepTeam('eli','Field Sales')).toBe(true);
    expect(teamReps().find(r=>r.id==='eli')?.team).toBe('Field Sales');
    expect(setRepTeam('eli',null)).toBe(true);
    expect(teamReps().find(r=>r.id==='eli')?.team).toBeNull();
    expect(setRepTeam('nobody','X')).toBe(false);
    setRepTeam('eli','Outside Sales');
  });
});

describe('setRepActive: deactivation is blocked while the rep has customers',()=>{
  it("refuses to deactivate Mara while Canyon Ridge is hers, then allows it once the customer is reassigned",()=>{
    expect(setRepActive('mara',false)).toBe('has_customers');
    expect(repStanding('mara')?.active).toBe(true);
    expect(setAssignedRep('canyon-ridge','eli')).toBe(true);
    expect(setRepActive('mara',false)).toBe('ok');
    expect(repStanding('mara')?.active).toBe(false);
    expect(teamReps().find(r=>r.id==='mara')).toMatchObject({active:false,customer_count:0});
  });

  it('never assigns a customer to an inactive rep, and leaves inactive reps out of the active list',()=>{
    expect(setAssignedRep('canyon-ridge','mara')).toBe(false);
    expect(customers().find(c=>c.id==='canyon-ridge')?.rep_id).toBe('eli');
    expect(reps().map(r=>r.id)).toContain('mara');
    expect(reps({activeOnly:true}).map(r=>r.id)).toEqual(['brandi','eli','nora']);
  });

  it('reactivates a rep, and reports an unknown one',()=>{
    expect(setRepActive('mara',true)).toBe('ok');
    expect(repStanding('mara')?.active).toBe(true);
    expect(setAssignedRep('canyon-ridge','mara')).toBe(true);
    expect(setRepActive('nobody',false)).toBe('not_found');
    expect(setRepActive('nobody',true)).toBe('not_found');
  });
});
