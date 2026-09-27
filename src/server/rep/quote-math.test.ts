import {describe,expect,it} from 'vitest';
import {FLOORS,ITEMS,SAMPLE_LINES,detailLine,sampleDetail} from '@/components/rep/quote-detail/test-fixtures';
import {
  BAR_MAX_MARGIN,blendedFloor,lineFigures,linePricing,liveFreight,onQuerentPick,parseMoney,parseQty,priceForMargin,quoteChecks,quoteFigures,shortName,withBasis,withPrice,withQty,
} from './quote-math';

// The quote detail's math (task 3.3; spec §4, §5.1, §5.2): the per-line dropdown and floor
// status, the edits the grid makes, the totals and summary card, and "things to check".

const ctx={repId:'brandi',repName:'Brandi Gallegos',floors:FLOORS};
const [bolts,wheels,gloves,straps]=SAMPLE_LINES;
const detail=sampleDetail();
const figures=(lines=SAMPLE_LINES,d=detail)=>quoteFigures(lines,{freight:d.freight,rates:d.delivery_rates,branchCode:'SLC',floor:ctx});

describe('line pricing: the price-basis dropdown and Querent’s pick',()=>{
  it('lists Contract / Customer / List / Last paid / Custom with each $ value, and bolds Querent’s pick',()=>{
    const {options,suggestion}=linePricing(bolts)!;
    expect(options.map(o=>[o.label,o.price,o.available,o.suggested])).toEqual([
      ['Contract',null,false,false],['Customer',30.95,true,false],['List',38.95,true,false],['Last paid',31.5,true,true],['Custom',null,true,false],
    ]);
    expect(suggestion).toMatchObject({basis:'last_paid',price:31.5,gpVsCustomer:5.5});
    expect(linePricing(wheels)!.options.find(o=>o.suggested)).toMatchObject({basis:'contract',price:36,note:'WAS-C-2026-01'});
  });

  it('knows whether the line still sits on Querent’s pick',()=>{
    expect(SAMPLE_LINES.every(onQuerentPick)).toBe(true);
    expect(onQuerentPick({...bolts,unit_price:30,price_basis:'custom'})).toBe(false);
    expect(onQuerentPick({...bolts,unit_price:null,price_basis:null,suggested_price:null,suggested_basis:null})).toBe(false);
  });
});

describe('edits',()=>{
  it('switching the basis takes that option’s price; a basis with no price is refused',()=>{
    expect(withBasis(bolts,'list')).toMatchObject({unit_price:38.95,price_basis:'list'});
    expect(withBasis(bolts,'customer')).toMatchObject({unit_price:30.95,price_basis:'customer'});
    expect(withBasis(bolts,'contract')).toBeNull();
    expect(withBasis(straps,'last_paid')).toBeNull();
    // Custom keeps the price the line has.
    expect(withBasis(bolts,'custom')).toMatchObject({unit_price:31.5,price_basis:'custom'});
  });

  it('a typed price is Custom, rounded to the cent, unless it is the current basis’s own price',()=>{
    expect(withPrice(bolts,22)).toMatchObject({unit_price:22,price_basis:'custom'});
    expect(withPrice(bolts,31.504)).toMatchObject({unit_price:31.5,price_basis:'last_paid'});
    expect(withPrice(bolts,30.95)).toMatchObject({unit_price:30.95,price_basis:'custom'});
  });

  it('a margin the rep types becomes the price that earns it on the cost',()=>{
    expect(priceForMargin(21.4,33)).toBe(31.94);
    expect(priceForMargin(58,0)).toBe(58);
    expect(priceForMargin(10,-10)).toBe(9.09);
    expect(priceForMargin(58,100)).toBeNull();
    expect(priceForMargin(58,Number.NaN)).toBeNull();
  });

  it('a qty change re-picks Querent’s price, and the line follows it only while it sat on the pick',()=>{
    // 5 boxes is a broken case (10 to a case): Querent's pick moves to list, and the line follows.
    const broken=withQty(bolts,5);
    expect(broken).toMatchObject({qty:5,unit_price:38.95,price_basis:'list',suggested_price:38.95,suggested_basis:'list'});
    expect(broken.explanation).toMatch(/^Broken-case quantity: 5 is less than a full case of 10/);
    // Back to a full case: back to last paid.
    expect(withQty(broken,10)).toMatchObject({unit_price:31.5,price_basis:'last_paid'});
    // A price the rep chose stays; only the bold pick moves.
    const custom=withPrice(bolts,33);
    expect(withQty(custom,5)).toMatchObject({qty:5,unit_price:33,price_basis:'custom',suggested_basis:'list'});
    // A contract is binding at any qty.
    expect(withQty(wheels,1)).toMatchObject({unit_price:36,price_basis:'contract'});
  });

  it('parses what the rep types: whole quantities from 0, prices in dollars and cents from $0',()=>{
    expect(parseQty('12')).toBe(12);
    expect(parseQty(' 0 ')).toBe(0);
    for(const bad of ['','-1','2.5','abc','1e9'])expect(parseQty(bad)).toBeNull();
    expect(parseMoney('31.95')).toBe(31.95);
    expect(parseMoney('$1,109.5')).toBe(1109.5);
    expect(parseMoney('0')).toBe(0);
    expect(parseMoney('31.955')).toBe(31.96);
    for(const bad of ['','-3','abc','1.2.3','Infinity'])expect(parseMoney(bad)).toBeNull();
  });
});

describe('line figures: total, margin and the floor warning',()=>{
  it('matches the warning to the margin shown (formatMargin), against floor[Brandi][category]',()=>{
    const g=lineFigures(gloves,ctx);
    expect(g).toMatchObject({total:316,marginLabel:'26.6%'});
    expect(g.floor).toMatchObject({belowFloor:true,label:'Below Brandi\'s 30% Safety & PPE floor'});
    expect(lineFigures(bolts,ctx).floor.label).toBeNull();
    // 20.0% shown is not below a 20% floor, even when the unrounded margin is 19.97%.
    const edge=withPrice(bolts,26.74);
    expect(lineFigures(edge,ctx)).toMatchObject({marginLabel:'20.0%',floor:{belowFloor:false}});
    const below=withPrice(bolts,22);
    expect(lineFigures(below,ctx)).toMatchObject({total:220,marginLabel:'2.7%',floor:{label:'Below Brandi\'s 20% Fasteners floor'}});
  });

  it('shows stock at the quote branch, and how short it is',()=>{
    expect(lineFigures(bolts,ctx).stock).toMatchObject({branchCode:'SLC',available:64,short:0});
    expect(lineFigures(straps,ctx).stock).toMatchObject({branchCode:'SLC',available:7,short:5,onOrder:24,nextReceipt:'2026-09-26'});
  });

  it('an unpriced line has no total and no margin, and is not below floor',()=>{
    const unpriced={...bolts,unit_price:null,price_basis:null};
    expect(lineFigures(unpriced,ctx)).toMatchObject({total:null,margin:null,marginLabel:'—',floor:{belowFloor:false}});
  });
});

describe('quote figures: totals and the summary card',()=>{
  it('totals the seeded sample: items $1,122.40, will call $0, GP $361.40 at 32.2%',()=>{
    const f=figures();
    expect(f).toMatchObject({items:1122.4,cost:761,gp:361.4,marginLabel:'32.2%',total:1122.4,belowFloorLines:1});
    expect(f.freight).toMatchObject({amount:0,label:'Freight (will call)',callForFreight:false});
  });

  it('sums line totals to the cent, and leaves unpriced lines out of items, cost and margin',()=>{
    const lines=[withQty(withPrice(bolts,0.1),3),{...straps,unit_price:null,price_basis:null}];
    const f=figures(lines);
    expect(f.items).toBe(0.3);
    expect(f.cost).toBe(64.2);
    expect(f.total).toBe(0.3);
    expect(figures([]).margin).toBeNull();
    expect(figures([]).total).toBe(0);
  });

  it('adds delivery freight, re-priced live as the items subtotal crosses the free threshold',()=>{
    const delivery=sampleDetail({freight:{computed:{rule:'distance',amount:62.5,miles:15,formula:'$25.00 + $2.50/mi × 15.0 mi = $62.50',explanation:''},override:null,amount:62.5,source:'computed',unresolved:false}});
    const f=figures(SAMPLE_LINES,delivery);
    expect(f.freight).toMatchObject({amount:62.5,label:'Freight (15.0 mi)'});
    expect(f.total).toBe(1184.9);
    // Over $1,500 of items: free delivery, without waiting for the server.
    const big=figures([...SAMPLE_LINES,withQty(bolts,20)],delivery);
    expect(big.freight.amount).toBe(0);
  });

  it('shows call for freight with no total, and a rep override as set',()=>{
    const call=sampleDetail({freight:{computed:{rule:'beyond_radius',amount:'call_for_freight',miles:92,formula:null,explanation:''},override:null,amount:'call_for_freight',source:'computed',unresolved:true}});
    expect(figures(SAMPLE_LINES,call)).toMatchObject({total:null,freight:{amount:null,callForFreight:true}});
    const override=sampleDetail({freight:{computed:call.freight.computed,override:{amount:140,reason:'LTL quote'},amount:140,source:'override',unresolved:false}});
    expect(liveFreight(override.freight,1122.4,override.delivery_rates,'SLC')).toBe(140);
    expect(figures(SAMPLE_LINES,override)).toMatchObject({total:1262.4,freight:{label:'Freight (set by rep)'}});
  });

  it('blends the floor marker by revenue: each line’s floor weighted by its total',()=>{
    // (315×20% + 216×25% + 316×30% + 275.40×20%) / 1,122.40 = 23.78%
    const floor=blendedFloor(SAMPLE_LINES,ctx);
    expect(floor.value).toBeCloseTo(0.23778,4);
    expect(floor).toMatchObject({uniform:false,label:'23.8%'});
    // One floor for every line reads as that floor.
    expect(blendedFloor([bolts,straps],ctx)).toMatchObject({value:0.2,uniform:true,label:'20%'});
    expect(blendedFloor([],ctx)).toMatchObject({value:null});
    const f=figures();
    expect(f.belowFloor).toBe(false);
    expect(f.bar.width).toBeCloseTo(0.322/BAR_MAX_MARGIN*100,0);
    expect(f.bar.marker).toBeCloseTo(0.2378/BAR_MAX_MARGIN*100,0);
    // Price everything at cost: the quote is under its blended floor.
    expect(figures(SAMPLE_LINES.map(l=>withPrice(l,l.unit_cost))).belowFloor).toBe(true);
  });

  it('compares with what they paid last time, over lines with a last-paid price only',()=>{
    expect(figures().lift).toBe(0);
    expect(figures([withPrice(bolts,31.95),wheels,gloves,straps]).lift).toBe(4.5);
    expect(figures([withPrice(gloves,78)]).lift).toBe(-4);
    expect(figures([straps]).lift).toBeNull();
  });

  it('says what Querent found: GP its picks add over customer price (contract lines add nothing)',()=>{
    expect(figures()).toMatchObject({querentFound:11.5,querentFoundLabel:'Querent found +$11.50 GP'});
  });
});

describe('things to check before sending',()=>{
  const quote={fulfillment:'will_call' as const,ship_to_address:null};
  it('lists the sample’s below-floor gloves and the straps short at SLC, in line order',()=>{
    const checks=quoteChecks(SAMPLE_LINES,quote,false,ctx);
    expect(checks.map(c=>[c.kind,c.lineId,c.subject,c.text])).toEqual([
      ['margin','q-24817-3','Nitrile disposable gloves','26.6% margin, below Brandi\'s 30% Safety & PPE floor'],
      ['stock','q-24817-4','Ratchet strap 2 in x 27 ft','short 5 at SLC. 20 at Ogden. 24 on order at SLC, due Sep 26'],
    ]);
  });

  it('puts send blockers first (sendBlockers), and flags a weak match',()=>{
    const lines=[withQty(bolts,0),{...straps,unit_price:null,price_basis:null,match_score:0.6}];
    const checks=quoteChecks(lines,{fulfillment:'delivery',ship_to_address:''},true,ctx);
    expect(checks.map(c=>c.kind)).toEqual(['blocker','blocker','blocker','blocker','stock','match']);
    expect(checks[0]).toMatchObject({lineId:'q-24817-1',text:'Line 1 (HCS-12-13-2G8) has a quantity of 0.'});
    expect(checks.at(-1)).toMatchObject({subject:'Ratchet strap 2 in x 27 ft',text:'confirm the match for “2 in ratchet straps, maybe 12 (then: 27 ft with J-hooks)”'});
    expect(quoteChecks([],quote,false,ctx).map(c=>c.text)).toEqual(['The quote has no lines.']);
  });
});

it('shortens an item to its name before the first comma',()=>{
  expect(shortName(ITEMS.bolts.description)).toBe('Hex cap screw 1/2-13 x 2 in');
  expect(shortName('Duct tape')).toBe('Duct tape');
});

it('builds fixture lines the way the seed prices them',()=>{
  expect(detailLine(ITEMS.discs,{n:5,qty:1,unit_price:52.5,price_basis:'list'}).pricing?.sources.case_qty).toBe(5);
});
