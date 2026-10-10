import {afterEach,describe,expect,it,vi} from 'vitest';
import type {ItemPopupPayload} from '@/domain';
import {SEED_DATE,useSeededDatabase} from '@/server/repository/test-db';
import type {PoolFacts,PoolItem,SuggestionPicker} from './suggestions';

useSeededDatabase();

// "Frequently bought together" in the item pop-up (decision 37, spec §10, task E1): a cost-free pool
// from the companion rules (in the catalog, in stock at the branch, not in the cart), the LLM's picks
// validated against it (scripted mode picks deterministically), and a payload with no prices or cost.

const BOLT={id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',case_qty:10};
const NUT={id:'HN-12-13-G8',sku:'HN-12-13-G8',description:'Hex nut 1/2-13, Grade 8, yellow zinc',pack:'Box of 100',case_qty:10};
const WASHER={id:'FW-12-G8',sku:'FW-12-G8',description:'Flat washer 1/2 in, Grade 8, yellow zinc',pack:'Box of 100',case_qty:10};
const WHEEL={id:'CW-45-045-T1',sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',case_qty:4};
const DISC={id:'FD-45-60Z',sku:'FD-45-60Z',description:'Flap disc 4.5 in, 60 grit zirconia',pack:'Box of 10',case_qty:5};
const GLOVES={id:'GLV-1',sku:'GLV-1',description:'Nitrile gloves, size L',pack:'Box of 100',case_qty:10};

/** Bolts and wheels in the cart; the wheels were bought with flap discs on 3 of 4 orders, and with gloves on 1 (below the threshold). */
const facts=(over:Partial<PoolFacts>={}):PoolFacts=>({
  cart:[{item_id:'HCS-12-13-2G8',qty:10},{item_id:'CW-45-045-T1',qty:6}],
  catalog:[BOLT,NUT,WASHER,WHEEL,DISC,GLOVES],
  purchased:[{item_id:'CW-45-045-T1',order_count:4,last_qty:6},{item_id:'FD-45-60Z',order_count:3,last_qty:2}],
  coPurchases:{'CW-45-045-T1':[{item_id:'FD-45-60Z',orders_together:3},{item_id:'GLV-1',orders_together:1}]},
  available:{'HN-12-13-G8':75,'FW-12-G8':60,'FD-45-60Z':52,'GLV-1':10},
  ...over,
});
const POPUP:ItemPopupPayload={fulfillment:'will_call',branch_id:'slc',lines:[
  {sku:'HCS-12-13-2G8',qty:10,requested_text:'10 boxes of the 1/2 in grade 8 hex bolts'},{sku:'CW-45-045-T1',qty:6,requested_text:'6 boxes of cut-off wheels'}]};

/** Every key at any depth. */
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];
const PRICE_OR_COST=/price|cost|margin|floor|basis|gp|profit|amount|total|discount/i;
const setAccess=async(category:'items_stock'|'orders_quotes',enabled:boolean)=>(await import('@/server/repository')).setAccess('wasatch',category,enabled);
afterEach(async()=>{await setAccess('items_stock',true);await setAccess('orders_quotes',true);});

describe('buildPool (the candidate pool)',()=>{
  it('takes the matching nut and washer and the items bought together, as identity and cost-free evidence only',async()=>{
    const {buildPool}=await import('./suggestions');
    const pool=buildPool(facts());
    expect(pool.map(p=>[p.sku,p.kind])).toEqual([['HN-12-13-G8','matching_fastener'],['FW-12-G8','matching_fastener'],['FD-45-60Z','bought_together']]);
    expect(pool[0]).toEqual({item_id:'HN-12-13-G8',sku:'HN-12-13-G8',description:NUT.description,pack:'Box of 100',kind:'matching_fastener',
      anchor:{sku:'HCS-12-13-2G8',description:BOLT.description},part:'nut',bolt:{diameter:'1/2',thread:'13',grade:'8'},history:null});
    expect(pool[2]).toMatchObject({kind:'bought_together',anchor:{sku:'CW-45-045-T1'},history:{orders_together:3,anchor_orders:4}});
    // Gloves: 1 order together is below the bought-together threshold. Full-case bumps are not new items.
    expect(pool.some(p=>p.sku==='GLV-1'||p.sku==='CW-45-045-T1')).toBe(false);
  });

  it('keeps only items in stock at the chosen branch (an item with no stock row counts as none)',async()=>{
    const {buildPool}=await import('./suggestions');
    expect(buildPool(facts({available:{'HN-12-13-G8':0,'FW-12-G8':60}})).map(p=>p.sku)).toEqual(['FW-12-G8']);
  });

  it('never suggests an item already in the cart',async()=>{
    const {buildPool}=await import('./suggestions');
    const cart=[...facts().cart,{item_id:'HN-12-13-G8',qty:1},{item_id:'FD-45-60Z',qty:1}];
    expect(buildPool(facts({cart})).map(p=>p.sku)).toEqual(['FW-12-G8']);
  });

  it('suggests only catalog items: history pointing at an item no longer in the catalog is ignored',async()=>{
    const {buildPool}=await import('./suggestions');
    const pool=buildPool(facts({catalog:[BOLT,NUT,WASHER,WHEEL],available:{'HN-12-13-G8':75,'FW-12-G8':60,'FD-45-60Z':52}}));
    expect(pool.map(p=>p.sku)).toEqual(['HN-12-13-G8','FW-12-G8']);
  });

  it('carries no price, cost or quantity-based field',async()=>{
    const {buildPool}=await import('./suggestions');
    expect(keys(buildPool(facts())).filter(k=>PRICE_OR_COST.test(k))).toEqual([]);
  });
});

describe('templateReason (scripted wording, in the chip style)',()=>{
  it('names the bolts a part matches, and how often an item was bought with a cart item',async()=>{
    const {buildPool,templateReason}=await import('./suggestions');
    const [nut,washer,disc]=buildPool(facts());
    expect(templateReason(nut)).toBe('Matches the 1/2-13 Grade 8 bolts on your list.');
    expect(templateReason(washer)).toBe('Matches the 1/2-13 Grade 8 bolts on your list.');
    expect(templateReason(disc)).toBe('Bought with cut-off wheels on 3 of your 4 orders that had them in the last 12 months.');
    expect(templateReason({...disc,history:{orders_together:4,anchor_orders:4}})).toBe('Bought with cut-off wheels on all 4 of your orders that had them in the last 12 months.');
    expect(templateReason({...nut,history:{orders_together:5,anchor_orders:5}})).toBe('Matches the 1/2-13 Grade 8 bolts on your list. Bought with these bolts on all 5 of your orders that had them in the last 12 months.');
  });
});

describe('validatePicks (the model can never introduce a SKU)',()=>{
  const pool=async()=>(await import('./suggestions')).buildPool(facts());

  it('keeps the picks that are in the pool, in the model\'s order, with its reasons; drops invented SKUs and repeats',async()=>{
    const {validatePicks}=await import('./suggestions');
    const picked=validatePicks(await pool(),[
      {sku:'FD-45-60Z',reason:'Flap discs finish the cuts the wheels make.'},
      {sku:'MADE-UP-1',reason:'Invented.'},
      {sku:'fd-45-60z',reason:'Again, in lower case.'},
      {sku:'HN-12-13-G8',reason:'The nut for these bolts.'},
    ]);
    expect(picked).toEqual([
      {item_id:'FD-45-60Z',sku:'FD-45-60Z',description:DISC.description,pack:'Box of 10',reason:'Flap discs finish the cuts the wheels make.'},
      {item_id:'HN-12-13-G8',sku:'HN-12-13-G8',description:NUT.description,pack:'Box of 100',reason:'The nut for these bolts.'},
    ]);
  });

  it('replaces a reason that is empty, too long, multi-line or about money with the template',async()=>{
    const {validatePicks,templateReason}=await import('./suggestions');
    const p=await pool();
    for(const reason of ['',' ','x'.repeat(201),'Line one.\nLine two.','Save 10% when you add these.','Only $4 more.','Better price than elsewhere.',42,null])
      expect(validatePicks(p,[{sku:'HN-12-13-G8',reason},{sku:'FW-12-G8',reason:'Fine.'}])[0].reason).toBe(templateReason(p[0]));
  });

  it('shows at most 3 (OA-23), and tops up from the pool to 2 when the model picks fewer',async()=>{
    const {validatePicks}=await import('./suggestions');
    const p=await pool();
    const four=[...p,{...p[0],item_id:'X',sku:'X'}] as PoolItem[];
    expect(validatePicks(four,four.map(i=>({sku:i.sku,reason:'Goes with it.'})))).toHaveLength(3);
    expect(validatePicks(p,[{sku:'FD-45-60Z',reason:'Goes with the wheels.'}]).map(s=>s.sku)).toEqual(['FD-45-60Z','HN-12-13-G8']);
    expect(validatePicks(p,[{sku:'NOPE'}]).map(s=>s.sku)).toEqual(['HN-12-13-G8','FW-12-G8']);
    expect(validatePicks(p,'not a list' as unknown as [])).toHaveLength(2);
    // Fewer than 2 candidates: show what exists.
    expect(validatePicks(p.slice(0,1),[])).toHaveLength(1);
    expect(validatePicks([],[{sku:'HN-12-13-G8'}])).toEqual([]);
  });
});

describe('popupSuggestions against the seed (Dana, bolts and Type 1 wheels, pickup at SLC)',()=>{
  it('scripted mode: the first three from the pool with template reasons, the same every time',async()=>{
    const {popupSuggestions}=await import('./suggestions');
    const first=await popupSuggestions('wasatch',POPUP,{picker:null,on:SEED_DATE});
    expect(first.map(s=>s.sku)).toEqual(['HN-12-13-G8','FW-12-G8','FD-45-60Z']);
    expect(first[0]).toEqual({item_id:'HN-12-13-G8',sku:'HN-12-13-G8',description:NUT.description,pack:'Box of 100',reason:expect.stringMatching(/^Matches the 1\/2-13 Grade 8 bolts on your list\./)});
    expect(await popupSuggestions('wasatch',POPUP,{picker:null,on:SEED_DATE})).toEqual(first);
    expect([...new Set(keys(first))].sort()).toEqual(['description','item_id','pack','reason','sku']);
    expect(JSON.stringify(first)).not.toMatch(/\$|\d+\.\d\d/);
  });

  it('live mode: the picker sees only cost-free facts, and only its picks that are in the pool are kept',async()=>{
    const {popupSuggestions}=await import('./suggestions');
    const picker=vi.fn<SuggestionPicker>(async()=>[{sku:'FD-45-60Z',reason:'Flap discs clean up the cuts.'},{sku:'ZZ-INVENTED',reason:'Not real.'},{sku:'FW-12-G8',reason:'Washers for the bolts.'}]);
    const picked=await popupSuggestions('wasatch',POPUP,{picker,on:SEED_DATE});
    expect(picked.map(s=>[s.sku,s.reason])).toEqual([['FD-45-60Z','Flap discs clean up the cuts.'],['FW-12-G8','Washers for the bolts.']]);
    const [input]=picker.mock.calls[0];
    expect(input.cart.map(l=>[l.sku,l.qty])).toEqual([['HCS-12-13-2G8',10],['CW-45-045-T1',6]]);
    expect(input.candidates.map(c=>c.sku)).toEqual(['HN-12-13-G8','FW-12-G8','FD-45-60Z']);
    expect(input.candidates[0].template_reason).toMatch(/^Matches the/);
    expect(keys(input).filter(k=>PRICE_OR_COST.test(k))).toEqual([]);
  });

  it('falls back to the scripted picks when the picker fails',async()=>{
    const {popupSuggestions}=await import('./suggestions');
    const scripted=await popupSuggestions('wasatch',POPUP,{picker:null,on:SEED_DATE});
    expect(await popupSuggestions('wasatch',POPUP,{picker:async()=>{throw new Error('timeout');},on:SEED_DATE})).toEqual(scripted);
  });

  it('respects the customer\'s access: no order history without Orders & quotes, nothing without Items & stock',async()=>{
    const {popupSuggestions}=await import('./suggestions');
    await setAccess('orders_quotes',false);
    expect((await popupSuggestions('wasatch',POPUP,{picker:null,on:SEED_DATE})).map(s=>s.sku)).toEqual(['HN-12-13-G8','FW-12-G8']);
    await setAccess('items_stock',false);
    expect(await popupSuggestions('wasatch',POPUP,{picker:null,on:SEED_DATE})).toEqual([]);
  });

  it('leaves out what is already in the cart, and asks the picker nothing when the pool is empty',async()=>{
    const {popupSuggestions}=await import('./suggestions');
    const lines=[...POPUP.lines,{sku:'HN-12-13-G8',qty:5},{sku:'FW-12-G8',qty:5},{sku:'FD-45-60Z',qty:1}];
    const picker=vi.fn<SuggestionPicker>(async()=>[]);
    expect(await popupSuggestions('wasatch',{...POPUP,lines},{picker,on:SEED_DATE})).toEqual([]);
    expect(picker).not.toHaveBeenCalled();
  });

  it('withSuggestions records the suggestions and how many were offered on the pop-up payload (OA-13)',async()=>{
    const {withSuggestions}=await import('./suggestions');
    const payload=await withSuggestions('wasatch',POPUP,{picker:null,on:SEED_DATE});
    expect(payload).toEqual({...POPUP,suggestions:expect.any(Array),suggestions_offered:3});
    expect(payload.suggestions!.map(s=>s.sku)).toEqual(['HN-12-13-G8','FW-12-G8','FD-45-60Z']);
    expect(keys(payload).filter(k=>PRICE_OR_COST.test(k))).toEqual([]);
  });
});
