import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// GET /api/rep/team/reps and PUT /api/rep/team/reps/<id> (v3 spec §5, §8; decisions 20, 21; task
// D1): manager only. Reps get 403, the customer 403, no session 401. Deactivating a rep who still
// has customers is 409 has_customers; it succeeds once Rep assignments has moved them.
useSeededDatabase();

type Persona='supplier'|'mara'|'eli'|'customer'|null;
async function call(method:'GET'|'PUT',{id,body,persona='supplier'}:{id?:string;body?:unknown;persona?:Persona}={}){
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  const url=`http://127.0.0.1/api/rep/team/reps${id?`/${id}`:''}`;
  const request=new NextRequest(url,{method,headers,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  const response=id
    ?await (await import('./[id]/route')).PUT(request,{params:Promise.resolve({id})})
    :await (await import('./route')).GET(request);
  return {status:response.status,cache:response.headers.get('cache-control'),json:await response.json()};
}
async function assign(customerId:string,repId:string,persona:Persona='supplier'){
  const {PUT}=await import('../../settings/assignments/route');
  const response=await PUT(new NextRequest('http://127.0.0.1/api/rep/settings/assignments',{method:'PUT',headers:{'Content-Type':'application/json',cookie:`querent-persona=${persona}`},body:JSON.stringify({customer_id:customerId,rep_id:repId})}));
  return {status:response.status,json:await response.json()};
}

describe('who may use the team routes',()=>{
  it('serves the manager, never cached',async()=>{
    const list=await call('GET');
    expect(list).toMatchObject({status:200,cache:expect.stringMatching(/no-store/)});
    expect(list.json.reps.map((r:{id:string;role:string;team:string;active:boolean;customer_count:number})=>[r.id,r.role,r.team,r.active,r.customer_count])).toEqual([
      ['brandi','manager','Inside Sales',true,2],['eli','rep','Outside Sales',true,0],['mara','rep','Inside Sales',true,1],['nora','rep','Outside Sales',true,1],
    ]);
  });

  it('refuses reps and the customer with 403 and no session with 401, on GET and PUT, changing nothing',async()=>{
    for(const persona of ['mara','eli','customer'] as const){
      expect(await call('GET',{persona})).toMatchObject({status:403});
      expect(await call('PUT',{persona,id:'eli',body:{team:'Hacked'}})).toMatchObject({status:403});
    }
    expect(await call('GET',{persona:null})).toMatchObject({status:401});
    expect(await call('PUT',{persona:null,id:'eli',body:{team:'Hacked'}})).toMatchObject({status:401});
    expect((await call('GET')).json.reps.find((r:{id:string})=>r.id==='eli').team).toBe('Outside Sales');
  });
});

describe('PUT /api/rep/team/reps/<id>',()=>{
  it('sets a team label (trimmed) and returns every rep; refuses a long one with the reason',async()=>{
    const saved=await call('PUT',{id:'eli',body:{team:'  Field Sales '}});
    expect(saved.status).toBe(200);
    expect(saved.json.reps.find((r:{id:string})=>r.id==='eli').team).toBe('Field Sales');
    expect(await call('PUT',{id:'eli',body:{team:'x'.repeat(41)}})).toMatchObject({status:400,json:{detail:'Keep the team label to 40 characters.'}});
    expect(await call('PUT',{id:'eli',body:'not json'})).toMatchObject({status:400});
    expect(await call('PUT',{id:'nobody',body:{team:'X'}})).toMatchObject({status:404,json:{detail:'Rep not found.'}});
    expect((await call('PUT',{id:'eli',body:{team:'Outside Sales'}})).status).toBe(200);
  });

  it('refuses to deactivate Mara while she has a customer (409 has_customers), then allows it after reassigning',async()=>{
    expect(await call('PUT',{id:'mara',body:{active:false}})).toMatchObject({status:409,json:{code:'has_customers',detail:expect.stringMatching(/^Mara Jensen still has 1 customer\./)}});
    expect((await assign('canyon-ridge','eli')).status).toBe(200);
    const off=await call('PUT',{id:'mara',body:{active:false}});
    expect(off.status).toBe(200);
    expect(off.json.reps.find((r:{id:string})=>r.id==='mara')).toMatchObject({active:false,customer_count:0});
  });

  it("an inactive rep can't be given a customer, and their session is refused",async()=>{
    expect(await assign('canyon-ridge','mara')).toMatchObject({status:400,json:{detail:'Mara Jensen is inactive. Choose an active rep.'}});
    const settings=await (await import('../../settings/route')).GET(new NextRequest('http://127.0.0.1/api/rep/settings',{headers:{cookie:'querent-persona=mara'}}));
    expect(settings.status).toBe(403);
    // Reactivated: back to work, customer back.
    expect((await call('PUT',{id:'mara',body:{active:true}})).status).toBe(200);
    expect((await assign('canyon-ridge','mara')).status).toBe(200);
  });

  it('never lets the manager deactivate herself',async()=>{
    expect(await call('PUT',{id:'brandi',body:{active:false}})).toMatchObject({status:400,json:{detail:'You can’t mark yourself inactive.'}});
  });
});

describe('GET /api/rep/settings: manager settings only for the manager',()=>{
  const settings=async(persona:Persona)=>{
    const response=await (await import('../../settings/route')).GET(new NextRequest('http://127.0.0.1/api/rep/settings',{headers:{cookie:`querent-persona=${persona}`}}));
    return response.json();
  };
  it('carries the reps and the aging thresholds for Brandi, and nothing of the kind for Mara',async()=>{
    const brandi=await settings('supplier');
    expect(brandi.manager.aging).toEqual({rfrAmberH:4,rfrRedH:24,crAmberH:4,crRedH:24,sentAmberH:72,sentRedH:168});
    expect(brandi.manager.reps).toHaveLength(4);
    const mara=await settings('mara');
    expect(mara.rep_id).toBe('mara');
    expect(mara.manager).toBeNull();
    // The assignment dropdown offers active reps only.
    expect(mara.reps.map((r:{id:string})=>r.id)).toEqual(['brandi','eli','mara','nora']);
  });
});
