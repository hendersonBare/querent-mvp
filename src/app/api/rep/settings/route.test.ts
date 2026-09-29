import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The Settings API (task 6.1): GET /api/rep/settings, GET /api/rep/settings/sources and the PUT
// routes for assignments, access, floors, pricing and delivery. Rep-only, like GET /api/rep/badges: 401
// without a session, 403 for the customer persona, never cached.
useSeededDatabase();

type Method='GET'|'PUT';
const ROUTES={
  '':()=>import('./route'),
  sources:()=>import('./sources/route'),
  assignments:()=>import('./assignments/route'),
  access:()=>import('./access/route'),
  floors:()=>import('./floors/route'),
  pricing:()=>import('./pricing/route'),
  delivery:()=>import('./delivery/route'),
} as const;
type Name=keyof typeof ROUTES;

async function call(name:Name,method:Method,{body,query='',persona='supplier'}:{body?:unknown;query?:string;persona?:string|null}={}){
  const route=await ROUTES[name]() as Partial<Record<Method,(request:NextRequest)=>Promise<Response>>>;
  const handler=route[method];
  if(!handler)throw new Error(`No ${method} on ${name||'settings'}`);
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  const url=`http://127.0.0.1/api/rep/settings${name?`/${name}`:''}${query}`;
  const response=await handler(new NextRequest(url,{method,headers,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)}));
  return {status:response.status,cache:response.headers.get('cache-control'),json:await response.json()};
}

describe('GET /api/rep/settings',()=>{
  it("returns the signed-in rep's Settings, with access for the picked customer, never cached",async()=>{
    const all=await call('','GET');
    expect(all.status).toBe(200);
    expect(all.cache).toMatch(/no-store/);
    expect(all.json).toMatchObject({rep_id:'brandi',access:{customer_id:null},pricing:{scarcity_uplift_enabled:false},delivery:{base_fee:25,road_factor:1.25}});
    expect(all.json.assignments).toHaveLength(4);
    expect(all.json.floors.mine.floors.find((f:{category_id:string})=>f.category_id==='safety')).toMatchObject({margin_floor:0.3,label:'30.0%'});
    expect((await call('','GET',{query:'?customer=wasatch'})).json.access.customer_id).toBe('wasatch');
    expect((await call('','GET',{query:'?customer=nobody'})).json.access.customer_id).toBeNull();
  });

  it('GET /sources: the demo database and the last sync events',async()=>{
    const {status,json}=await call('sources','GET');
    expect(status).toBe(200);
    expect(json.database).toMatchObject({seed_date:'2026-09-23'});
    expect(json.erp.events[0]).toMatchObject({message:'ERP connection refreshed'});
  });
});

describe('PUT routes',()=>{
  it('assignments: sets the one rep, and says what was wrong with a bad request',async()=>{
    const moved=await call('assignments','PUT',{body:{customer_id:'great-basin',rep_id:'eli'}});
    expect(moved.status).toBe(200);
    expect(moved.cache).toMatch(/no-store/);
    expect(moved.json.assignments.find((a:{id:string})=>a.id==='great-basin')).toMatchObject({rep_id:'eli',rep_name:'Eli Porter'});
    expect(await call('assignments','PUT',{body:{customer_id:'great-basin'}})).toMatchObject({status:400,json:{detail:'Choose a customer and a rep.'}});
    expect(await call('assignments','PUT',{body:'not json'})).toMatchObject({status:400});
    expect(await call('assignments','PUT',{body:{customer_id:'nobody',rep_id:'eli'}})).toMatchObject({status:404,json:{detail:'Customer not found.'}});
    expect((await call('assignments','PUT',{body:{customer_id:'great-basin',rep_id:'brandi'}})).status).toBe(200);
  });

  it('access: turns a category off for one customer, or for everyone',async()=>{
    const off=await call('access','PUT',{body:{customer_id:'wasatch',category:'items_stock',enabled:false}});
    expect(off.status).toBe(200);
    expect(off.json).toMatchObject({customer_id:'wasatch',rules:[{category:'items_stock',enabled:false},{},{},{}]});
    expect((await call('','GET')).json.access.rules[0]).toMatchObject({category:'items_stock',enabled:null});
    expect((await call('access','PUT',{body:{customer_id:null,category:'items_stock',enabled:true}})).json.rules[0]).toMatchObject({enabled:true});
    expect(await call('access','PUT',{body:{customer_id:'wasatch',category:'cost',enabled:true}})).toMatchObject({status:400,json:{detail:'Invalid setting.'}});
  });

  it("floors: the rep's own floor to 0.1 point, a range check, and never another rep's",async()=>{
    const saved=await call('floors','PUT',{body:{category_id:'safety',floor_pct:27.5}});
    expect(saved.status).toBe(200);
    expect(saved.json.floors.find((f:{category_id:string})=>f.category_id==='safety')).toMatchObject({margin_floor:0.275,label:'27.5%'});
    expect(await call('floors','PUT',{body:{category_id:'safety',floor_pct:100}})).toMatchObject({status:400,json:{detail:'Enter a floor from 0% to 99.9%.'}});
    expect(await call('floors','PUT',{body:{category_id:'safety',floor_pct:-1}})).toMatchObject({status:400});
    expect(await call('floors','PUT',{body:{rep_id:'mara',category_id:'safety',floor_pct:40}})).toMatchObject({status:403,json:{detail:'Reps can only change their own margin floors.'}});
    expect(await call('floors','PUT',{body:{category_id:'nothing',floor_pct:40}})).toMatchObject({status:404});
    expect((await call('floors','PUT',{body:{rep_id:'brandi',category_id:'safety',floor_pct:30}})).status).toBe(200);
  });

  it('pricing: the scarcity uplift on and off',async()=>{
    expect(await call('pricing','PUT',{body:{scarcity_uplift_enabled:true}})).toMatchObject({status:200,json:{scarcity_uplift_enabled:true}});
    expect((await call('','GET')).json.pricing).toEqual({scarcity_uplift_enabled:true});
    expect(await call('pricing','PUT',{body:{scarcity_uplift_enabled:'yes'}})).toMatchObject({status:400});
    expect(await call('pricing','PUT',{body:{scarcity_uplift_enabled:false}})).toMatchObject({status:200,json:{scarcity_uplift_enabled:false}});
  });

  it('delivery: all six rates, rounded and checked, then read back',async()=>{
    const SEEDED={base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25};
    expect((await call('','GET')).json.delivery).toEqual(SEEDED);
    const next={base_fee:30,per_mile:3.255,min_charge:40,free_threshold:2000,max_radius_miles:90.04,road_factor:1.3};
    expect(await call('delivery','PUT',{body:next})).toMatchObject({status:200,json:{base_fee:30,per_mile:3.26,min_charge:40,free_threshold:2000,max_radius_miles:90,road_factor:1.3}});
    expect((await call('','GET')).json.delivery).toEqual({base_fee:30,per_mile:3.26,min_charge:40,free_threshold:2000,max_radius_miles:90,road_factor:1.3});
    for(const [body,detail] of [
      [{...SEEDED,base_fee:-1},'Base fee must be from 0 to 10,000.'],
      [{...SEEDED,max_radius_miles:0},'Delivery radius must be from 1 to 1,000.'],
      [{...SEEDED,road_factor:0.9},'Road miles per straight-line mile must be from 1 to 3.'],
      [{...SEEDED,per_mile:'2.5'},'Per road mile: enter a number.'],
      [{base_fee:25},'Per road mile: enter a number.'],
      [{...SEEDED,surcharge:5},'Unknown delivery rate: surcharge.'],
      [null,'Send every delivery rate.'],
    ] as const){
      expect(await call('delivery','PUT',{body})).toMatchObject({status:400,json:{detail}});
    }
    expect((await call('','GET')).json.delivery.base_fee).toBe(30);
    expect(await call('delivery','PUT',{body:SEEDED})).toMatchObject({status:200,json:SEEDED});
  });
});

describe('only a rep',()=>{
  const writes:[Name,unknown][]=[
    ['assignments',{customer_id:'wasatch',rep_id:'mara'}],
    ['access',{customer_id:'wasatch',category:'items_stock',enabled:false}],
    ['floors',{category_id:'safety',floor_pct:10}],
    ['pricing',{scarcity_uplift_enabled:true}],
    ['delivery',{base_fee:1,per_mile:1,min_charge:1,free_threshold:1,max_radius_miles:1,road_factor:1}],
  ];

  it('asks for a workspace without a session, on every route',async()=>{
    for(const persona of [null,'nobody','constructor']){
      expect((await call('','GET',{persona})).status).toBe(401);
      expect((await call('sources','GET',{persona})).status).toBe(401);
      for(const [name,body] of writes)expect((await call(name,'PUT',{body,persona}))).toMatchObject({status:401,json:{detail:'Choose a demo workspace.'}});
    }
  });

  it('refuses the customer persona, on every route, changing nothing',async()=>{
    expect(await call('','GET',{persona:'customer'})).toMatchObject({status:403,json:{detail:'Supplier access required.'}});
    expect((await call('sources','GET',{persona:'customer'})).status).toBe(403);
    for(const [name,body] of writes)expect((await call(name,'PUT',{body,persona:'customer'}))).toMatchObject({status:403,json:{detail:'Supplier access required.'}});
    const after=(await call('','GET')).json;
    expect(after.assignments.find((a:{id:string})=>a.id==='wasatch').rep_id).toBe('brandi');
    expect(after.access.rules[0].enabled).toBe(true);
    expect(after.floors.mine.floors.find((f:{category_id:string})=>f.category_id==='safety').margin_floor).toBe(0.3);
    expect(after.pricing.scarcity_uplift_enabled).toBe(false);
  });
});
