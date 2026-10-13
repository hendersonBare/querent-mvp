import {afterAll,afterEach,beforeAll,describe,expect,it,vi} from 'vitest';
import type {ItemPopupPayload,QuoteRequestedPayload} from '@/domain';
import type {QuoteRequestInput} from '@/lib/contracts';
import {SEED_DATE,clearSeededPool,setSettingFixture,useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();
// The demo seed's pilot quotes (task F1) are dated from the real clock: out of the pool, so the starting rate is the one in force at this file's fixed times.
beforeAll(clearSeededPool);

// Request quote (task 2.3): the item pop-up's cart becomes a ready_for_review quote for Brandi,
// priced by the pricing engine (1.1), with freight (1.3) and upsells (1.6) available on it, and the
// chat says "Sent to Brandi for review.". Dana's scripted conversation drives the pop-up, as in the
// golden flow.

const NOW=`${SEED_DATE}T18:00:00.000Z`;
const OPTIONS={now:NOW,on:SEED_DATE};
const DANA={customerId:'wasatch',contactId:'dana'};
const REQUEST='Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We\'ll pick up at SLC.';
const CART=[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T1',qty:6}];
/** Keys a customer may never see, and the seeded unit costs of the two items. */
const FORBIDDEN=/cost|margin|floor|suggest|explanation|basis|internal|price|gp/i;
const SEEDED_COSTS=/\b(?:21\.4|24\.1)\b/;

const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];
/** Every leaf value in `value`. */
const leaves=(value:unknown):unknown[]=>Array.isArray(value)?value.flatMap(leaves):value&&typeof value==='object'?Object.values(value).flatMap(leaves):[value];
/** `amount` as a number in text ("36", "36.00", "$36"), not as digits inside an id or a timestamp. */
const mentions=(text:string,amount:number)=>new RegExp(`(?<![\\w.:-])\\$?${String(amount).replace('.','\\.')}(?:0*)?(?![\\w:]|\\.\\d*[1-9])`).test(text);
let scripted:string|undefined;
beforeAll(()=>{scripted=process.env.QUERENT_SCRIPTED;process.env.QUERENT_SCRIPTED='1';});
afterAll(()=>{if(scripted===undefined)delete process.env.QUERENT_SCRIPTED;else process.env.QUERENT_SCRIPTED=scripted;});
afterEach(async()=>{(await import('@/server/repository')).setAccess('wasatch','items_stock',true);});

let conversations=0;
/** Dana's request and "Type 1" in a new conversation: the item pop-up with the bolts and the Type 1 wheels. */
async function popupConversation(messages=[REQUEST,'Type 1']){
  const {ask}=await import('@/server/pipeline');
  const id=`popup-${++conversations}`;
  let last;
  for(const message of messages)last=await ask('wasatch',id,message,{contactId:'dana'});
  expect(last).toMatchObject({kind:'item_popup'});
  return {id,popup:last!.payload as ItemPopupPayload};
}

const body=(conversation_id:string,over:Partial<QuoteRequestInput>={}):QuoteRequestInput=>({conversation_id,fulfillment:'will_call',branch_id:'slc',lines:CART,...over});
const services=async()=>({
  ...(await import('./quote-request')),
  ...(await import('@/server/repository')),
  ...(await import('@/server/freight/quote')),
  ...(await import('@/server/upsells/service')),
  ...(await import('@/server/rep/badges')),
});

describe('Request quote',()=>{
  it('drafts a ready_for_review quote at Querent\'s suggested prices, with explanations, unread for Brandi',async()=>{
    const {requestQuote,quote,repBadges}=await services();
    const {id,popup}=await popupConversation();
    expect(popup).toEqual({fulfillment:'will_call',branch_id:'slc',lines:[
      {sku:'HCS-12-13-2G8',qty:10,requested_text:'10 boxes of the 1/2 in grade 8 hex bolts'},
      {sku:'CW-45-045-T1',qty:6,requested_text:'6 boxes of cut-off wheels'},
    ],suggestions:expect.any(Array),suggestions_offered:3});
    const badge=repBadges('brandi',{now:NOW}).quotes;

    const result=await requestQuote(DANA,body(id),OPTIONS);
    expect(result).toMatchObject({quote:{quote_number:'Q-24818',status:'ready_for_review'},replayed:false});

    const q=quote(result.quote.id)!;
    expect(q).toMatchObject({status:'ready_for_review',revision:0,customer_id:'wasatch',contact_id:'dana',rep_id:'brandi',conversation_id:id,fulfillment:'will_call',
      branch_id:'slc',request_text:REQUEST,requested_at:NOW,unread_for_rep:true,unread_for_customer:false,is_sample:false,
      ship_to_address:'1800 W 10950 S, South Jordan, UT 84095'});
    // Priced like the mockup's sample quote (same SKUs and qty): last paid on the bolts, the contract on the wheels.
    const sample=quote('q-24817')!;
    expect(q.lines.map(l=>[l.sku,l.qty,l.suggested_basis,l.added_by,l.requested_text])).toEqual([
      ['HCS-12-13-2G8',10,'last_paid','querent','10 boxes of the 1/2 in grade 8 hex bolts'],
      ['CW-45-045-T1',6,'contract','querent','6 boxes of cut-off wheels'],
    ]);
    q.lines.forEach((line,i)=>{
      expect(line.suggested_price).toBe(sample.lines[i].suggested_price);
      expect(line.unit_price).toBe(line.suggested_price);
      expect(line.price_basis).toBe(line.suggested_basis);
      expect(line.customer_price).toBe(sample.lines[i].customer_price);
      expect(line.explanation).toBe(sample.lines[i].explanation);
      expect(line.unit_cost).toBeGreaterThan(0);
    });
    expect(q.lines[0].explanation).toMatch(/Last paid \$.* on Aug 12/);
    expect(q.lines[1].explanation).toMatch(/contract/i);

    expect(repBadges('brandi',{now:NOW}).quotes).toBe(badge+1);
  });

  it('logs the request in Activity and confirms in the chat with Brandi\'s name and the quote number',async()=>{
    const {requestQuote,quoteActivity,conversationMessages,history}=await services();
    const {id}=await popupConversation([REQUEST,'Not sure','Type 1']);
    const {quote:created,turn}=await requestQuote(DANA,body(id),OPTIONS);

    expect(quoteActivity(created.id).map(a=>[a.actor,a.actor_id,a.kind,a.message,a.at])).toEqual([
      ['customer','dana','requested','Dana requested a quote in Querent chat: 2 items, pickup at SLC',NOW],
      ['querent',null,'matched','Querent matched 2 items after 2 clarifying questions',NOW],
      ['querent',null,'drafted','Draft quote built at Querent\'s suggested prices and sent to Brandi for review',NOW],
    ]);

    const answer=`Sent to Brandi for review. Your quote number is **${created.quote_number}**. Brandi will price it and send it to you here in chat.`;
    const question='Request quote: 10 × HCS-12-13-2G8, 6 × CW-45-045-T1 (pickup at SLC).';
    expect(turn).toMatchObject({question,answer,kind:'quote_requested',outcome:'answered',categories:[]});
    expect(turn).not.toHaveProperty('sql');
    const payload=turn.payload as QuoteRequestedPayload;
    expect(payload).toMatchObject({quote_id:created.id,quote_number:created.quote_number,status:'ready_for_review'});

    const messages=conversationMessages('wasatch',id);
    const popup=messages.findLast(m=>m.kind==='item_popup')!;
    expect(payload.popup_message_id).toBe(popup.id);
    expect(messages.slice(-2).map(m=>[m.role,m.kind,m.content])).toEqual([['customer','text',question],['assistant','quote_requested',answer]]);
    // Reopening the chat shows the confirmation after the pop-up.
    expect(history('wasatch',id).slice(-2).map(t=>[t.kind,t.question])).toEqual([['item_popup','Type 1'],['quote_requested',question]]);
  });

  it('prices freight from the quote (task 1.3): will call is free, delivery goes by distance from the branch',async()=>{
    const {requestQuote,quote,freightForQuote}=await services();
    const pickup=await requestQuote(DANA,body((await popupConversation()).id),OPTIONS);
    expect(await freightForQuote(quote(pickup.quote.id)!)).toMatchObject({amount:0,computed:{rule:'will_call'},source:'computed'});

    const delivery=await requestQuote(DANA,body((await popupConversation()).id,{fulfillment:'delivery'}),OPTIONS);
    const q=quote(delivery.quote.id)!;
    expect(q).toMatchObject({fulfillment:'delivery',branch_id:'slc',ship_to_address:'1800 W 10950 S, South Jordan, UT 84095',ship_to_lat:40.5513,ship_to_lng:-111.933});
    // Spec §5.3's example: 12 mi straight line from SLC, 15.0 road miles, $25 + $2.50 x 15.0 = $62.50.
    expect(await freightForQuote(q)).toMatchObject({amount:62.5,computed:{rule:'distance',miles:15,formula:'$25.00 + $2.50/mi × 15.0 mi = $62.50'},unresolved:false});
  });

  it('leaves the upsell chips (task 1.6) to the quote: nuts and washers for the bolts',async()=>{
    const {requestQuote,quoteUpsells}=await services();
    const {quote:created}=await requestQuote(DANA,body((await popupConversation()).id),OPTIONS);
    const chips=quoteUpsells(created.id,{on:SEED_DATE})!;
    expect(chips.map(c=>c.kind)).toContain('matching_fastener');
    const parts=chips.flatMap(c=>c.kind==='matching_fastener'?[c.evidence.part]:[]);
    expect(parts.sort()).toEqual(['nut','washer']);
    expect(chips.filter(c=>c.kind==='matching_fastener').every(c=>c.anchor.sku==='HCS-12-13-2G8')).toBe(true);
  });

  it('takes the customer\'s edits: qty, removed lines, delivery and another branch',async()=>{
    const {requestQuote,quote}=await services();
    const {id}=await popupConversation();
    const {quote:created}=await requestQuote(DANA,body(id,{fulfillment:'delivery',branch_id:'ogden',lines:[{sku:'hcs-12-13-2g8',qty:3}]}),OPTIONS);
    const q=quote(created.id)!;
    expect(q).toMatchObject({fulfillment:'delivery',branch_id:'ogden',branch_code:'Ogden'});
    expect(q.lines.map(l=>[l.sku,l.qty])).toEqual([['HCS-12-13-2G8',3]]);
    // 3 boxes is below the 10-box case: a broken case, priced at customer price + 10% (spec §5.1,
    // $30.95 + 10%), and the note says why.
    expect(q.lines[0]).toMatchObject({suggested_basis:'custom',unit_price:34.05,suggested_price:34.05});
    expect(q.lines[0].explanation).toMatch(/Broken-case/i);
  });

  it('returns only customer-safe fields: no price, cost, margin, basis or explanation anywhere',async()=>{
    const {requestQuote,quote}=await services();
    const result=await requestQuote(DANA,body((await popupConversation()).id),OPTIONS);
    expect(keys(result).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    const values=leaves(result);
    const strings=values.filter((v):v is string=>typeof v==='string');
    expect(strings.join('\n')).not.toMatch(SEEDED_COSTS);
    expect(strings.join('\n')).not.toContain('$');
    const amounts=quote(result.quote.id)!.lines.flatMap(l=>[l.unit_price!,l.suggested_price!,l.customer_price!,l.unit_cost]);
    expect(amounts.every(a=>a>0)).toBe(true);
    for(const amount of amounts){
      expect(values).not.toContain(amount);
      expect(strings.filter(text=>mentions(text,amount))).toEqual([]);
    }
    // The scanners do catch a leak.
    expect(mentions('Bolts at $36.00 each',36)).toBe(true);
    expect(mentions('conv 1f36a-36b 02:13:36Z Q-24836',36)).toBe(false);
  });
});

describe('free delivery pricing at creation (spec §4.2, §4.4, §4.5)',()=>{
  const DAY=86_400_000;
  /** 60 boxes of bolts and 6 boxes of the contract wheels, delivered from SLC: over the $1,500 threshold. */
  const BIG=[{sku:'HCS-12-13-2G8',qty:60},{sku:'CW-45-045-T1',qty:6}];
  const RECOVERY=/recover|rate|ramp|modelled/i;
  afterEach(async()=>{for(const key of ['free_delivery_pricing','free_delivery_enabled_at','freight_fuel_manual_cents'])await setSettingFixture(key,null);});

  it('freezes the rate in force, its ramp step and the modelled cost, and allocates recovery to the lines',async()=>{
    const {requestQuote,quote}=await services();
    const {allocateRecovery}=await import('@/server/freight/recovery');
    const {toCents}=await import('@/lib/money');
    await setSettingFixture('free_delivery_pricing','true');
    await setSettingFixture('free_delivery_enabled_at',new Date(Date.parse(NOW)-35*DAY).toISOString());
    await setSettingFixture('freight_fuel_manual_cents','340');
    const result=await requestQuote(DANA,body((await popupConversation()).id,{fulfillment:'delivery',lines:BIG}),OPTIONS);
    const q=quote(result.quote.id)!;
    // The 300 bp starting rate (no eligible quotes yet) at ramp step 2 of 3 = 200 bp; the spec §4.2 example cost, 4,213¢.
    expect(q).toMatchObject({freight_rate_bp:200,freight_ramp_step:2,freight_ramp_steps:3,modelled_freight_cents:4213});
    const expected=allocateRecovery({rateBp:200,lineCapBp:800,lines:q.lines.map(l=>({line_no:l.line_no,qty:l.qty,unitPriceCents:toCents(l.unit_price!),unitCostCents:toCents(l.unit_cost),basis:l.price_basis}))});
    expect(q.lines.map(l=>l.freight_recovery)).toEqual(expected.map(e=>e.freight_recovery));
    expect(q.lines.map(l=>[l.sku,l.price_basis,l.freight_recovery>0])).toEqual([['HCS-12-13-2G8',expect.anything(),true],['CW-45-045-T1','contract',false]]);
    // The customer's answer says nothing about it.
    expect(keys(result).filter(k=>RECOVERY.test(k)||FORBIDDEN.test(k))).toEqual([]);
  });

  it('with free delivery pricing off, freezes only the modelled cost of a delivery: no rate, no recovery',async()=>{
    const {requestQuote,quote}=await services();
    const delivery=quote((await requestQuote(DANA,body((await popupConversation()).id,{fulfillment:'delivery',lines:BIG}),OPTIONS)).quote.id)!;
    // Fuel at the seeded UT $3.40/gal (C3): 1,020 + 600 + 450 + 2,142.86¢ = 4,213¢.
    expect(delivery).toMatchObject({freight_rate_bp:null,freight_ramp_step:null,freight_ramp_steps:null,modelled_freight_cents:4213});
    expect(delivery.lines.map(l=>l.freight_recovery)).toEqual([0,0]);
    const pickup=quote((await requestQuote(DANA,body((await popupConversation()).id,{lines:BIG}),OPTIONS)).quote.id)!;
    expect(pickup).toMatchObject({freight_rate_bp:null,modelled_freight_cents:null});
  });

  it('carries no recovery on will call even with free delivery pricing on',async()=>{
    const {requestQuote,quote}=await services();
    await setSettingFixture('free_delivery_pricing','true');
    await setSettingFixture('free_delivery_enabled_at',new Date(Date.parse(NOW)-35*DAY).toISOString());
    const pickup=quote((await requestQuote(DANA,body((await popupConversation()).id,{lines:BIG}),OPTIONS)).quote.id)!;
    expect(pickup).toMatchObject({freight_rate_bp:null,modelled_freight_cents:null});
    expect(pickup.lines.map(l=>l.freight_recovery)).toEqual([0,0]);
  });

  it('measures the miles with the DistanceProvider it is given',async()=>{
    const {requestQuote,quote}=await services();
    const provider={roadMiles:async()=>20};
    const q=quote((await requestQuote(DANA,body((await popupConversation()).id,{fulfillment:'delivery',lines:BIG}),{...OPTIONS,provider})).quote.id)!;
    // 40 mi round trip: 1,360¢ fuel at the seeded $3.40/gal + 800 + 600 + 2,857.14¢ = 5,617¢.
    expect(q.modelled_freight_cents).toBe(5617);
  });
});

// Decision 71 (plan U12): a feature flag that is off also stops what it governs on a new quote,
// whatever is stored; with the flag on, the stored settings apply. vitest.setup.ts turns the flags on.
describe('feature flags off at creation (decision 71)',()=>{
  const DAY=86_400_000;
  const BIG=[{sku:'HCS-12-13-2G8',qty:60},{sku:'CW-45-045-T1',qty:6}];
  const STORED=['free_delivery_pricing','free_delivery_enabled_at','freight_starting_rate_bp','freight_ramp_steps','freight_ramp_days','freight_stop_minutes','freight_fuel_manual_cents'];
  afterEach(async()=>{vi.unstubAllEnvs();for(const key of STORED)await setSettingFixture(key,null);});
  const freeDeliveryStored=async()=>{
    await setSettingFixture('free_delivery_pricing','true');
    await setSettingFixture('free_delivery_enabled_at',new Date(Date.parse(NOW)-35*DAY).toISOString());
  };
  const newDelivery=async()=>{
    const {requestQuote,quote}=await services();
    return quote((await requestQuote(DANA,body((await popupConversation()).id,{fulfillment:'delivery',lines:BIG}),OPTIONS)).quote.id)!;
  };

  it('FEATURE_FREE_DELIVERY_PRICING off: no rate and no recovery, and the normal freight line, though free delivery pricing is stored on',async()=>{
    const {freightForQuote}=await services();
    await freeDeliveryStored();
    vi.stubEnv('FEATURE_FREE_DELIVERY_PRICING','');
    const off=await newDelivery();
    expect(off).toMatchObject({freight_rate_bp:null,freight_ramp_step:null,freight_ramp_steps:null,modelled_freight_cents:4213});
    expect(off.lines.map(l=>l.freight_recovery)).toEqual([0,0]);
    expect((await freightForQuote(off)).computed).toMatchObject({rule:'free_threshold',amount:0});
    vi.stubEnv('FEATURE_FREE_DELIVERY_PRICING','1');
    const on=await newDelivery();
    expect(on).toMatchObject({freight_rate_bp:200,freight_ramp_step:2,freight_ramp_steps:3});
    expect((await freightForQuote(on)).computed).toMatchObject({rule:'free_delivery_pricing',amount:0});
  });

  it('FEATURE_RECOVERY_POOL off: the code starting rate and ramp, not the stored ones',async()=>{
    await freeDeliveryStored();
    await setSettingFixture('freight_starting_rate_bp','600');
    await setSettingFixture('freight_ramp_steps','4');
    await setSettingFixture('freight_ramp_days','120');
    vi.stubEnv('FEATURE_RECOVERY_POOL','');
    // 300 bp at step 2 of 3.
    expect(await newDelivery()).toMatchObject({freight_rate_bp:200,freight_ramp_step:2,freight_ramp_steps:3});
    vi.stubEnv('FEATURE_RECOVERY_POOL','1');
    // 600 bp at step 2 of 4.
    expect(await newDelivery()).toMatchObject({freight_rate_bp:300,freight_ramp_step:2,freight_ramp_steps:4});
  });

  it('FEATURE_DELIVERY_COST_MODEL off: the modelled cost from the code inputs, not the stored ones',async()=>{
    await setSettingFixture('freight_stop_minutes','15');
    await setSettingFixture('freight_fuel_manual_cents','400');
    vi.stubEnv('FEATURE_DELIVERY_COST_MODEL','');
    // The spec §4.2 example at the seeded UT $3.40/gal: 4,213¢.
    expect((await newDelivery()).modelled_freight_cents).toBe(4213);
    vi.stubEnv('FEATURE_DELIVERY_COST_MODEL','1');
    // $4.00/gal and a 15-minute stop: 1,200 + 600 + 450 + 2,767.86¢ = 5,018¢.
    expect((await newDelivery()).modelled_freight_cents).toBe(5018);
  });
});

describe('one quote per pop-up',()=>{
  it('replays the quote when Request quote is pressed again, without a second quote, badge or confirmation',async()=>{
    const {requestQuote,quotes,conversationMessages,repBadges}=await services();
    const {id}=await popupConversation();
    const count=quotes({customerId:'wasatch'}).length,badge=repBadges('brandi',{now:NOW}).quotes;
    const first=await requestQuote(DANA,body(id),OPTIONS);
    const again=await requestQuote(DANA,body(id,{lines:[{sku:'HCS-12-13-2G8',qty:99}]}),OPTIONS);
    expect(again).toMatchObject({replayed:true,quote:first.quote});
    expect(again.turn).toMatchObject({question:first.turn.question,answer:first.turn.answer,kind:'quote_requested'});
    expect(quotes({customerId:'wasatch'})).toHaveLength(count+1);
    expect(repBadges('brandi',{now:NOW}).quotes).toBe(badge+1);
    expect(conversationMessages('wasatch',id).filter(m=>m.kind==='quote_requested')).toHaveLength(1);
  });

  it('makes a new quote from a new pop-up in the same conversation',async()=>{
    const {requestQuote}=await services();
    const {ask}=await import('@/server/pipeline');
    const {id}=await popupConversation();
    const first=await requestQuote(DANA,body(id),OPTIONS);
    expect(await ask('wasatch',id,'Please quote 2 boxes of the 1/2 in grade 8 hex bolts',{contactId:'dana'})).toMatchObject({kind:'item_popup'});
    const second=await requestQuote(DANA,body(id,{lines:[{sku:'HCS-12-13-2G8',qty:2}]}),OPTIONS);
    expect(second.replayed).toBe(false);
    expect(second.quote.quote_number).not.toBe(first.quote.quote_number);
  });
});

describe('lines added from the pop-up suggestions (task E1)',()=>{
  it("accepts an offered suggestion at the customer's qty and stores it as added_by 'suggestion'; the matched lines stay 'querent'",async()=>{
    const {requestQuote,quote}=await services();
    const {id,popup}=await popupConversation();
    expect(popup.suggestions!.map(s=>s.sku)).toEqual(['HN-12-13-G8','FW-12-G8','FD-45-60Z']);
    const result=await requestQuote(DANA,body(id,{lines:[...CART,{sku:'hn-12-13-g8',qty:1}]}),OPTIONS);
    const lines=quote(result.quote.id)!.lines;
    expect(lines.map(l=>[l.item_id,l.qty,l.added_by,l.requested_text])).toEqual([
      ['HCS-12-13-2G8',10,'querent','10 boxes of the 1/2 in grade 8 hex bolts'],['CW-45-045-T1',6,'querent','6 boxes of cut-off wheels'],['HN-12-13-G8',1,'suggestion',null]]);
    expect(lines[2].unit_price).toBeGreaterThan(0);
    expect(result.turn.question).toBe('Request quote: 10 × HCS-12-13-2G8, 6 × CW-45-045-T1, 1 × HN-12-13-G8 (pickup at SLC).');
  });

  it('still refuses a SKU that was neither on the list nor offered',async()=>{
    const {requestQuote}=await services();
    const {id}=await popupConversation();
    await expect(requestQuote(DANA,body(id,{lines:[...CART,{sku:'GLV-N8-L-1000',qty:1}]}),OPTIONS)).rejects.toThrow("GLV-N8-L-1000 isn't on your list. Ask for it in the chat to add it.");
  });
});

describe('server-side validation',()=>{
  it.each([
    ['a price',{unit_price:1}],
    ['a cost',{cost:1}],
  ])('refuses %s: the rep sets prices',async(_,extra)=>{
    const {requestQuote,QuoteRequestError}=await services();
    const {id}=await popupConversation();
    await expect(requestQuote(DANA,{...body(id),...extra},OPTIONS)).rejects.toThrow(QuoteRequestError);
    await expect(requestQuote(DANA,{...body(id),...extra},OPTIONS)).rejects.toThrow(/Your rep sets the prices/);
    await expect(requestQuote(DANA,body(id,{lines:[{sku:'HCS-12-13-2G8',qty:10,unit_price:0.01} as never]}),OPTIONS)).rejects.toThrow(/not unit_price/);
  });

  it.each([0,-1,1.5,10000,Number.NaN,'10' as never])('refuses qty %s',async qty=>{
    const {requestQuote}=await services();
    const {id}=await popupConversation();
    await expect(requestQuote(DANA,body(id,{lines:[{sku:'HCS-12-13-2G8',qty}]}),OPTIONS)).rejects.toThrow('Quantities must be whole numbers from 1 to 9999.');
  });

  it('refuses unknown, unlisted and repeated SKUs, and an empty list',async()=>{
    const {requestQuote}=await services();
    const {id}=await popupConversation();
    const refusal=async(lines:QuoteRequestInput['lines'])=>{try{await requestQuote(DANA,body(id,{lines}),OPTIONS);}catch(e){return [(e as {status:number}).status,(e as Error).message];}return undefined;};
    expect(await refusal([{sku:'NOPE-1',qty:1}])).toEqual([422,'No item has SKU NOPE-1.']);
    expect(await refusal([{sku:'GLV-N8-L-1000',qty:1}])).toEqual([422,'GLV-N8-L-1000 isn\'t on your list. Ask for it in the chat to add it.']);
    expect(await refusal([{sku:'HCS-12-13-2G8',qty:1},{sku:'hcs-12-13-2g8',qty:2}])).toEqual([422,'HCS-12-13-2G8 is on the request twice.']);
    expect(await refusal([])).toEqual([422,'Your list is empty: keep at least one item.']);
  });

  it('refuses an unknown branch or fulfillment, and a body that is not a request',async()=>{
    const {requestQuote}=await services();
    const {id}=await popupConversation();
    await expect(requestQuote(DANA,body(id,{branch_id:'boise'}),OPTIONS)).rejects.toThrow('Choose a branch: SLC, Ogden, Provo.');
    await expect(requestQuote(DANA,body(id,{fulfillment:'drone' as never}),OPTIONS)).rejects.toThrow('Choose pickup or delivery.');
    for(const bad of [null,'x',[],{}])await expect(requestQuote(DANA,bad,OPTIONS)).rejects.toThrow(/incomplete|Choose|empty/);
  });

  it("refuses another customer's conversation as not found, and a chat with no pop-up",async()=>{
    const {requestQuote,createConversation}=await services();
    const {ask}=await import('@/server/pipeline');
    const {id}=await popupConversation();
    await expect(requestQuote({customerId:'great-basin',contactId:null},body(id),OPTIONS)).rejects.toThrow(expect.objectContaining({status:404,message:'Conversation not found.'}));
    await expect(requestQuote(DANA,body('no-such-chat'),OPTIONS)).rejects.toThrow(expect.objectContaining({status:404}));
    await ask('wasatch','no-popup','Do you have 1/2 in grade 8 hex bolts in stock?',{contactId:'dana'});
    await expect(requestQuote(DANA,body('no-popup'),OPTIONS)).rejects.toThrow(expect.objectContaining({status:409,message:'There is no item list to quote in this chat. Ask for the items first.'}));
    createConversation({id:'empty-chat',customerId:'wasatch'});
    await expect(requestQuote(DANA,body('empty-chat'),OPTIONS)).rejects.toThrow(expect.objectContaining({status:409}));
  });

  it('refuses delivery without a ship-to on file, writing nothing',async()=>{
    const {requestQuote,createConversation,addMessage,quotes}=await services();
    createConversation({id:'great-basin-chat',customerId:'great-basin'});
    addMessage('great-basin','great-basin-chat',{role:'assistant',kind:'item_popup',content:'Here is your list.',payload:{fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:1}]}});
    const who={customerId:'great-basin',contactId:null};
    const request={conversation_id:'great-basin-chat',fulfillment:'delivery' as const,branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:1}]};
    await expect(requestQuote(who,request,OPTIONS)).rejects.toThrow(expect.objectContaining({status:422,message:'We have no delivery address on file for your account. Choose pickup, or ask Brandi to add one.'}));
    expect(quotes({customerId:'great-basin'})).toEqual([]);
    // Pickup needs no address.
    expect((await requestQuote(who,{...request,fulfillment:'will_call'},OPTIONS)).quote.status).toBe('ready_for_review');
  });

  it('quotes a pop-up opened before Items & stock was turned off',async()=>{
    const {requestQuote,setAccess}=await services();
    const {id}=await popupConversation();
    setAccess('wasatch','items_stock',false);
    expect((await requestQuote(DANA,body(id),OPTIONS)).quote.status).toBe('ready_for_review');
  });
});
