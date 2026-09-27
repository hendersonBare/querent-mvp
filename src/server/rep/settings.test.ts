import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import type {ClarifyPayload} from '@/domain';
import {CANDIDATE_ROUND,present} from '@/server/chat/clarify';
import {customerContacts} from '@/server/customer/sidebar';
import {quoteFloors} from '@/server/floors/service';
import {ask} from '@/server/pipeline';
import {priceLines} from '@/server/pricing/service';
import {access,assignedRep,createQuote,enabledCategories,pricingSettings,quote,repFloors} from '@/server/repository';
import {useSeededDatabase} from '@/server/repository/test-db';
import {repQuoteList} from './quotes';
import {SettingsError,assignRep,dataSources,repSettings,updateAccess,updateMyFloor,updatePricing} from './settings';

// Settings (spec §4, task 6.1) against the seed pinned to the mockup's day: Brandi has Wasatch and
// Great Basin, Mara has Canyon Ridge, Nora has Uinta; every quote is Wasatch's and Brandi's.
useSeededDatabase();

const NOW='2026-09-23T18:00:00.000Z';
const env={scripted:process.env.QUERENT_SCRIPTED};
beforeEach(()=>{process.env.QUERENT_SCRIPTED='1';});
afterEach(()=>{if(env.scripted===undefined)delete process.env.QUERENT_SCRIPTED;else process.env.QUERENT_SCRIPTED=env.scripted;});

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

describe('repSettings: the page snapshot',()=>{
  it('lists every customer (placeholders too) with its one rep and its quotes by rep, and every rep to pick from',()=>{
    const settings=repSettings('brandi');
    expect(settings.rep_id).toBe('brandi');
    expect(settings.reps.map(r=>r.name)).toEqual(['Brandi Gallegos','Eli Porter','Mara Jensen','Nora Chen']);
    expect(settings.assignments.map(a=>[a.name,a.account_number,a.rep_name,a.placeholder])).toEqual([
      ['Canyon Ridge Builders','CRB-3318','Mara Jensen',true],
      ['Great Basin Fabrication','GBF-2207','Brandi Gallegos',true],
      ['Uinta Facility Services','UFS-4051','Nora Chen',true],
      ['Wasatch Mechanical Contractors','WAS-1142','Brandi Gallegos',false],
    ]);
    expect(settings.assignments.find(a=>a.id==='wasatch')!.quotes).toEqual([{rep_id:'brandi',rep_name:'Brandi Gallegos',count:25}]);
    expect(settings.assignments.find(a=>a.id==='great-basin')!.quotes).toEqual([]);
  });

  it("has Brandi's floors to edit, shown as the warnings print them, and the other reps' read-only",()=>{
    const {floors}=repSettings('brandi');
    expect(floors.mine.rep.name).toBe('Brandi Gallegos');
    expect(floors.mine.floors.map(f=>[f.category_name,f.margin_floor,f.label])).toEqual([
      ['Fasteners',0.2,'20.0%'],['Abrasives & Cutting',0.25,'25.0%'],['Safety & PPE',0.3,'30.0%'],
      ['Material Handling & Tie-downs',0.2,'20.0%'],['Tools',0.18,'18.0%'],['Janitorial/MRO',0.2,'20.0%'],
    ]);
    expect(floors.others.map(o=>o.rep.name)).toEqual(['Eli Porter','Mara Jensen','Nora Chen']);
    expect(floors.others.every(o=>o.floors.length===6&&o.floors.every(f=>f.label==='20.0%'))).toBe(true);
  });

  it('carries customer access for the picked customer (All customers by default, and for an unknown id)',()=>{
    const all=repSettings('brandi').access;
    expect(all.customer_id).toBeNull();
    expect(all.rules.map(r=>[r.category,r.enabled])).toEqual([['items_stock',true],['pricing',true],['orders_quotes',true],['account',true]]);
    expect(all.rules[0]).toMatchObject({mixed_rep:true,rep_name:'Multiple reps'});
    expect(repSettings('brandi',{customerId:'wasatch'}).access).toMatchObject({customer_id:'wasatch',rules:[{category:'items_stock',rep_name:'Brandi Gallegos'},{},{},{}]});
    expect(repSettings('brandi',{customerId:'nobody'}).access.customer_id).toBeNull();
  });

  it('shows pricing (scarcity off by default), the seed delivery rates with the road factor, and the data sources',()=>{
    const settings=repSettings('brandi');
    expect(settings.pricing).toEqual({scarcity_uplift_enabled:false});
    expect(settings.delivery).toEqual({base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25});
    expect(settings.sources.database).toMatchObject({seed_date:'2026-09-23',records:{customers:4}});
    expect(settings.sources.erp.last_updated).toEqual(expect.any(String));
    expect(settings.sources.erp.events[0]).toMatchObject({message:'ERP connection refreshed'});
    expect(dataSources()).toEqual(settings.sources);
  });
});

describe('assignRep: one rep per customer',()=>{
  afterEach(()=>{assignRep({customer_id:'wasatch',rep_id:'brandi'});});

  it("never reassigns existing quotes: they stay in the old rep's list, against the old rep's floors",async()=>{
    assignRep({customer_id:'wasatch',rep_id:'mara'});
    expect(quote('q-24817')?.rep_id).toBe('brandi');
    expect(quoteFloors('q-24817')).toMatchObject({rep_id:'brandi',belowFloorCount:1});
    const brandi=await repQuoteList('brandi',{customerId:'wasatch',now:NOW});
    expect(brandi).toMatchObject({other_rep:true,counts:{all:25}});
    expect(brandi.rows[0]).toMatchObject({quote_number:'Q-24817',below_floor_count:1});
    const row=repSettings('brandi').assignments.find(a=>a.id==='wasatch')!;
    expect(row.rep_name).toBe('Mara Jensen');
    expect(row.quotes).toEqual([{rep_id:'brandi',rep_name:'Brandi Gallegos',count:25}]);
  });

  it("reassigns the customer: the rep contact Dana sees follows, and new quotes go to the new rep",()=>{
    const {assignments}=assignRep({customer_id:'wasatch',rep_id:'mara'});
    expect(assignments.find(a=>a.id==='wasatch')).toMatchObject({rep_id:'mara',rep_name:'Mara Jensen'});
    expect(assignedRep('wasatch')?.name).toBe('Mara Jensen');
    // The 2.4 sidebar and the access rules (the chat's rep panel) read the assignment live.
    expect(customerContacts('wasatch').rep).toMatchObject({name:'Mara Jensen',phone:'(801) 555-0102'});
    expect(access('wasatch')[0]).toMatchObject({rep_id:'mara',rep_name:'Mara Jensen'});
    // The 2.2 rep card, shown with the candidate buttons from the second round.
    const secondRound={open:[{round:CANDIDATE_ROUND,candidates:[]}],cart:{lines:[]}} as unknown as ClarifyPayload;
    expect(present({customerId:'wasatch'},secondRound).rep).toMatchObject({name:'Mara Jensen',phone:'(801) 555-0102',email:'mara.jensen@herrickindustrial.com'});
    // A quote requested now is the new rep's (spec §5.2: the quote's rep is the customer's assigned rep).
    const fresh=createQuote({customerId:'wasatch',contactId:'dana',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'last_paid'}]});
    expect(fresh.rep_id).toBe('mara');
    expect(repSettings('brandi').assignments.find(a=>a.id==='wasatch')!.quotes).toEqual([
      {rep_id:'brandi',rep_name:'Brandi Gallegos',count:25},{rep_id:'mara',rep_name:'Mara Jensen',count:1},
    ]);
  });

  it("names the new rep when chat refuses a category the customer has turned off",async()=>{
    assignRep({customer_id:'wasatch',rep_id:'mara'});
    updateAccess({customer_id:'wasatch',category:'items_stock',enabled:false});
    try{
      const answer=await ask('wasatch','conv-settings-reassigned','Do you have 1/2 in grade 8 hex bolts in stock?',{contactId:'dana'});
      expect(answer.outcome).toBe('restricted');
      expect(answer.answer).toContain('Mara Jensen');
      expect(answer.answer).toContain('(801) 555-0102');
    }finally{updateAccess({customer_id:'wasatch',category:'items_stock',enabled:true});}
  });

  it('rejects a bad request, and an unknown customer or rep, changing nothing',()=>{
    rejects(()=>assignRep({}),400);
    rejects(()=>assignRep({customer_id:'wasatch'}),400);
    rejects(()=>assignRep({customer_id:'wasatch',rep_id:7}),400);
    rejects(()=>assignRep(null),400);
    rejects(()=>assignRep({customer_id:'nobody',rep_id:'mara'}),404,/customer/i);
    rejects(()=>assignRep({customer_id:'wasatch',rep_id:'nobody'}),404,/rep/i);
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
    expect(repSettings('brandi').access.rules.find(r=>r.category==='pricing')).toMatchObject({enabled:null});
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
    expect((await repQuoteList('brandi',{now:NOW})).rows[0]).toMatchObject({quote_number:'Q-24817',below_floor_count:0});
    // The bolts are at 32.1% ($31.50 on a $21.40 cost): a 35% Fasteners floor puts them below too.
    updateMyFloor('brandi',{category_id:'safety',floor_pct:30});
    updateMyFloor('brandi',{category_id:'fasteners',floor_pct:35});
    expect(quoteFloors('q-24817')?.lines.filter(l=>l.belowFloor).map(l=>l.label)).toEqual(["Below Brandi's 35% Fasteners floor","Below Brandi's 30% Safety & PPE floor"]);
  });

  it('stores tenths of a point, as the portal shows and compares margins',()=>{
    expect(updateMyFloor('brandi',{category_id:'fasteners',floor_pct:22.45}).floors[0]).toMatchObject({margin_floor:0.225,label:'22.5%'});
    expect(updateMyFloor('brandi',{category_id:'fasteners',floor_pct:29.95}).floors[0]).toMatchObject({margin_floor:0.3,label:'30.0%'});
    expect(updateMyFloor('brandi',{category_id:'fasteners',floor_pct:0}).floors[0]).toMatchObject({margin_floor:0,label:'0.0%'});
    expect(updateMyFloor('brandi',{category_id:'fasteners',floor_pct:99.9}).floors[0]).toMatchObject({margin_floor:0.999,label:'99.9%'});
  });

  it('rejects a floor outside 0% to 99.9%, or not a number, changing nothing',()=>{
    for(const floor_pct of [-0.1,99.96,100,150,Number.NaN,Number.POSITIVE_INFINITY,'25',null,undefined])
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
