import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {ClarifyPayload} from '@/domain';
import {CANDIDATE_ROUND,present} from '@/server/chat/clarify';
import {customerRepContact} from '@/server/customer/sidebar';
import {quoteFloors} from '@/server/floors/service';
import {ask} from '@/server/pipeline';
import {priceLines} from '@/server/pricing/service';
import {access,assignedRep,createQuote,enabledCategories,pricingSettings,quote,repFloors} from '@/server/repository';
import {useSeededDatabase} from '@/server/repository/test-db';
import {repQuoteList} from './quotes';
import {SettingsError,assignRep,assignmentRows,dataSources,repSettings,updateAccess,updateMyFloor,updateOrgFloors,updatePricing} from './settings';

// Settings (spec §4, task 6.1) against the seed pinned to the mockup's day: Brandi has Wasatch and
// Great Basin, Mara has Canyon Ridge, Nora has Uinta; every quote is Wasatch's and Brandi's.
useSeededDatabase();

const NOW='2026-09-23T18:00:00.000Z';
const env={scripted:process.env.QUERENT_SCRIPTED};
beforeEach(()=>{process.env.QUERENT_SCRIPTED='1';});
afterEach(()=>{if(env.scripted===undefined)delete process.env.QUERENT_SCRIPTED;else process.env.QUERENT_SCRIPTED=env.scripted;vi.unstubAllEnvs();});

/** Runs `fn`, expecting a SettingsError with this status. */
function rejects(fn:()=>unknown,status:number,message?:RegExp){
  try{fn();}catch(error){
    expect(error).toBeInstanceOf(SettingsError);
    expect((error as SettingsError).status).toBe(status);
    if(message)expect((error as Error).message).toMatch(message);
    return;
  }
  throw new Error('Expected a SettingsError');
}

describe('repSettings: the page snapshot (plan U8)',()=>{
  it("gives the manager the four tabs' data: every customer's access, the organization floors, every rep's margins, pricing, delivery, aging and the flags",()=>{
    // vitest.setup.ts turns the flags on; here they are off, their default.
    for(const name of ['FEATURE_FREE_DELIVERY_PRICING','FEATURE_RECOVERY_POOL','FEATURE_DELIVERY_COST_MODEL'])vi.stubEnv(name,'');
    const settings=repSettings('brandi',{manager:true});
    expect(settings.rep_id).toBe('brandi');
    const m=settings.manager!;
    expect(m.access.map(r=>[r.category,r.enabled])).toEqual([['items_stock',true],['pricing',true],['orders_quotes',true],['account',true]]);
    expect(m.access[0]).toMatchObject({mixed_rep:true,rep_name:'Multiple reps'});
    expect(m.accessTable).toBeNull();
    expect(m.orgFloors.map(f=>[f.category_name,f.floor,f.label])).toEqual([
      ['Fasteners',0.2,'20.0%'],['Abrasives & Cutting',0.2,'20.0%'],['Safety & PPE',0.2,'20.0%'],
      ['Material Handling & Tie-downs',0.2,'20.0%'],['Tools',0.18,'18.0%'],['Janitorial/MRO',0.2,'20.0%'],
    ]);
    expect(m.repMargins.map(r=>r.rep.name)).toEqual(['Brandi Gallegos','Eli Porter','Mara Jensen','Nora Chen']);
    expect(m.repMargins[0].floors.map(f=>[f.category_name,f.margin_floor,f.label])).toEqual([
      ['Fasteners',0.2,'20.0%'],['Abrasives & Cutting',0.25,'25.0%'],['Safety & PPE',0.3,'30.0%'],
      ['Material Handling & Tie-downs',0.2,'20.0%'],['Tools',0.18,'18.0%'],['Janitorial/MRO',0.2,'20.0%'],
    ]);
    expect(m.repMargins.slice(1).every(o=>o.floors.length===6&&o.floors.every(f=>f.label==='20.0%'))).toBe(true);
    expect(m.pricing).toEqual({scarcity_uplift_enabled:false});
    expect(m.delivery).toEqual({base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25});
    expect(m.aging).toEqual({rfrAmberH:4,rfrRedH:24,crAmberH:4,crRedH:24,sentAmberH:72,sentRedH:168});
    expect(m.flags).toEqual({freeDeliveryPricing:false,recoveryPool:false,deliveryCostModel:false});
    expect(settings.mine.rep.name).toBe('Brandi Gallegos');
    // Decision 69: her own Profile tab (C_RS2), because customers see her in My rep.
    expect(m.profile).toEqual({name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com',picture_url:null});
  });

  it("opens Customer access searched for a linked customer's name (?customer=), every customer counted",()=>{
    expect(repSettings('brandi',{manager:true,customerId:'wasatch'}).manager!.accessTable).toEqual({
      q:'Wasatch Mechanical Contractors',total:6,
      customers:[{id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',access:{items_stock:true,pricing:true,orders_quotes:true,account:true}}],
    });
    expect(repSettings('brandi',{manager:true,customerId:'nobody'}).manager!.accessTable).toBeNull();
  });

  it("gives a rep only their own tabs' data: nothing of the manager's tabs, no other rep's floors (OA-69)",()=>{
    const settings=repSettings('mara',{customerId:'canyon-ridge'});
    expect(settings).toEqual({rep_id:'mara',manager:null,mine:expect.objectContaining({rep:{id:'mara',name:'Mara Jensen',initials:'MJ',title:expect.any(String)}}),own:expect.any(Object)});
    expect(settings.mine.floors.map(f=>f.label)).toEqual(['20.0%','20.0%','20.0%','20.0%','20.0%','20.0%']);
    // Plan U9: Margins reads the organization floors (Appendix B "No (reads them)"), Profile and Notifications their own.
    expect(settings.own!.orgFloors.map(f=>[f.category_id,f.label])).toEqual([['fasteners','20.0%'],['abrasives','20.0%'],['safety','20.0%'],['material-handling','20.0%'],['tools','18.0%'],['janitorial','20.0%']]);
    expect(settings.own!.profile).toEqual({name:'Mara Jensen',initials:'MJ',title:'Inside Sales',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com',picture_url:null});
    expect(Object.values(settings.own!.notifications)).toEqual(Array(8).fill(true));
    // The manager keeps the U8 tabs and her own Profile (decision 69), not a rep's Margins or Notifications.
    expect(repSettings('brandi',{manager:true}).own).toBeNull();
  });

  it('Data sources (manager route only now): the demo database and the last sync events',()=>{
    expect(dataSources().database).toMatchObject({seed_date:'2026-09-23',records:{customers:6}});
    expect(dataSources().erp.events[0]).toMatchObject({message:'ERP connection refreshed'});
  });
});

describe('assignmentRows (the Teams and Reps backing data)',()=>{
  it('lists every customer (placeholders too) for the manager with its one rep and its quotes by rep',()=>{
    const rows=assignmentRows();
    expect(rows.map(a=>[a.name,a.account_number,a.rep_name,a.placeholder])).toEqual([
      ['Canyon Ridge Builders','CRB-3318','Mara Jensen',false],
      ['Great Basin Fabrication','GBF-2207','Brandi Gallegos',true],
      ['Uinta Facility Services','UFS-4051','Nora Chen',true],
      ['Utah Valley Electric','UVE-5126','Eli Porter',false],
      ['Wasatch Mechanical Contractors','WAS-1142','Brandi Gallegos',false],
      ['Weber Basin Fabricators','WBF-6074','Eli Porter',false],
    ]);
    // Brandi covered three of Mara's Canyon Ridge quotes; Mara moved two others to Eli (the demo book, task F1).
    expect(rows.find(a=>a.id==='canyon-ridge')!.quotes).toEqual(expect.arrayContaining([{rep_id:'brandi',rep_name:'Brandi Gallegos',count:3},{rep_id:'eli',rep_name:'Eli Porter',count:2},{rep_id:'mara',rep_name:'Mara Jensen',count:18}]));
    expect(rows.find(a=>a.id==='wasatch')!.quotes).toEqual([{rep_id:'brandi',rep_name:'Brandi Gallegos',count:28}]); // with the 3 aging quotes (task A2)
    expect(rows.find(a=>a.id==='great-basin')!.quotes).toEqual([]);
  });

  it("lists only a rep's own customers, with only their own quotes (task U1)",()=>{
    const rows=assignmentRows({repId:'mara',manager:false});
    expect(rows.map(a=>a.id)).toEqual(['canyon-ridge']);
    expect(rows[0].quotes).toEqual([{rep_id:'mara',rep_name:'Mara Jensen',count:18}]);
  });
});

describe('updateOrgFloors: Organization margin floors (plan U8)',()=>{
  afterEach(()=>{updateOrgFloors({floors:[{category_id:'safety',floor_pct:20},{category_id:'tools',floor_pct:18}]});});

  it('stores the floors in percent, to 0.1 point, and returns every category with its label',()=>{
    const saved=updateOrgFloors({floors:[{category_id:'safety',floor_pct:29.95},{category_id:'tools',floor_pct:0}]});
    expect(saved.find(f=>f.category_id==='safety')).toMatchObject({floor:0.3,label:'30.0%'});
    expect(saved.find(f=>f.category_id==='tools')).toMatchObject({floor:0,label:'0.0%'});
    expect(saved).toHaveLength(6);
  });

  it('refuses a bad floor, a repeated or unknown category, or nothing to save, storing none',()=>{
    for(const floor_pct of [-0.01,99.96,100,Number.NaN,'25',null])rejects(()=>updateOrgFloors({floors:[{category_id:'safety',floor_pct:25},{category_id:'tools',floor_pct}]}),400,/0%.*99\.9%/);
    rejects(()=>updateOrgFloors({floors:[{category_id:'safety',floor_pct:25},{category_id:'safety',floor_pct:26}]}),400,/once/);
    rejects(()=>updateOrgFloors({floors:[{category_id:'nothing',floor_pct:25}]}),404);
    for(const body of [{},{floors:[]},{floors:'x'},null,[]])rejects(()=>updateOrgFloors(body),400);
    rejects(()=>updateOrgFloors({floors:[{floor_pct:25}]}),400);
    expect(repSettings('brandi',{manager:true}).manager!.orgFloors.find(f=>f.category_id==='safety')!.floor).toBe(0.2);
  });
});

describe('assignRep: one rep per customer',()=>{
  afterEach(()=>{assignRep('brandi',{customer_id:'wasatch',rep_id:'brandi'});});

  it("without “Also move this customer’s open quotes”, existing quotes stay in the old rep's list, against the old rep's floors",async()=>{
    assignRep('brandi',{customer_id:'wasatch',rep_id:'mara'});
    expect(quote('q-24817')?.rep_id).toBe('brandi');
    expect(quoteFloors('q-24817')).toMatchObject({rep_id:'brandi',belowFloorCount:1});
    // The manager still reads them for Wasatch; as a rep Brandi can no longer filter by Mara's customer (task U1).
    const brandi=await repQuoteList('brandi',{customerId:'wasatch',now:NOW,manager:true,filters:{rep:'brandi'}});
    expect(brandi).toMatchObject({customer:{id:'wasatch',rep_id:'mara'},counts:{all:28}});
    expect((await repQuoteList('brandi',{customerId:'wasatch',now:NOW})).customer).toBeNull();
    expect(brandi.rows.find(r=>r.quote_number==='Q-24817')).toMatchObject({below_floor_count:1});
    const row=assignmentRows().find(a=>a.id==='wasatch')!;
    expect(row.rep_name).toBe('Mara Jensen');
    expect(row.quotes).toEqual([{rep_id:'brandi',rep_name:'Brandi Gallegos',count:28}]);
  });

  it("reassigns the customer: the rep contact Dana sees follows, and new quotes go to the new rep",()=>{
    const {assignments}=assignRep('brandi',{customer_id:'wasatch',rep_id:'mara'});
    expect(assignments.find(a=>a.id==='wasatch')).toMatchObject({rep_id:'mara',rep_name:'Mara Jensen'});
    expect(assignedRep('wasatch')?.name).toBe('Mara Jensen');
    // The 2.4 sidebar and the access rules (the chat's rep panel) read the assignment live.
    expect(customerRepContact('wasatch').rep).toMatchObject({name:'Mara Jensen',phone:'(801) 555-0102'});
    expect(access('wasatch')[0]).toMatchObject({rep_id:'mara',rep_name:'Mara Jensen'});
    // The 2.2 rep card, shown with the candidate buttons from the second round.
    const secondRound={open:[{round:CANDIDATE_ROUND,candidates:[]}],cart:{lines:[]}} as unknown as ClarifyPayload;
    expect(present({customerId:'wasatch'},secondRound).rep).toMatchObject({name:'Mara Jensen',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com'});
    // A quote requested now is the new rep's (spec §5.2: the quote's rep is the customer's assigned rep).
    const fresh=createQuote({customerId:'wasatch',contactId:'dana',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'last_paid'}]});
    expect(fresh.rep_id).toBe('mara');
    expect(assignmentRows().find(a=>a.id==='wasatch')!.quotes).toEqual([
      {rep_id:'brandi',rep_name:'Brandi Gallegos',count:28},{rep_id:'mara',rep_name:'Mara Jensen',count:1},
    ]);
  });

  it("names the new rep when chat refuses a category the customer has turned off",async()=>{
    assignRep('brandi',{customer_id:'wasatch',rep_id:'mara'});
    updateAccess({customer_id:'wasatch',category:'items_stock',enabled:false});
    try{
      const answer=await ask('wasatch','conv-settings-reassigned','Do you have 1/2 in grade 8 hex bolts in stock?',{contactId:'dana'});
      expect(answer.outcome).toBe('restricted');
      expect(answer.answer).toContain('Mara Jensen');
      expect(answer.answer).toContain('(801) 555-0102');
    }finally{updateAccess({customer_id:'wasatch',category:'items_stock',enabled:true});}
  });

  it('rejects a bad request, and an unknown customer or rep, changing nothing',()=>{
    rejects(()=>assignRep('brandi',{}),400);
    rejects(()=>assignRep('brandi',{customer_id:'wasatch'}),400);
    rejects(()=>assignRep('brandi',{customer_id:'wasatch',rep_id:7}),400);
    rejects(()=>assignRep('brandi',null),400);
    rejects(()=>assignRep('brandi',{customer_id:'nobody',rep_id:'mara'}),404,/customer/i);
    rejects(()=>assignRep('brandi',{customer_id:'wasatch',rep_id:'nobody'}),404,/rep/i);
    expect(assignedRep('wasatch')?.id).toBe('brandi');
  });
});

describe('updateAccess: what customers can ask about in chat',()=>{
  afterEach(()=>{for(const category of ['items_stock','pricing','orders_quotes','account'])updateAccess({customer_id:null,category,enabled:true});});

  it("turns a category off for one customer: the chat tools refuse it and point Dana to her rep",async()=>{
    const result=updateAccess({customer_id:'wasatch',category:'items_stock',enabled:false});
    expect(result.customer_id).toBe('wasatch');
    expect(result.rules.find(r=>r.category==='items_stock')).toMatchObject({enabled:false});
    expect(enabledCategories('wasatch').has('items_stock')).toBe(false);
    expect(enabledCategories('great-basin').has('items_stock')).toBe(true);
    const answer=await ask('wasatch','conv-settings-access','Do you have 1/2 in grade 8 hex bolts in stock?',{contactId:'dana'});
    expect(answer).toMatchObject({outcome:'restricted',categories:['items_stock']});
    expect(answer.answer).toBe("Stock levels aren't available in chat for your account. Brandi Gallegos can check for you: (801) 111-2222 or brandi.gallegos@herrickindustrial.com.");
    updateAccess({customer_id:'wasatch',category:'items_stock',enabled:true});
    expect((await ask('wasatch','conv-settings-access','Do you have 1/2 in grade 8 hex bolts in stock?',{contactId:'dana'})).outcome).toBe('answered');
  });

  it('sets every customer at once for All customers, and reads mixed when they differ',()=>{
    expect(updateAccess({customer_id:null,category:'pricing',enabled:false}).rules.find(r=>r.category==='pricing')).toMatchObject({enabled:false});
    expect(['wasatch','great-basin','canyon-ridge','uinta-facility'].every(id=>!enabledCategories(id).has('pricing'))).toBe(true);
    updateAccess({customer_id:'wasatch',category:'pricing',enabled:true});
    expect(repSettings('brandi',{manager:true}).manager!.access.find(r=>r.category==='pricing')).toMatchObject({enabled:null});
  });

  it('rejects a bad category or value, and an unknown customer, changing nothing',()=>{
    rejects(()=>updateAccess({customer_id:'wasatch',category:'cost',enabled:false}),400);
    rejects(()=>updateAccess({customer_id:'wasatch',category:'pricing',enabled:'no'}),400);
    rejects(()=>updateAccess({customer_id:7,category:'pricing',enabled:false}),400);
    rejects(()=>updateAccess({category:'pricing',enabled:false}),400);
    rejects(()=>updateAccess({customer_id:'nobody',category:'pricing',enabled:false}),404);
    expect(enabledCategories('wasatch').has('pricing')).toBe(true);
  });
});

describe('updateMyFloor: My margin floors',()=>{
  afterEach(()=>{updateMyFloor('brandi',{category_id:'safety',floor_pct:30});updateMyFloor('brandi',{category_id:'fasteners',floor_pct:20});});

  it("changes Brandi's own floor, which moves the below-floor warnings on her quotes",async()=>{
    expect(quoteFloors('q-24817')?.belowFloorCount).toBe(1);
    const lowered=updateMyFloor('brandi',{rep_id:'brandi',category_id:'safety',floor_pct:25});
    expect(lowered.floors.find(f=>f.category_id==='safety')).toMatchObject({margin_floor:0.25,label:'25.0%'});
    expect(quoteFloors('q-24817')?.belowFloorCount).toBe(0);
    expect((await repQuoteList('brandi',{now:NOW})).rows.find(r=>r.quote_number==='Q-24817')).toMatchObject({below_floor_count:0});
    // The bolts are at 32.1% ($31.50 on a $21.40 cost): a 35% Fasteners floor puts them below too.
    updateMyFloor('brandi',{category_id:'safety',floor_pct:30});
    updateMyFloor('brandi',{category_id:'fasteners',floor_pct:35});
    expect(quoteFloors('q-24817')?.lines.filter(l=>l.belowFloor).map(l=>l.label)).toEqual(["Below Brandi's 35% Fasteners floor","Below Brandi's 30% Safety & PPE floor"]);
  });

  it('stores tenths of a point, as the portal shows and compares margins',()=>{
    expect(updateMyFloor('brandi',{category_id:'fasteners',floor_pct:22.45}).floors[0]).toMatchObject({margin_floor:0.225,label:'22.5%'});
    expect(updateMyFloor('brandi',{category_id:'fasteners',floor_pct:29.95}).floors[0]).toMatchObject({margin_floor:0.3,label:'30.0%'});
    // 0% is a margin only where the organization floor is 0% too (plan U9).
    updateOrgFloors({floors:[{category_id:'fasteners',floor_pct:0}]});
    expect(updateMyFloor('brandi',{category_id:'fasteners',floor_pct:0}).floors[0]).toMatchObject({margin_floor:0,label:'0.0%'});
    updateOrgFloors({floors:[{category_id:'fasteners',floor_pct:20}]});
    expect(updateMyFloor('brandi',{category_id:'fasteners',floor_pct:99.9}).floors[0]).toMatchObject({margin_floor:0.999,label:'99.9%'});
  });

  // Plan U9 (C_RS3; Appendix C "must be at or above the organization floor (enforced on write)"; Appendix H).
  it('refuses a margin below the organization floor, for that field, with the real floor in its words; at the floor is fine',()=>{
    updateOrgFloors({floors:[{category_id:'safety',floor_pct:30}]});
    try{
      const error=(()=>{try{updateMyFloor('mara',{category_id:'safety',floor_pct:28});}catch(e){return e;}})() as SettingsError;
      expect(error).toBeInstanceOf(SettingsError);
      expect(error).toMatchObject({status:400,code:'below_org_floor',message:'Below the 30.0% organization floor. Pick 30.0% or higher.'});
      expect(error.extra).toEqual({fields:[{category_id:'safety',floor:0.3,detail:'Below the 30.0% organization floor. Pick 30.0% or higher.'}]});
      // Compared at tenths of a point: 29.96% rounds to 30.0%, 29.94% to 29.9%.
      expect(updateMyFloor('mara',{category_id:'safety',floor_pct:29.96}).floors.find(f=>f.category_id==='safety')).toMatchObject({label:'30.0%'});
      rejects(()=>updateMyFloor('mara',{category_id:'safety',floor_pct:29.94}),400,/^Below the 30\.0% organization floor\. Pick 30\.0% or higher\.$/);
      expect(updateMyFloor('mara',{category_id:'tools',floor_pct:18}).floors.find(f=>f.category_id==='tools')).toMatchObject({label:'18.0%'});
      rejects(()=>updateMyFloor('mara',{category_id:'tools',floor_pct:17.9}),400,/^Below the 18\.0% organization floor\. Pick 18\.0% or higher\.$/);
      // The manager's own book (decision 20) is held to the organization floor too.
      rejects(()=>updateMyFloor('brandi',{category_id:'safety',floor_pct:25}),400,/30\.0% organization floor/);
    }finally{
      updateOrgFloors({floors:[{category_id:'safety',floor_pct:20}]});
      updateMyFloor('mara',{category_id:'safety',floor_pct:20});updateMyFloor('mara',{category_id:'tools',floor_pct:20});
    }
    expect(repFloors('mara').map(f=>f.margin_floor)).toEqual([0.2,0.2,0.2,0.2,0.2,0.2]);
  });

  it('saves several of the rep\'s own margins together ({floors}), or none when one is refused, naming every refused field',()=>{
    updateOrgFloors({floors:[{category_id:'safety',floor_pct:30},{category_id:'abrasives',floor_pct:25}]});
    try{
      const saved=updateMyFloor('mara',{floors:[{category_id:'fasteners',floor_pct:24},{category_id:'safety',floor_pct:30}]});
      expect(saved.rep.id).toBe('mara');
      expect(saved.floors.map(f=>[f.category_id,f.label])).toEqual([['fasteners','24.0%'],['abrasives','20.0%'],['safety','30.0%'],['material-handling','20.0%'],['tools','20.0%'],['janitorial','20.0%']]);
      const error=(()=>{try{updateMyFloor('mara',{floors:[{category_id:'fasteners',floor_pct:22},{category_id:'safety',floor_pct:28},{category_id:'abrasives',floor_pct:24}]});}catch(e){return e;}})() as SettingsError;
      expect(error).toMatchObject({status:400,code:'below_org_floor'});
      expect(error.extra).toEqual({fields:[
        {category_id:'safety',floor:0.3,detail:'Below the 30.0% organization floor. Pick 30.0% or higher.'},
        {category_id:'abrasives',floor:0.25,detail:'Below the 25.0% organization floor. Pick 25.0% or higher.'},
      ]});
      expect(repFloors('mara')[0].margin_floor).toBe(0.24);
      for(const bad of [{floors:[]},{floors:'x'},{floors:[{category_id:'fasteners',floor_pct:22},{category_id:'fasteners',floor_pct:23}]},{floors:[{category_id:'fasteners',floor_pct:120}]}])rejects(()=>updateMyFloor('mara',bad),400);
      rejects(()=>updateMyFloor('mara',{floors:[{category_id:'nothing',floor_pct:30}]}),404);
      rejects(()=>updateMyFloor('mara',{rep_id:'eli',floors:[{category_id:'fasteners',floor_pct:30}]}),403);
      expect(repFloors('eli')[0].margin_floor).toBe(0.2);
    }finally{
      updateOrgFloors({floors:[{category_id:'safety',floor_pct:20},{category_id:'abrasives',floor_pct:20}]});
      updateMyFloor('mara',{floors:[{category_id:'fasteners',floor_pct:20},{category_id:'safety',floor_pct:20}]});
    }
  });

  it('rejects a floor outside 0% to 99.9%, or not a number, changing nothing',()=>{
    // Any negative, even one that rounds to 0.0% (cleanup 11).
    for(const floor_pct of [-0.1,-0.01,-0.04,-0.05,-Number.MIN_VALUE,99.96,100,150,Number.NaN,Number.POSITIVE_INFINITY,'25',null,undefined])
      rejects(()=>updateMyFloor('brandi',{category_id:'fasteners',floor_pct}),400,/0%.*99\.9%/);
    rejects(()=>updateMyFloor('brandi',{floor_pct:25}),400);
    rejects(()=>updateMyFloor('brandi',{category_id:'nothing',floor_pct:25}),404);
    expect(repFloors('brandi')[0].margin_floor).toBe(0.2);
  });

  it("refuses another rep's floors and a session with no rep, before anything is written",()=>{
    rejects(()=>updateMyFloor('brandi',{rep_id:'mara',category_id:'fasteners',floor_pct:40}),403);
    rejects(()=>updateMyFloor('',{rep_id:'mara',category_id:'fasteners',floor_pct:40}),403);
    expect(repFloors('mara')[0].margin_floor).toBe(0.2);
  });
});

describe('updatePricing: the scarcity uplift',()=>{
  afterEach(()=>{updatePricing({scarcity_uplift_enabled:false});});

  it("drives the pricing engine's scarcity suggestion (task 1.1) for quotes priced after the change",()=>{
    const straps=()=>priceLines({customerId:'wasatch',repId:'brandi',branchId:'slc',lines:[{itemId:'RS-2-27-JH',qty:12}],on:'2026-09-23'})[0].suggestion;
    expect(straps()).toMatchObject({reason:'customer',price:22.95,scarcity:null});
    expect(updatePricing({scarcity_uplift_enabled:true})).toEqual({scarcity_uplift_enabled:true});
    expect(straps()).toMatchObject({reason:'scarcity',price:24.1,scarcity:{kind:'low_stock',branchCode:'SLC'}});
    expect(updatePricing({scarcity_uplift_enabled:false})).toEqual({scarcity_uplift_enabled:false});
    expect(straps()).toMatchObject({reason:'customer',price:22.95});
  });

  it('rejects anything but true or false',()=>{
    for(const value of ['true',1,null,undefined])rejects(()=>updatePricing({scarcity_uplift_enabled:value}),400);
    expect(pricingSettings().scarcity_uplift_enabled).toBe(false);
  });
});
