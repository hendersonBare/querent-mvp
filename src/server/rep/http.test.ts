import {NextRequest} from 'next/server';
import {afterEach,describe,expect,it} from 'vitest';
import {setRepFixture,useSeededDatabase} from '@/server/repository/test-db';
import {managerRoute,repJson,repRoute} from './http';

// The rep API guards (v3 spec §5, §8; decisions 20, 21; OA-12; task D1). repRoute serves an active
// supplier rep; managerRoute also needs the persona's rep_role and the rep's stored reps.role to be
// manager. Both read the rep from the database, so a deactivated rep is refused even with a valid cookie.
useSeededDatabase();

const request=(persona?:string)=>new NextRequest('http://127.0.0.1/api/rep/test',{headers:persona?{cookie:`querent-persona=${persona}`}:{}});
const seen:{repId:string}[]=[];
const rep=repRoute(repId=>{seen.push({repId});return repJson({repId});});
const manager=managerRoute(repId=>{seen.push({repId});return repJson({repId});});
const call=async(route:typeof rep,persona?:string)=>{const response=await route(request(persona));return {status:response.status,json:await response.json(),cache:response.headers.get('cache-control')};};

const setRep=(id:string,column:'active'|'role',value:number|string)=>setRepFixture(id,{[column]:value});
afterEach(async()=>{seen.length=0;await setRep('brandi','active',1);await setRep('brandi','role','manager');await setRep('eli','active',1);await setRep('mara','role','rep');});

describe('managerRoute',()=>{
  it('serves the manager (Brandi) with her own rep id',async()=>{
    expect(await call(manager,'supplier')).toMatchObject({status:200,json:{repId:'brandi'}});
    expect(seen).toEqual([{repId:'brandi'}]);
  });

  it('refuses a rep (Mara, Eli) with 403 before the handler runs',async()=>{
    expect(await call(manager,'mara')).toMatchObject({status:403,json:{detail:'Manager access required.'},cache:expect.stringMatching(/no-store/)});
    expect(await call(manager,'eli')).toMatchObject({status:403});
    expect(seen).toEqual([]);
  });

  it('checks the stored role, not only the cookie',async()=>{
    await setRep('brandi','role','rep');
    expect((await call(manager,'supplier')).status).toBe(403);
    // A rep promoted in the database is still a rep persona: both must say manager.
    await setRep('mara','role','manager');
    expect((await call(manager,'mara')).status).toBe(403);
    expect(seen).toEqual([]);
  });

  it('refuses an inactive manager',async()=>{
    await setRep('brandi','active',0);
    expect(await call(manager,'supplier')).toMatchObject({status:403,json:{detail:'This rep account is inactive.'}});
    expect(seen).toEqual([]);
  });

  it('refuses the customer (403) and no session (401)',async()=>{
    expect(await call(manager,'customer')).toMatchObject({status:403,json:{detail:'Supplier access required.'}});
    expect(await call(manager)).toMatchObject({status:401,json:{detail:'Choose a demo workspace.'}});
    expect(await call(manager,'nobody')).toMatchObject({status:401});
    expect(seen).toEqual([]);
  });
});

describe('repRoute',()=>{
  it('serves every active supplier persona as its own rep',async()=>{
    for(const [persona,repId] of [['supplier','brandi'],['mara','mara'],['eli','eli']])expect(await call(rep,persona)).toMatchObject({status:200,json:{repId}});
  });

  it("refuses a deactivated rep's session with 403, and serves it again once reactivated",async()=>{
    await setRep('eli','active',0);
    expect(await call(rep,'eli')).toMatchObject({status:403,json:{detail:'This rep account is inactive.'}});
    expect(seen).toEqual([]);
    await setRep('eli','active',1);
    expect((await call(rep,'eli')).status).toBe(200);
  });

  it('keeps 403 for the customer and 401 without a session',async()=>{
    expect((await call(rep,'customer')).status).toBe(403);
    expect((await call(rep)).status).toBe(401);
  });
});
