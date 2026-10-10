import {NextRequest} from 'next/server';
import {afterAll,describe,expect,it} from 'vitest';
import {setRepFixture,useSeededDatabase} from '@/server/repository/test-db';
import {GET,POST} from './route';

// The demo session (v3 spec §8; OA-12, OA-18, OA-27; task D1): the Mara and Eli cookie values work
// now (their chooser buttons come in F1). A deactivated rep can't start a session, and an existing
// one reads as signed out, so the workspace chooser shows instead of bouncing back to the portal.
useSeededDatabase();
afterAll(async()=>{await setRepFixture('mara',{active:1});});

const get=async(persona?:string)=>(await GET(new NextRequest('http://127.0.0.1/api/session',{headers:persona?{cookie:`querent-persona=${persona}`}:{}}))).json();
async function post(persona:string){
  const response=await POST(new NextRequest('http://127.0.0.1/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({persona})}));
  return {status:response.status,json:await response.json(),cookie:response.headers.get('set-cookie')};
}

describe('/api/session',()=>{
  it('signs in as Mara or Eli with the rep role, and Brandi as the manager',async()=>{
    expect(await post('mara')).toMatchObject({status:200,json:{user_id:'mara',rep_id:'mara',rep_role:'rep'},cookie:expect.stringMatching(/^querent-persona=mara;/)});
    expect((await post('eli')).json).toMatchObject({rep_id:'eli',rep_role:'rep'});
    expect((await post('supplier')).json).toMatchObject({rep_id:'brandi',rep_role:'manager'});
    expect(await get('mara')).toMatchObject({rep_id:'mara',rep_role:'rep'});
  });

  it("refuses a deactivated rep's sign-in, and reads their existing session as signed out",async()=>{
    await setRepFixture('mara',{active:0});
    expect(await post('mara')).toMatchObject({status:403,json:{detail:'This rep account is inactive.'},cookie:null});
    expect(await get('mara')).toBeNull();
    expect(await get('supplier')).toMatchObject({rep_id:'brandi'});
    expect(await get('customer')).toMatchObject({customer_id:'wasatch'});
  });
});
