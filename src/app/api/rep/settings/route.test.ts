import {NextRequest} from 'next/server';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The Settings API (task 6.1; plan U8): GET /api/rep/settings, the Customer access list by state, the
// organization margin floors, every rep's margins, and the PUT routes for access, floors, pricing and
// delivery. The manager's tabs are hers alone (Appendix B): a rep gets only their own floors from
// GET /api/rep/settings and 403 from every manager route (OA-69: no other rep's floors, no every-customer
// access summary, no organization-wide counts from /sources). 401 without a session, 403 for the customer
// persona, never cached.
useSeededDatabase();
afterEach(()=>vi.unstubAllEnvs());

type Method='GET'|'PUT';
const ROUTES={
  '':()=>import('./route'),
  sources:()=>import('./sources/route'),
  assignments:()=>import('./assignments/route'),
  access:()=>import('./access/route'),
  floors:()=>import('./floors/route'),
  'org-floors':()=>import('./org-floors/route'),
  margins:()=>import('./margins/route'),
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
  const text=await response.text();
  return {status:response.status,cache:response.headers.get('cache-control'),text,json:JSON.parse(text)};
}
const SEEDED_ORG=[['fasteners',0.2],['abrasives',0.2],['safety',0.2],['material-handling',0.2],['tools',0.18],['janitorial',0.2]];

describe('GET /api/rep/settings',()=>{
  // vitest.setup.ts turns the flags on; here they start off (their default) and a test turns one on.
  beforeEach(()=>{for(const name of ['FEATURE_FREE_DELIVERY_PRICING','FEATURE_RECOVERY_POOL','FEATURE_DELIVERY_COST_MODEL'])vi.stubEnv(name,'');});
  it("gives the manager her four tabs' data, her flags and her own profile (decision 69), never cached",async()=>{
    const {status,cache,json}=await call('','GET');
    expect(status).toBe(200);
    expect(cache).toMatch(/no-store/);
    expect(Object.keys(json).sort()).toEqual(['manager','mine','own','rep_id']);
    expect(json.own).toBeNull();
    expect(json.rep_id).toBe('brandi');
    const m=json.manager;
    expect(Object.keys(m).sort()).toEqual(['access','accessTable','aging','delivery','flags','orgFloors','pricing','profile','repMargins']);
    expect(m.profile).toEqual({name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com',picture_url:null});
    expect(m.access.map((r:{category:string;enabled:boolean})=>[r.category,r.enabled])).toEqual([['items_stock',true],['pricing',true],['orders_quotes',true],['account',true]]);
    expect(m.accessTable).toBeNull();
    expect(m.orgFloors.map((f:{category_id:string;floor:number})=>[f.category_id,f.floor])).toEqual(SEEDED_ORG);
    expect(m.orgFloors[4]).toMatchObject({category_name:'Tools',label:'18.0%'});
    expect(m.repMargins.map((r:{rep:{name:string}})=>r.rep.name)).toEqual(['Brandi Gallegos','Eli Porter','Mara Jensen','Nora Chen']);
    expect(m.repMargins[0].floors.find((f:{category_id:string})=>f.category_id==='safety')).toMatchObject({margin_floor:0.3,label:'30.0%'});
    expect(m).toMatchObject({pricing:{scarcity_uplift_enabled:false},delivery:{base_fee:25,road_factor:1.25},aging:{rfrAmberH:4,sentRedH:168},
      flags:{freeDeliveryPricing:false,recoveryPool:false,deliveryCostModel:false}});
    expect(json.mine.rep.id).toBe('brandi');
  });

  it('reads the flags on every request',async()=>{
    vi.stubEnv('FEATURE_RECOVERY_POOL','1');
    expect((await call('','GET')).json.manager.flags).toEqual({freeDeliveryPricing:false,recoveryPool:true,deliveryCostModel:false});
  });

  it("?customer= opens Customer access searched for that customer's name (Analytics' Manage customer access link)",async()=>{
    expect((await call('','GET',{query:'?customer=wasatch'})).json.manager.accessTable).toMatchObject({
      q:'Wasatch Mechanical Contractors',total:6,customers:[{id:'wasatch',account_number:'WAS-1142',access:{items_stock:true,pricing:true,orders_quotes:true,account:true}}],
    });
    expect((await call('','GET',{query:'?customer=nobody'})).json.manager.accessTable).toBeNull();
  });

  it("gives a rep their own tabs only: their margins against the organization floors, their profile and switches; no other rep's floors and no customer access (OA-69)",async()=>{
    const {status,json,text}=await call('','GET',{persona:'mara',query:'?customer=canyon-ridge'});
    expect(status).toBe(200);
    expect(Object.keys(json).sort()).toEqual(['manager','mine','own','rep_id']);
    expect(json).toMatchObject({rep_id:'mara',manager:null,mine:{rep:{id:'mara',name:'Mara Jensen'}}});
    expect(json.mine.floors).toHaveLength(6);
    expect(Object.keys(json.own).sort()).toEqual(['notifications','orgFloors','profile']);
    expect(json.own.orgFloors.map((f:{category_id:string;floor:number})=>[f.category_id,f.floor])).toEqual(SEEDED_ORG);
    expect(json.own.profile).toMatchObject({name:'Mara Jensen',phone:'(801) 555-0102'});
    for(const other of ['brandi','eli','nora','Brandi','Eli','Nora','Multiple reps','Canyon Ridge'])expect(text).not.toContain(other);
    expect((await call('','GET')).json.own).toBeNull();
  });
});

describe('Customer access: GET /access lists customers by state, PUT /access sets one or every customer',()=>{
  it('lists every customer with their switches and the total, narrowed by a search and per-type states',async()=>{
    const all=await call('access','GET');
    expect(all.status).toBe(200);
    expect(all.cache).toMatch(/no-store/);
    expect(all.json.total).toBe(6);
    expect(all.json.customers.map((c:{name:string})=>c.name)).toEqual(['Canyon Ridge Builders','Great Basin Fabrication','Uinta Facility Services','Utah Valley Electric','Wasatch Mechanical Contractors','Weber Basin Fabricators']);
    expect((await call('access','GET',{query:'?q=basin'})).json).toMatchObject({total:6,customers:[{id:'great-basin'},{id:'weber-basin'}]});
    expect((await call('access','PUT',{body:{customer_id:'great-basin',category:'pricing',enabled:false}})).status).toBe(200);
    expect((await call('access','GET',{query:'?pricing=not_shared'})).json.customers.map((c:{id:string})=>c.id)).toEqual(['great-basin']);
    expect((await call('access','GET',{query:'?pricing=not_shared&account=answers&items_stock=any'})).json.customers.map((c:{id:string})=>c.id)).toEqual(['great-basin']);
    expect((await call('access','GET',{query:'?pricing=answers'})).json.customers).toHaveLength(5);
    expect(await call('access','GET',{query:'?pricing=maybe'})).toMatchObject({status:400,json:{detail:'Invalid filter.'}});
    expect((await call('access','PUT',{body:{customer_id:'great-basin',category:'pricing',enabled:true}})).status).toBe(200);
  });

  it('turns a category off for one customer, or for everyone, and says what was wrong with a bad request',async()=>{
    const off=await call('access','PUT',{body:{customer_id:'wasatch',category:'items_stock',enabled:false}});
    expect(off.status).toBe(200);
    expect(off.json).toMatchObject({customer_id:'wasatch',rules:[{category:'items_stock',enabled:false},{},{},{}]});
    // `all`: every customer's rules, so the no-filter view follows a change to one customer.
    expect(off.json.all[0]).toMatchObject({category:'items_stock',enabled:null});
    expect((await call('','GET')).json.manager.access[0]).toMatchObject({category:'items_stock',enabled:null});
    expect((await call('access','PUT',{body:{customer_id:null,category:'items_stock',enabled:true}})).json.rules[0]).toMatchObject({enabled:true});
    expect(await call('access','PUT',{body:{customer_id:'wasatch',category:'cost',enabled:true}})).toMatchObject({status:400,json:{detail:'Invalid setting.'}});
    expect(await call('access','PUT',{body:{customer_id:'nobody',category:'pricing',enabled:true}})).toMatchObject({status:404,json:{detail:'Customer not found.'}});
  });
});

describe('Organization margin floors: GET/PUT /org-floors (Appendix C, D)',()=>{
  it('reads every category in display order, as a fraction and a label',async()=>{
    const {status,json}=await call('org-floors','GET');
    expect(status).toBe(200);
    expect(json.map((f:{category_id:string;floor:number})=>[f.category_id,f.floor])).toEqual(SEEDED_ORG);
    expect(json[2]).toEqual({category_id:'safety',category_name:'Safety & PPE',floor:0.2,label:'20.0%'});
  });

  it('saves the floors given in percent, to 0.1 point, together; one bad floor saves none',async()=>{
    const saved=await call('org-floors','PUT',{body:{floors:[{category_id:'safety',floor_pct:25},{category_id:'tools',floor_pct:15.04}]}});
    expect(saved.status).toBe(200);
    expect(saved.json.find((f:{category_id:string})=>f.category_id==='safety')).toMatchObject({floor:0.25,label:'25.0%'});
    expect(saved.json.find((f:{category_id:string})=>f.category_id==='tools')).toMatchObject({floor:0.15,label:'15.0%'});
    for(const [body,status,detail] of [
      [{floors:[{category_id:'safety',floor_pct:30},{category_id:'tools',floor_pct:100}]},400,'Enter a floor from 0% to 99.9%.'],
      [{floors:[{category_id:'safety',floor_pct:-0.01}]},400,'Enter a floor from 0% to 99.9%.'],
      [{floors:[{category_id:'safety',floor_pct:'30'}]},400,'Enter a floor from 0% to 99.9%.'],
      [{floors:[{category_id:'safety',floor_pct:30},{category_id:'safety',floor_pct:31}]},400,'Each category once.'],
      [{floors:[]},400,'Send at least one floor.'],
      [{},400,'Send at least one floor.'],
      ['not json',400,'Send at least one floor.'],
      [{floors:[{category_id:'nothing',floor_pct:30}]},404,'Product category not found.'],
    ] as const)expect(await call('org-floors','PUT',{body})).toMatchObject({status,json:{detail}});
    expect((await call('org-floors','GET')).json.find((f:{category_id:string})=>f.category_id==='safety').floor).toBe(0.25);
    expect((await call('org-floors','PUT',{body:{floors:[{category_id:'safety',floor_pct:20},{category_id:'tools',floor_pct:18}]}})).status).toBe(200);
  });

  it("GET /margins: every rep's own margins, read-only, by name",async()=>{
    const {status,json}=await call('margins','GET');
    expect(status).toBe(200);
    expect(json.map((r:{rep:{id:string}})=>r.rep.id)).toEqual(['brandi','eli','mara','nora']);
    expect(json[1].floors.map((f:{label:string})=>f.label)).toEqual(['20.0%','20.0%','20.0%','20.0%','20.0%','20.0%']);
  });
});

describe('PUT routes',()=>{
  it("floors: a rep's own floor to 0.1 point, a range check, and never another rep's",async()=>{
    const saved=await call('floors','PUT',{body:{category_id:'safety',floor_pct:27.5}});
    expect(saved.status).toBe(200);
    expect(saved.json.floors.find((f:{category_id:string})=>f.category_id==='safety')).toMatchObject({margin_floor:0.275,label:'27.5%'});
    expect(await call('floors','PUT',{body:{category_id:'safety',floor_pct:100}})).toMatchObject({status:400,json:{detail:'Enter a floor from 0% to 99.9%.'}});
    expect(await call('floors','PUT',{body:{category_id:'safety',floor_pct:-1}})).toMatchObject({status:400});
    expect(await call('floors','PUT',{body:{rep_id:'mara',category_id:'safety',floor_pct:40}})).toMatchObject({status:403,json:{detail:'Reps can only change their own margin floors.'}});
    expect(await call('floors','PUT',{body:{category_id:'nothing',floor_pct:40}})).toMatchObject({status:404});
    expect((await call('floors','PUT',{body:{rep_id:'brandi',category_id:'safety',floor_pct:30}})).status).toBe(200);
    // Mara saves her own.
    const mara=await call('floors','PUT',{persona:'mara',body:{category_id:'tools',floor_pct:22}});
    expect(mara.status).toBe(200);
    expect(mara.json.rep.id).toBe('mara');
    expect((await call('floors','PUT',{persona:'mara',body:{category_id:'tools',floor_pct:20}})).status).toBe(200);
  });

  it('floors: a margin below the organization floor is refused with a field-level error naming the real floor (plan U9; C_RS3)',async()=>{
    expect((await call('org-floors','PUT',{body:{floors:[{category_id:'safety',floor_pct:30}]}})).status).toBe(200);
    const one=await call('floors','PUT',{persona:'mara',body:{category_id:'safety',floor_pct:28}});
    expect(one).toMatchObject({status:400,json:{detail:'Below the 30.0% organization floor. Pick 30.0% or higher.',code:'below_org_floor',
      fields:[{category_id:'safety',floor:0.3,detail:'Below the 30.0% organization floor. Pick 30.0% or higher.'}]}});
    // Several at once ({floors}): all or none.
    const many=await call('floors','PUT',{persona:'mara',body:{floors:[{category_id:'fasteners',floor_pct:24},{category_id:'safety',floor_pct:28}]}});
    expect(many).toMatchObject({status:400,json:{code:'below_org_floor',fields:[{category_id:'safety',floor:0.3}]}});
    const settings=(await call('','GET',{persona:'mara'})).json;
    expect(settings.mine.floors.map((f:{margin_floor:number})=>f.margin_floor)).toEqual([0.2,0.2,0.2,0.2,0.2,0.2]);
    const saved=await call('floors','PUT',{persona:'mara',body:{floors:[{category_id:'fasteners',floor_pct:24},{category_id:'safety',floor_pct:30}]}});
    expect(saved.status).toBe(200);
    expect(saved.json.floors.map((f:{label:string})=>f.label)).toEqual(['24.0%','20.0%','30.0%','20.0%','20.0%','20.0%']);
    expect((await call('floors','PUT',{persona:'mara',body:{floors:[{category_id:'fasteners',floor_pct:20},{category_id:'safety',floor_pct:20}]}})).status).toBe(400);
    expect((await call('org-floors','PUT',{body:{floors:[{category_id:'safety',floor_pct:20}]}})).status).toBe(200);
    expect((await call('floors','PUT',{persona:'mara',body:{floors:[{category_id:'fasteners',floor_pct:20},{category_id:'safety',floor_pct:20}]}})).status).toBe(200);
  });

  it('pricing: the scarcity uplift on and off',async()=>{
    expect(await call('pricing','PUT',{body:{scarcity_uplift_enabled:true}})).toMatchObject({status:200,json:{scarcity_uplift_enabled:true}});
    expect((await call('','GET')).json.manager.pricing).toEqual({scarcity_uplift_enabled:true});
    expect(await call('pricing','PUT',{body:{scarcity_uplift_enabled:'yes'}})).toMatchObject({status:400});
    expect(await call('pricing','PUT',{body:{scarcity_uplift_enabled:false}})).toMatchObject({status:200,json:{scarcity_uplift_enabled:false}});
  });

  it('delivery: all six rates, rounded and checked, then read back',async()=>{
    const SEEDED={base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25};
    expect((await call('','GET')).json.manager.delivery).toEqual(SEEDED);
    const next={base_fee:30,per_mile:3.255,min_charge:40,free_threshold:2000,max_radius_miles:90.04,road_factor:1.3};
    expect(await call('delivery','PUT',{body:next})).toMatchObject({status:200,json:{base_fee:30,per_mile:3.26,min_charge:40,free_threshold:2000,max_radius_miles:90,road_factor:1.3}});
    expect((await call('','GET')).json.manager.delivery).toEqual({base_fee:30,per_mile:3.26,min_charge:40,free_threshold:2000,max_radius_miles:90,road_factor:1.3});
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
    expect((await call('','GET')).json.manager.delivery.base_fee).toBe(30);
    expect(await call('delivery','PUT',{body:SEEDED})).toMatchObject({status:200,json:SEEDED});
  });

  it('assignments (the Teams and Reps backing route): sets the one rep',async()=>{
    expect((await call('assignments','PUT',{body:{customer_id:'great-basin',rep_id:'eli'}})).status).toBe(200);
    expect(await call('assignments','PUT',{body:{customer_id:'great-basin'}})).toMatchObject({status:400,json:{detail:'Choose a customer and a rep.'}});
    expect((await call('assignments','PUT',{body:{customer_id:'great-basin',rep_id:'brandi'}})).status).toBe(200);
  });
});

describe('who may call them',()=>{
  const managerRoutes:[Name,Method,unknown?][]=[
    ['sources','GET'],['access','GET'],['org-floors','GET'],['margins','GET'],
    ['assignments','PUT',{customer_id:'wasatch',rep_id:'mara'}],
    ['access','PUT',{customer_id:null,category:'items_stock',enabled:false}],
    ['org-floors','PUT',{floors:[{category_id:'safety',floor_pct:40}]}],
    ['pricing','PUT',{scarcity_uplift_enabled:true}],
    ['delivery','PUT',{base_fee:1,per_mile:1,min_charge:1,free_threshold:1,max_radius_miles:1,road_factor:1}],
  ];
  const everyRoute:[Name,Method,unknown?][]=[['','GET'],['floors','PUT',{category_id:'safety',floor_pct:10}],...managerRoutes];

  it('asks for a workspace without a session, on every route',async()=>{
    for(const persona of [null,'nobody','constructor'])
      for(const [name,method,body] of everyRoute)expect(await call(name,method,{body,persona}),`${method} ${name}`).toMatchObject({status:401,json:{detail:'Choose a demo workspace.'}});
  });

  it('refuses the customer persona, on every route',async()=>{
    for(const [name,method,body] of everyRoute)expect(await call(name,method,{body,persona:'customer'}),`${method} ${name}`).toMatchObject({status:403,json:{detail:'Supplier access required.'}});
  });

  it('refuses a rep every manager route (Appendix B; OA-69), changing nothing',async()=>{
    for(const [name,method,body] of managerRoutes)expect((await call(name,method,{body,persona:'mara'})).status,`${method} ${name}`).toBe(403);
    const after=(await call('','GET')).json.manager;
    expect(after.access[0].enabled).toBe(true);
    expect(after.orgFloors[2].floor).toBe(0.2);
    expect(after.pricing.scarcity_uplift_enabled).toBe(false);
    expect(after.delivery.base_fee).toBe(25);
    expect(after.repMargins.find((r:{rep:{id:string}})=>r.rep.id==='mara').floors[2].margin_floor).toBe(0.2);
  });
});
