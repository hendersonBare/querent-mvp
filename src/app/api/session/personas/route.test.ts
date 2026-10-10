import {describe,expect,it} from 'vitest';
import {setRepFixture,useSeededDatabase} from '@/server/repository/test-db';

// GET /api/session/personas (v3 decision 39, spec §6 Workspace chooser, §8, OA-27; task F1): the rep
// personas the workspace chooser offers next to Brandi (the manager, always offered as the supplier
// workspace), with their role and team label. An inactive rep is not offered. No contact details.
useSeededDatabase();

async function get(){
  const {GET}=await import('./route');
  const response=GET();
  return {status:response.status,cache:response.headers.get('cache-control'),json:await response.json()};
}

describe('the rep personas',()=>{
  it('offers Mara and Eli as reps, with their team labels, never cached',async()=>{
    const {status,cache,json}=await get();
    expect(status).toBe(200);
    expect(cache).toMatch(/no-store/);
    expect(json).toEqual({reps:[{id:'mara',name:'Mara Jensen',role:'rep',team:'Inside Sales'},{id:'eli',name:'Eli Porter',role:'rep',team:'Outside Sales'}]});
    expect(JSON.stringify(json)).not.toMatch(/@|phone|email|\(801\)/);
  });

  it('leaves out an inactive rep',async()=>{
    await setRepFixture('mara',{active:0});
    try{expect((await get()).json.reps.map((r:{id:string})=>r.id)).toEqual(['eli']);}
    finally{await setRepFixture('mara',{active:1});}
  });
});
