// @vitest-environment node
import {afterEach,describe,expect,it} from 'vitest';
import type {NewQuote} from '@/domain';
import {setSettingFixture,useSeededDatabase} from '@/server/repository/test-db';

// Free delivery pricing on a quote (spec §4.1, §4.5, §4.6; decisions 27, 32–36; OA-3, OA-7, OA-22):
// the rate frozen into a draft, margin-weighted recovery on its lines, reallocation on edits, the
// freight override, toggle changes repricing drafts on their next open, sent quotes staying frozen,
// and the customer seeing only the final unit price. The toggle is off by default; these tests flip
// it with setSettingFixture (its manager control arrives in C3).
useSeededDatabase();

const NOW='2026-09-25T18:00:00.000Z',LATER='2026-09-25T19:00:00.000Z',SEND='2026-09-25T20:00:00.000Z';
const DAY=86_400_000;
const daysBefore=(days:number)=>new Date(Date.parse(NOW)-days*DAY).toISOString();
const ST_GEORGE={address:'100 S Main St, St. George, UT 84770',lat:37.0965,lng:-113.5684};

const load=async()=>({
  repo:await import('@/server/repository'),
  detail:await import('./quote-detail'),
  edits:await import('./quote-edits'),
  panels:await import('./quote-panel-edits'),
  service:await import('@/server/quotes/service'),
});

/** Free delivery pricing on, enabled `days` ago: 35 days is ramp step 2 of 3, so the 300 bp starting rate is in force at 200 bp. */
async function freeDelivery(days=35){
  await setSettingFixture('free_delivery_pricing','true');
  await setSettingFixture('free_delivery_enabled_at',daysBefore(days));
}
afterEach(async()=>{
  for(const key of ['free_delivery_pricing','free_delivery_enabled_at','freight_fuel_manual_cents'])await setSettingFixture(key,null);
});

/**
 * A Wasatch delivery draft from SLC (15.0 road mi): 50 boxes of bolts at $31.50 (cost $21.40) and
 * 6 boxes of wheels at the $36.00 contract price, $1,791.00 of goods (over the $1,500 threshold).
 */
async function draft(input:Partial<NewQuote>={}){
  const {repo}=await load();
  return repo.createQuote({customerId:'wasatch',fulfillment:'delivery',branchId:'slc',at:NOW,
    lines:[{itemId:'HCS-12-13-2G8',qty:50,unitPrice:31.5,priceBasis:'custom'},{itemId:'CW-45-045-T1',qty:6,unitPrice:36,priceBasis:'contract'}],...input});
}
const open=async(quoteId:string,now=NOW)=>(await (await load()).detail.repQuoteDetail('brandi',quoteId,{now}))!;
const stored=async(quoteId:string)=>(await load()).repo.quote(quoteId)!;
const frozen=async(quoteId:string)=>{
  const q=await stored(quoteId);
  return {rate:q.freight_rate_bp,step:q.freight_ramp_step,steps:q.freight_ramp_steps,modelled:q.modelled_freight_cents,recovery:q.lines.map(l=>l.freight_recovery)};
};

describe('free delivery pricing off (the default)',()=>{
  it('leaves every price as before: no rate, no recovery, distance and threshold freight unchanged',async()=>{
    const {edits}=await load();
    const q=await draft();
    const detail=await open(q.id);
    expect(await frozen(q.id)).toEqual({rate:null,step:null,steps:null,modelled:null,recovery:[0,0]});
    expect(detail.freight.computed).toMatchObject({rule:'free_threshold',amount:0,miles:15});
    expect(detail.send_check).toMatchObject({subtotal:1791,total:1791});
    const edited=await edits.editRepQuoteLine('brandi',q.id,`${q.id}-1`,{qty:10},{now:LATER});
    expect(edited.freight.computed).toMatchObject({rule:'distance',amount:62.5});
    expect(edited.send_check).toMatchObject({subtotal:531,total:593.5});
    expect((await frozen(q.id)).recovery).toEqual([0,0]);
  });
});

describe('free delivery pricing on',()=>{
  it('reprices a draft on its next open: freezes the rate in force and allocates by margin, contract lines exempt',async()=>{
    await freeDelivery();
    await setSettingFixture('freight_fuel_manual_cents','340');
    const q=await draft();
    const detail=await open(q.id);
    // 200 bp of the bolts' 157,500¢ = 3,150¢, all on the bolts (the wheels are contract): 63¢ a box, under the 252¢ line cap.
    // Modelled cost: the spec §4.2 worked example (15.0 mi from SLC at $3.40/gal) = 4,213¢.
    expect(await frozen(q.id)).toEqual({rate:200,step:2,steps:3,modelled:4213,recovery:[63,0]});
    expect(detail.quote).toMatchObject({freight_rate_bp:200,freight_ramp_step:2,freight_ramp_steps:3});
    expect(detail.lines.map(l=>l.freight_recovery)).toEqual([63,0]);
    expect(detail.freight).toMatchObject({amount:0,source:'computed',computed:{rule:'free_delivery_pricing',amount:0,miles:15,
      explanation:'Free delivery pricing: freight is recovered in item prices.'}});
    // The customer pays $32.13 a box: 50 × $32.13 + 6 × $36.00 = $1,822.50, freight $0.00.
    expect(detail.send_check).toMatchObject({subtotal:1822.5,total:1822.5});
  });

  it('keeps the frozen rate when the rate in force moves, and reallocates on every line edit at that rate',async()=>{
    const {edits}=await load();
    await freeDelivery();
    const q=await draft();
    await open(q.id);
    await freeDelivery(70); // step 3 of 3: 300 bp for new quotes
    const edited=await edits.editRepQuoteLine('brandi',q.id,`${q.id}-1`,{unitPrice:40},{now:LATER});
    // Still 200 bp: 200 bp of 50 × 4,000¢ = 4,000¢ -> 80¢ a box.
    expect(await frozen(q.id)).toMatchObject({rate:200,step:2,steps:3,recovery:[80,0]});
    expect(edited.lines.map(l=>l.freight_recovery)).toEqual([80,0]);
    expect(edited.send_check.subtotal).toBe(2256);
  });

  it('reallocates when a line is added or removed',async()=>{
    const {edits}=await load();
    await freeDelivery();
    const q=await draft();
    await open(q.id);
    const {detail}=await edits.addRepQuoteLine('brandi',q.id,{itemId:'HN-12-13-G8',qty:5},{now:LATER});
    const added=detail.lines.find(l=>l.item_id==='HN-12-13-G8')!;
    const bolts=detail.lines.find(l=>l.item_id==='HCS-12-13-2G8')!;
    expect(added.unit_price).not.toBeNull();
    expect(bolts.freight_recovery+added.freight_recovery).toBeGreaterThan(0);
    const removed=await edits.removeRepQuoteLine('brandi',q.id,added.id,{now:LATER});
    expect(removed.lines.map(l=>l.freight_recovery)).toEqual([63,0]);
  });

  it('carries no recovery on will call, and re-freezes the rate in force when switched back to delivery',async()=>{
    const {panels}=await load();
    await freeDelivery();
    const q=await draft();
    await open(q.id);
    const pickup=await panels.editRepQuoteFulfillment('brandi',q.id,{fulfillment:'will_call'},{now:LATER});
    expect(await frozen(q.id)).toEqual({rate:null,step:null,steps:null,modelled:null,recovery:[0,0]});
    expect(pickup.freight.computed.rule).toBe('will_call');
    await freeDelivery(70);
    await panels.editRepQuoteFulfillment('brandi',q.id,{fulfillment:'delivery'},{now:LATER});
    // 300 bp of 157,500¢ = 4,725¢ -> 94.5 -> 95¢ a box. Fuel has no price yet (C3), so the modelled cost is 3,193¢.
    expect(await frozen(q.id)).toEqual({rate:300,step:3,steps:3,modelled:3193,recovery:[95,0]});
  });

  it('measures the modelled cost from the quote branch when it changes',async()=>{
    const {panels}=await load();
    await freeDelivery();
    const q=await draft();
    await open(q.id);
    expect((await frozen(q.id)).modelled).toBe(3193);
    await panels.editRepQuoteFulfillment('brandi',q.id,{branchId:'provo'},{now:LATER});
    // Provo is 34.3 road mi away: 68.6 mi round trip = 1,372 + 1,029 + 4,900¢ driver = 7,301¢.
    expect(await frozen(q.id)).toMatchObject({rate:200,modelled:7301,recovery:[63,0]});
  });

  it('drops the recovery on a freight override and takes the quote out of the pool; clearing it re-freezes the rate in force (OA-22)',async()=>{
    const {panels,repo}=await load();
    await freeDelivery();
    const q=await draft();
    await open(q.id);
    const overridden=await panels.overrideRepQuoteFreight('brandi',q.id,{amount:80,reason:'Liftgate needed'},{now:LATER});
    expect(await frozen(q.id)).toMatchObject({rate:null,step:null,steps:null,recovery:[0,0]});
    expect(overridden.send_check).toMatchObject({subtotal:1791,total:1871});
    expect(repo.quoteActivity(q.id).map(a=>a.message)).toContain('Freight set to $80.00: Liftgate needed');
    await freeDelivery(70);
    await panels.clearRepQuoteFreight('brandi',q.id,{now:LATER});
    expect(await frozen(q.id)).toMatchObject({rate:300,step:3,steps:3,recovery:[95,0]});
    expect(repo.quoteActivity(q.id).map(a=>a.message)).toContain('Freight override removed: back to distance-based freight.');
  });

  it('gives a quote under the free-delivery threshold $0.00 freight and no recovery (OA-3)',async()=>{
    await freeDelivery();
    const q=await draft({lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'custom'}]});
    const detail=await open(q.id);
    expect(detail.freight.computed).toMatchObject({rule:'free_delivery_pricing',amount:0});
    expect(await frozen(q.id)).toMatchObject({rate:null,recovery:[0]});
    expect(detail.send_check).toMatchObject({subtotal:315,total:315});
  });

  it('still calls for freight beyond the radius, with no recovery (OA-7)',async()=>{
    await freeDelivery();
    const q=await draft({shipTo:ST_GEORGE});
    const detail=await open(q.id);
    expect(detail.freight).toMatchObject({unresolved:true,computed:{rule:'beyond_radius'}});
    expect(await frozen(q.id)).toEqual({rate:null,step:null,steps:null,modelled:null,recovery:[0,0]});
  });

  it('reprices a draft on its next open after the toggle is turned off',async()=>{
    await freeDelivery();
    const q=await draft();
    await open(q.id);
    expect((await frozen(q.id)).rate).toBe(200);
    await setSettingFixture('free_delivery_pricing','false');
    const detail=await open(q.id,LATER);
    expect(await frozen(q.id)).toMatchObject({rate:null,step:null,steps:null,recovery:[0,0]});
    expect(detail.freight.computed.rule).toBe('free_threshold');
  });

  it('carries no recovery while the toggle is on but was never enabled (no enable time: no 0 bp freeze)',async()=>{
    await setSettingFixture('free_delivery_pricing','true');
    const q=await draft();
    const detail=await open(q.id);
    expect(await frozen(q.id)).toMatchObject({rate:null,step:null,steps:null,recovery:[0,0]});
    expect(detail.send_check).toMatchObject({subtotal:1791,total:1791});
  });

  it('does not touch updated_at when it reprices (a send in flight is not a conflict)',async()=>{
    await freeDelivery();
    const q=await draft();
    await open(q.id,LATER);
    expect((await stored(q.id)).updated_at).toBe(NOW);
  });
});

describe('sent quotes and the customer',()=>{
  const RECOVERY=/recover|rate_bp|ramp|modelled|freight_rate/i;
  const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];

  it('freezes the customer-facing unit price into the snapshot; the customer sees it and nothing about recovery',async()=>{
    const {service,repo}=await load();
    await freeDelivery();
    const q=await draft();
    const detail=await open(q.id);
    const {revision}=await service.sendQuote(q.id,{repId:'brandi',now:SEND,expected:{total:detail.send_check.total!}});
    expect(revision.snapshot.lines.map(l=>[l.sku,l.unit_price,l.total])).toEqual([['HCS-12-13-2G8',32.13,1606.5],['CW-45-045-T1',36,216]]);
    expect(revision.snapshot).toMatchObject({subtotal:1822.5,freight:0,total:1822.5});
    expect(revision.total).toBe(1822.5);
    expect(repo.quotes({customerId:'wasatch'}).find(r=>r.id===q.id)?.sent_total).toBe(1822.5);

    const view=repo.customerQuote('wasatch',q.id)!;
    expect(view.sent?.snapshot.lines[0].unit_price).toBe(32.13);
    const pdf=repo.customerQuoteRevision('wasatch',q.id)!;
    for(const payload of [view,pdf,repo.customerQuotes('wasatch')])expect(keys(payload).filter(k=>RECOVERY.test(k))).toEqual([]);
    expect(JSON.stringify(view)).not.toMatch(/"unit_price":31\.5\b/);
  });

  it('keeps Analytics margin vs floor on the price before recovery (OA-10), though the snapshot holds the customer price',async()=>{
    const {service,repo}=await load();
    await freeDelivery();
    const q=await draft();
    await open(q.id);
    await service.sendQuote(q.id,{repId:'brandi',now:SEND});
    const facts=repo.sentLineFacts('wasatch').filter(f=>f.quote_id===q.id);
    expect(facts.map(f=>[f.sku,f.unit_price,f.unit_cost])).toEqual([['HCS-12-13-2G8',31.5,21.4],['CW-45-045-T1',36,24.1]]);
    expect(repo.quoteRevision(q.id,1)!.snapshot.lines[0]).not.toHaveProperty('freight_recovery');
  });

  it('never reprices a sent quote: the toggle changing leaves its lines and snapshot as sent',async()=>{
    const {service,repo}=await load();
    await freeDelivery();
    const q=await draft();
    await open(q.id);
    await service.sendQuote(q.id,{repId:'brandi',now:SEND});
    await setSettingFixture('free_delivery_pricing','false');
    const detail=await open(q.id,'2026-09-26T18:00:00.000Z');
    expect(detail.quote.status).toBe('sent');
    expect(await frozen(q.id)).toMatchObject({rate:200,recovery:[63,0]});
    expect(repo.quoteRevision(q.id,1)!.snapshot.lines[0].unit_price).toBe(32.13);
  });

  it('reprices a changes_requested draft on its next open',async()=>{
    const {service}=await load();
    await freeDelivery();
    const q=await draft();
    await open(q.id);
    await service.sendQuote(q.id,{repId:'brandi',now:SEND});
    service.requestChanges('wasatch',q.id,{revision:1,note:'Need 60 boxes',now:'2026-09-26T10:00:00.000Z'});
    await setSettingFixture('free_delivery_pricing','false');
    await open(q.id,'2026-09-26T18:00:00.000Z');
    expect(await frozen(q.id)).toMatchObject({rate:null,recovery:[0,0]});
  });
});
