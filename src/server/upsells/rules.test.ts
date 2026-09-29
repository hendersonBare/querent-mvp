import {describe,expect,it} from 'vitest';
import {DEFAULT_UPSELL_OPTIONS,formatUpsellSummary,suggestUpsells,upsellGpTotal,type UpsellFacts,type UpsellItem,type UpsellLine,type UpsellPrice,type UpsellPriceRequest} from './rules';

// Pure rule tests (spec §5.5, §7.2) over the seeded catalog, with a stub pricer standing in for
// task 1.1 (./service.test.ts runs the real engine). The stub prices at the seed's customer price
// unless a test says otherwise, so each GP figure is easy to check by hand.

/** Seed catalog rows (src/server/db/seed/catalog.ts): [sku, description, pack, case qty, cost, list, customer price]. */
const ROWS:[string,string,string,number,number,number,number][]=[
  ['HCS-12-13-2G8','Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc','Box of 50',10,21.40,38.95,30.95],
  ['HCS-12-13-2G5','Hex cap screw 1/2-13 x 2 in, Grade 5, zinc plated','Box of 50',10,14.60,26.50,21.95],
  ['HCS-12-13-3G8','Hex cap screw 1/2-13 x 3 in, Grade 8, yellow zinc','Box of 25',10,17.80,32.40,26.25],
  ['HCS-38-16-1G5','Hex cap screw 3/8-16 x 1 in, Grade 5, zinc plated','Box of 100',10,9.40,17.25,14.10],
  ['HCS-58-11-3G8','Hex cap screw 5/8-11 x 3 in, Grade 8, yellow zinc','Box of 25',5,27.50,49.80,40.25],
  ['HN-12-13-G8','Hex nut 1/2-13, Grade 8, yellow zinc','Box of 100',10,9.80,19.95,16.50],
  ['HN-12-13-G5','Hex nut 1/2-13, Grade 5, zinc plated','Box of 100',10,6.90,13.40,11.25],
  ['HN-38-16-G5','Hex nut 3/8-16, Grade 5, zinc plated','Box of 100',10,4.20,8.60,7.10],
  ['FW-12-G8','Flat washer 1/2 in, Grade 8, yellow zinc','Box of 100',10,7.40,15.75,12.95],
  ['FW-12-SAE','Flat washer 1/2 in, SAE, zinc plated','Box of 100',10,4.10,8.25,6.95],
  ['LW-12-ZP','Split lock washer 1/2 in, zinc plated','Box of 100',10,3.60,7.40,6.10],
  ['TEK-12-1-HWH','Self-drilling screw #12 x 1 in, hex washer head','Box of 250',8,11.20,21.90,17.80],
  ['CW-45-045-T1','Cut-off wheel 4.5 x .045 x 7/8 in, Type 1','Box of 25',4,24.10,46.00,38.95],
  ['FD-45-60Z','Flap disc 4.5 in, 60 grit zirconia','Box of 10',4,31.00,56.95,47.50],
  ['FD-45-80Z','Flap disc 4.5 in, 80 grit zirconia','Box of 10',4,31.00,56.95,47.50],
  ['GLV-N8-L-1000','Nitrile disposable gloves, 8 mil, black, size L','Case of 1,000',1,58.00,94.00,77.50],
  ['SG-CLR-AF','Safety glasses, clear anti-fog','Box of 12',1,18.20,36.00,29.90],
  ['RS-2-27-JH','Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks','Each',10,14.20,28.50,22.95],
];
const ITEMS:UpsellItem[]=ROWS.map(([sku,description,pack,case_qty,cost])=>({id:sku,sku,description,pack,case_qty,cost}));
const catalogItem=(sku:string)=>{const row=ROWS.find(r=>r[0]===sku)!;return {caseQty:row[3],cost:row[4],list:row[5],customer:row[6]};};
const customerPrice=(itemId:string)=>catalogItem(itemId).customer;

type PriceFn=(itemId:string,qty:number)=>UpsellPrice|null;
function pricer(fn:PriceFn=id=>({price:customerPrice(id),basis:'customer'})){
  const calls:UpsellPriceRequest[][]=[];
  const price=(lines:readonly UpsellPriceRequest[])=>{calls.push([...lines]);return lines.map(l=>fn(l.itemId,l.qty));};
  return Object.assign(price,{calls});
}

let lineNo=0;
/** A quote line at Querent's stub price (customer price) unless given one. */
function line(sku:string,qty:number,unitPrice:number|null=customerPrice(sku)):UpsellLine{
  return {id:`L${++lineNo}-${sku}`,item_id:sku,qty,unit_price:unitPrice,unit_cost:catalogItem(sku).cost};
}

function facts(lines:UpsellLine[],more:Partial<UpsellFacts>={}):UpsellFacts{
  return {lines,catalog:ITEMS,purchased:[],coPurchases:{},price:pricer(),...more};
}
const run=(lines:UpsellLine[],more:Partial<UpsellFacts>={})=>suggestUpsells(facts(lines,more));
const skus=(upsells:ReturnType<typeof suggestUpsells>)=>upsells.map(u=>u.id);
const fastenersOnly=(upsells:ReturnType<typeof suggestUpsells>)=>upsells.filter(u=>u.kind==='matching_fastener');
const gp=(price:number,cost:number,qty:number)=>Math.round((Math.round(price*100)-Math.round(cost*100))*qty)/100;

describe('matching fasteners (bolt -> nut + washer of the same size and grade)',()=>{
  it('suggests the Grade 8 nut and washer for Grade 8 bolts, sized to the bolt count',()=>{
    const bolts=line('HCS-12-13-2G8',10);
    const [nut,washer]=run([bolts]);
    expect(nut).toMatchObject({id:'matching_fastener:HN-12-13-G8',kind:'matching_fastener',qty:5,action:{type:'add_line',item_id:'HN-12-13-G8',qty:5},
      unit_price:16.5,price_basis:'customer',unit_cost:9.8,gp_gain:33.5,anchor:{line_id:bolts.id,item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8'},
      evidence:{part:'nut',bolt:{diameter:'1/2',thread:'13',grade:'8'},bolt_pieces:500,pack_pieces:100,history:null}});
    expect(washer).toMatchObject({id:'matching_fastener:FW-12-G8',qty:5,unit_price:12.95,gp_gain:gp(12.95,7.4,5),evidence:{part:'washer',bolt_pieces:500,pack_pieces:100}});
  });

  it('rounds the part qty up to whole packs',()=>{
    // 7 boxes of 50 = 350 bolts -> 4 boxes of 100 nuts.
    expect(fastenersOnly(run([line('HCS-12-13-2G8',7)])).map(u=>[u.item.sku,u.qty])).toEqual([['HN-12-13-G8',4],['FW-12-G8',4]]);
  });

  it('suggests only the nut when the catalog has no washer of that grade (Grade 5: SAE washers do not count)',()=>{
    expect(skus(run([line('HCS-12-13-2G5',10)]))).toEqual(['matching_fastener:HN-12-13-G5']);
    expect(skus(run([line('HCS-38-16-1G5',10)]))).toEqual(['matching_fastener:HN-38-16-G5']);
  });

  it('suggests nothing when the catalog has no matching nut or washer',()=>{
    expect(run([line('HCS-58-11-3G8',5)])).toEqual([]);
  });

  it('never suggests a part already on the quote',()=>{
    expect(skus(run([line('HCS-12-13-2G8',10),line('HN-12-13-G8',10)]))).toEqual(['matching_fastener:FW-12-G8']);
    expect(run([line('HCS-12-13-2G8',10),line('HN-12-13-G8',10),line('FW-12-G8',10)])).toEqual([]);
  });

  it('skips a part when the quote already has one of that size in another grade or style',()=>{
    expect(skus(run([line('HCS-12-13-2G8',10),line('HN-12-13-G5',10)]))).toEqual(['matching_fastener:FW-12-G8']);
    expect(skus(run([line('HCS-12-13-2G8',10),line('LW-12-ZP',10)]))).toEqual(['matching_fastener:HN-12-13-G8']);
  });

  it('gives one chip per part when several bolt lines match it, covering all of them, anchored on the first',()=>{
    const two=line('HCS-12-13-2G8',10),three=line('HCS-12-13-3G8',4);
    const upsells=fastenersOnly(run([two,three]));
    // 10 boxes of 50 + 4 boxes of 25 = 600 bolts -> 6 boxes of 100.
    expect(upsells.map(u=>[u.item.sku,u.qty,u.anchor.line_id,u.evidence])).toEqual([
      ['HN-12-13-G8',6,two.id,{part:'nut',bolt:{diameter:'1/2',thread:'13',grade:'8'},bolt_pieces:600,pack_pieces:100,history:null}],
      ['FW-12-G8',6,two.id,{part:'washer',bolt:{diameter:'1/2',thread:'13',grade:'8'},bolt_pieces:600,pack_pieces:100,history:null}],
    ]);
  });

  it('falls back to the bolt qty when a pack gives no piece count',()=>{
    const catalog=ITEMS.map(i=>i.id==='HCS-12-13-2G8'?{...i,pack:'Bulk box'}:i);
    const [nut]=fastenersOnly(run([line('HCS-12-13-2G8',3)],{catalog}));
    expect(nut).toMatchObject({qty:3,evidence:{bolt_pieces:null,pack_pieces:null}});
  });

  it('ignores a bolt line with no qty',()=>{
    expect(run([line('HCS-12-13-2G8',0)])).toEqual([]);
  });

  it('adds the bought-together history for the same bolt and part when it clears the thresholds',()=>{
    const history={purchased:[{item_id:'HCS-12-13-2G8',order_count:6,last_qty:10},{item_id:'HN-12-13-G8',order_count:6,last_qty:5},{item_id:'FW-12-G8',order_count:5,last_qty:4}],
      coPurchases:{'HCS-12-13-2G8':[{item_id:'HN-12-13-G8',orders_together:6},{item_id:'FW-12-G8',orders_together:5},{item_id:'ANC-12-414-W',orders_together:1}]}};
    const upsells=run([line('HCS-12-13-2G8',10)],history);
    expect(upsells.map(u=>[u.id,u.qty,u.evidence])).toEqual([
      ['matching_fastener:HN-12-13-G8',5,expect.objectContaining({history:{orders_together:6,anchor_orders:6}})],
      ['matching_fastener:FW-12-G8',5,expect.objectContaining({history:{orders_together:5,anchor_orders:6}})],
    ]);
  });
});

describe('full case (bump qty to the next full case)',()=>{
  it('suggests nothing when the qty is already a whole number of cases',()=>{
    expect(run([line('CW-45-045-T1',4)])).toEqual([]);
    expect(run([line('CW-45-045-T1',12)])).toEqual([]);
  });

  it('bumps a qty over one case but not a multiple up to the next full case',()=>{
    const wheels=line('CW-45-045-T1',6,36);
    const [bump]=run([wheels],{price:pricer(()=>({price:36,basis:'contract'}))});
    expect(bump).toMatchObject({id:'full_case:CW-45-045-T1',kind:'full_case',qty:8,action:{type:'set_qty',line_id:wheels.id,item_id:'CW-45-045-T1',from_qty:6,to_qty:8},
      unit_price:36,price_basis:'contract',unit_cost:24.1,gp_gain:23.8,anchor:{line_id:wheels.id},evidence:{case_qty:4,from_qty:6,to_qty:8,cases:2}});
  });

  it('bumps a broken case up to one full case, with GP from Querent\'s price at each qty',()=>{
    // As the engine prices it: a broken case at customer + 10% ($18.15), a full case at customer ($16.50): 10 x 6.70 - 5 x 8.35 = +$25.25.
    const brokenCase:PriceFn=(id,qty)=>qty<catalogItem(id).caseQty?{price:Math.round(customerPrice(id)*110)/100,basis:'custom'}:{price:customerPrice(id),basis:'customer'};
    const [bump]=run([line('HN-12-13-G8',5,18.15)],{price:pricer(brokenCase)});
    expect(bump).toMatchObject({id:'full_case:HN-12-13-G8',qty:10,unit_price:16.5,price_basis:'customer',gp_gain:25.25,evidence:{from_qty:5,to_qty:10,cases:1}});
  });

  it('drops a bump that would lose GP (the full-case price is lower)',()=>{
    // 9 bolts at list $38.95 earn 9 x 17.55 = $157.95; 10 at customer $30.95 earn only $95.50.
    const brokenCase:PriceFn=(id,qty)=>({price:qty<10?catalogItem(id).list:customerPrice(id),basis:null});
    expect(run([line('HCS-12-13-2G5',9,26.5)],{price:pricer(brokenCase)}).filter(u=>u.kind==='full_case')).toEqual([]);
  });

  it('never bumps items sold one to a case',()=>{
    expect(run([line('GLV-N8-L-1000',3)])).toEqual([]);
  });

  it('skips an item on two lines, where the line to bump is unclear',()=>{
    expect(run([line('CW-45-045-T1',6),line('CW-45-045-T1',1)])).toEqual([]);
  });

  it('prices an unpriced line at Querent\'s price for its current qty',()=>{
    const price=pricer();
    const [bump]=run([line('CW-45-045-T1',6,null)],{price});
    expect(bump).toMatchObject({gp_gain:gp(38.95,24.1,2)});
    expect(price.calls).toEqual([[{itemId:'CW-45-045-T1',qty:8},{itemId:'CW-45-045-T1',qty:6}]]);
  });

  it('measures the gain against the rep\'s own price on the line',()=>{
    // The rep typed $30.00; Querent prices 8 at $38.95: 8 x 14.85 - 6 x 5.90 = $83.40.
    expect(run([line('CW-45-045-T1',6,30)])[0]).toMatchObject({qty:8,unit_price:38.95,gp_gain:83.4});
  });

  it('only bumps as far as the quote branch can fill',()=>{
    expect(run([line('RS-2-27-JH',12)],{available:{'RS-2-27-JH':7}})).toEqual([]);
    expect(run([line('RS-2-27-JH',12)],{available:{'RS-2-27-JH':19}})).toEqual([]);
    expect(skus(run([line('RS-2-27-JH',12)],{available:{'RS-2-27-JH':20}}))).toEqual(['full_case:RS-2-27-JH']);
  });
});

describe('bought together (from the customer\'s order history)',()=>{
  const wheels=()=>line('CW-45-045-T1',4);
  const history=(orders:number,together:Record<string,number>,lastQty:Record<string,number>={}):Partial<UpsellFacts>=>({
    purchased:[{item_id:'CW-45-045-T1',order_count:orders,last_qty:4},...Object.keys(together).map(id=>({item_id:id,order_count:together[id],last_qty:lastQty[id]??2}))],
    coPurchases:{'CW-45-045-T1':Object.entries(together).map(([item_id,orders_together])=>({item_id,orders_together}))},
  });

  it('suggests an item bought on most orders with a quote item, at the qty bought last time',()=>{
    const anchor=wheels();
    const [discs]=run([anchor],history(5,{'FD-45-60Z':4},{'FD-45-60Z':3}));
    expect(discs).toMatchObject({id:'bought_together:FD-45-60Z',kind:'bought_together',qty:3,action:{type:'add_line',item_id:'FD-45-60Z',qty:3},
      unit_price:47.5,gp_gain:gp(47.5,31,3),anchor:{line_id:anchor.id,item_id:'CW-45-045-T1'},evidence:{orders_together:4,anchor_orders:5}});
  });

  it('includes an item exactly at the thresholds (2 orders, 50%)',()=>{
    expect(skus(run([wheels()],history(4,{'FD-45-60Z':2})))).toEqual(['bought_together:FD-45-60Z']);
  });

  it('excludes an item below either threshold',()=>{
    expect(run([wheels()],history(2,{'FD-45-60Z':1}))).toEqual([]);
    expect(run([wheels()],history(5,{'FD-45-60Z':2}))).toEqual([]);
  });

  it('takes the thresholds from options',()=>{
    expect(skus(run([wheels()],{...history(5,{'FD-45-60Z':2}),options:{minShare:0.4}}))).toEqual(['bought_together:FD-45-60Z']);
    expect(run([wheels()],{...history(4,{'FD-45-60Z':2}),options:{minOrdersTogether:3}})).toEqual([]);
    expect(DEFAULT_UPSELL_OPTIONS).toEqual({minOrdersTogether:2,minShare:0.5,maxSuggestions:6});
  });

  it('suggests 1 when the item has no purchase summary',()=>{
    const facts=history(4,{'FD-45-60Z':3});
    facts.purchased=facts.purchased!.filter(p=>p.item_id!=='FD-45-60Z');
    expect(run([wheels()],facts)[0]).toMatchObject({qty:1});
  });

  it('never suggests an item already on the quote',()=>{
    expect(run([wheels(),line('FD-45-60Z',4)],history(5,{'FD-45-60Z':4}))).toEqual([]);
  });

  it('keeps both of two items tied on orders together, in a fixed order',()=>{
    const tied=history(5,{'FD-45-80Z':3,'FD-45-60Z':3});
    const flat=pricer(()=>({price:40,basis:'customer'}));
    // Same cost, same price, same qty -> same GP; the SKU breaks the tie.
    expect(skus(run([wheels()],{...tied,price:flat}))).toEqual(['bought_together:FD-45-60Z','bought_together:FD-45-80Z']);
  });

  it('when two quote items point at one item, keeps the one bought with it most often',()=>{
    const bolts=line('HCS-12-13-2G8',10),wheelLine=wheels();
    const facts:Partial<UpsellFacts>={
      purchased:[{item_id:'HCS-12-13-2G8',order_count:6,last_qty:10},{item_id:'CW-45-045-T1',order_count:5,last_qty:4},{item_id:'SG-CLR-AF',order_count:3,last_qty:2}],
      coPurchases:{'HCS-12-13-2G8':[{item_id:'SG-CLR-AF',orders_together:3}],'CW-45-045-T1':[{item_id:'SG-CLR-AF',orders_together:2}]},
    };
    const glasses=(lines:UpsellLine[],f=facts)=>run(lines,f).filter(u=>u.item.sku==='SG-CLR-AF');
    expect(glasses([wheelLine,bolts]).map(u=>[u.anchor.line_id,u.evidence])).toEqual([[bolts.id,{orders_together:3,anchor_orders:6}]]);
    // Tied on orders together: the higher share wins (2 of 3 over 2 of 4).
    const tiedCount={...facts,coPurchases:{'HCS-12-13-2G8':[{item_id:'SG-CLR-AF',orders_together:2}],'CW-45-045-T1':[{item_id:'SG-CLR-AF',orders_together:2}]},
      purchased:[{item_id:'HCS-12-13-2G8',order_count:4,last_qty:10},{item_id:'CW-45-045-T1',order_count:3,last_qty:4}]};
    expect(glasses([bolts,wheelLine],tiedCount).map(u=>u.anchor.line_id)).toEqual([wheelLine.id]);
    // Tied on both: the earlier line wins.
    const tiedAll={...tiedCount,purchased:[{item_id:'HCS-12-13-2G8',order_count:4,last_qty:10},{item_id:'CW-45-045-T1',order_count:4,last_qty:4}]};
    expect(glasses([bolts,wheelLine],tiedAll).map(u=>u.anchor.line_id)).toEqual([bolts.id]);
    expect(glasses([wheelLine,bolts],tiedAll).map(u=>u.anchor.line_id)).toEqual([wheelLine.id]);
  });

  it('lets the matching-fastener rule win an item both rules suggest',()=>{
    const upsells=run([line('HCS-12-13-2G8',10)],{purchased:[{item_id:'HCS-12-13-2G8',order_count:6,last_qty:10},{item_id:'HN-12-13-G8',order_count:6,last_qty:5}],
      coPurchases:{'HCS-12-13-2G8':[{item_id:'HN-12-13-G8',orders_together:6}]}});
    expect(upsells.filter(u=>u.item.sku==='HN-12-13-G8').map(u=>u.kind)).toEqual(['matching_fastener']);
  });

  it('ignores co-purchased items missing from the catalog',()=>{
    expect(run([wheels()],history(5,{'NOT-A-SKU':4}))).toEqual([]);
  });
});

describe('a customer with no history',()=>{
  it('still gets the catalog rules (fasteners, full case), and nothing bought-together',()=>{
    const upsells=run([line('HCS-12-13-2G8',10),line('CW-45-045-T1',6),line('GLV-N8-L-1000',4)]);
    expect(skus(upsells).sort()).toEqual(['full_case:CW-45-045-T1','matching_fastener:FW-12-G8','matching_fastener:HN-12-13-G8']);
  });
});

describe('the chip list',()=>{
  const busy=()=>{
    const lines=[line('HCS-12-13-2G8',10),line('CW-45-045-T1',6,36),line('GLV-N8-L-1000',4),line('RS-2-27-JH',12)];
    const extra:Partial<UpsellFacts>={
      purchased:[{item_id:'HCS-12-13-2G8',order_count:6,last_qty:10},{item_id:'HN-12-13-G8',order_count:6,last_qty:5},{item_id:'FW-12-G8',order_count:5,last_qty:4},
        {item_id:'CW-45-045-T1',order_count:5,last_qty:4},{item_id:'FD-45-60Z',order_count:4,last_qty:3},{item_id:'GLV-N8-L-1000',order_count:4,last_qty:4},{item_id:'SG-CLR-AF',order_count:2,last_qty:2}],
      coPurchases:{'HCS-12-13-2G8':[{item_id:'HN-12-13-G8',orders_together:6},{item_id:'FW-12-G8',orders_together:5}],
        'CW-45-045-T1':[{item_id:'FD-45-60Z',orders_together:4},{item_id:'GLV-N8-L-1000',orders_together:1}],
        'GLV-N8-L-1000':[{item_id:'SG-CLR-AF',orders_together:2},{item_id:'CW-45-045-T1',orders_together:1}]},
      // The wheels are on contract at $36.00 (binding at any qty); everything else at customer price.
      price:pricer(id=>id==='CW-45-045-T1'?{price:36,basis:'contract'}:{price:customerPrice(id),basis:'customer'}),
    };
    return {lines,extra};
  };

  it('has no duplicate chips or items, and never an item already on the quote',()=>{
    const {lines,extra}=busy();
    const upsells=run(lines,extra);
    const ids=upsells.map(u=>u.id),items=upsells.map(u=>u.item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(items).size).toBe(items.length);
    for(const u of upsells)if(u.action.type==='add_line')expect(lines.map(l=>l.item_id)).not.toContain(u.item.id);
  });

  it('orders chips by GP gain, and is the same whatever order the catalog and history arrive in',()=>{
    const {lines,extra}=busy();
    const upsells=run(lines,extra);
    expect(upsells.map(u=>[u.id,u.gp_gain])).toEqual([
      ['full_case:RS-2-27-JH',gp(22.95,14.2,8)],['bought_together:FD-45-60Z',gp(47.5,31,3)],['matching_fastener:HN-12-13-G8',gp(16.5,9.8,5)],
      ['matching_fastener:FW-12-G8',gp(12.95,7.4,5)],['full_case:CW-45-045-T1',gp(36,24.1,2)],['bought_together:SG-CLR-AF',gp(29.9,18.2,2)],
    ]);
    const reversed=run(lines,{...extra,catalog:[...ITEMS].reverse(),purchased:[...extra.purchased!].reverse(),
      coPurchases:Object.fromEntries(Object.entries(extra.coPurchases!).map(([k,v])=>[k,[...v].reverse()]))});
    expect(reversed).toEqual(upsells);
    expect(run(lines,extra)).toEqual(upsells);
  });

  it('breaks GP ties by line, then rule, then SKU',()=>{
    // Every unit earns $10, and bolts come 100 to a box, so each chip below adds 5 units: +$50.
    const flat=pricer(id=>({price:catalogItem(id).cost+10,basis:null}));
    const catalog=ITEMS.map(i=>i.id==='HCS-12-13-2G8'?{...i,pack:'Box of 100'}:i);
    const wheels=line('CW-45-045-T1',4),bolts=line('HCS-12-13-2G8',5,catalogItem('HCS-12-13-2G8').cost+10);
    const upsells=run([wheels,bolts],{catalog,price:flat,purchased:[{item_id:'CW-45-045-T1',order_count:2,last_qty:4},{item_id:'FD-45-60Z',order_count:2,last_qty:5}],
      coPurchases:{'CW-45-045-T1':[{item_id:'FD-45-60Z',orders_together:2}]}});
    expect(upsells.map(u=>[u.id,u.gp_gain])).toEqual([
      ['bought_together:FD-45-60Z',50],['matching_fastener:FW-12-G8',50],['matching_fastener:HN-12-13-G8',50],['full_case:HCS-12-13-2G8',50],
    ]);
  });

  it('keeps the biggest GP gains when there are more ideas than maxSuggestions',()=>{
    const {lines,extra}=busy();
    const all=run(lines,extra);
    expect(run(lines,{...extra,options:{maxSuggestions:3}})).toEqual(all.slice(0,3));
    expect(run(lines,{...extra,options:{maxSuggestions:0}})).toEqual([]);
  });

  it('drops the strap bump when the branch is short, as on Q-24817',()=>{
    const {lines,extra}=busy();
    expect(skus(run(lines,{...extra,available:{'RS-2-27-JH':7,'HN-12-13-G8':75}}))).not.toContain('full_case:RS-2-27-JH');
  });

  it('drops an add when the branch can\'t fill it',()=>{
    expect(skus(run([line('HCS-12-13-2G8',10)],{available:{'HN-12-13-G8':4}}))).toEqual(['matching_fastener:FW-12-G8']);
  });
});

describe('pricing (task 1.1, injected)',()=>{
  it('prices every idea in one call',()=>{
    const price=pricer();
    run([line('HCS-12-13-2G8',10),line('HCS-12-13-3G8',4),line('CW-45-045-T1',6)],{price});
    expect(price.calls).toEqual([[{itemId:'HN-12-13-G8',qty:6},{itemId:'FW-12-G8',qty:6},{itemId:'HCS-12-13-3G8',qty:10},{itemId:'CW-45-045-T1',qty:8}]]);
  });

  it('asks once for a price two ideas share',()=>{
    // The unpriced nut line (5) is bumped to 10; its current-qty price is asked for once.
    const price=pricer();
    run([line('HN-12-13-G8',5,null),line('HN-38-16-G5',5,null)],{price});
    expect(price.calls).toEqual([[{itemId:'HN-12-13-G8',qty:10},{itemId:'HN-12-13-G8',qty:5},{itemId:'HN-38-16-G5',qty:10},{itemId:'HN-38-16-G5',qty:5}]]);
  });

  it('does not call the pricer when there is nothing to suggest',()=>{
    const price=pricer();
    expect(run([],{price})).toEqual([]);
    expect(run([line('GLV-N8-L-1000',4)],{price})).toEqual([]);
    expect(price.calls).toEqual([]);
  });

  it('drops ideas the engine can\'t price (null, $0, or a missing result)',()=>{
    expect(skus(run([line('HCS-12-13-2G8',10)],{price:pricer(id=>id==='HN-12-13-G8'?null:{price:12.95,basis:'customer'})}))).toEqual(['matching_fastener:FW-12-G8']);
    expect(run([line('HCS-12-13-2G8',10)],{price:pricer(()=>({price:0,basis:'custom'}))})).toEqual([]);
    expect(run([line('HCS-12-13-2G8',10)],{price:()=>[]})).toEqual([]);
  });

  it('drops an idea that adds no GP (priced at or below cost)',()=>{
    expect(run([line('HCS-12-13-2G8',10)],{price:pricer(id=>({price:catalogItem(id).cost,basis:'custom'}))})).toEqual([]);
  });

  it('computes GP to the cent',()=>{
    // 3 x (0.30 - 0.10) is 0.6000000000000001 in floats.
    const catalog=ITEMS.map(i=>i.id==='FD-45-60Z'?{...i,cost:0.1}:i);
    const facts:Partial<UpsellFacts>={catalog,purchased:[{item_id:'CW-45-045-T1',order_count:2,last_qty:4},{item_id:'FD-45-60Z',order_count:2,last_qty:3}],
      coPurchases:{'CW-45-045-T1':[{item_id:'FD-45-60Z',orders_together:2}]},price:pricer(()=>({price:0.3,basis:'customer'}))};
    expect(run([line('CW-45-045-T1',4)],facts)[0].gp_gain).toBe(0.6);
  });

  it('ignores lines whose item is not in the catalog, but still treats them as on the quote',()=>{
    expect(run([line('HCS-12-13-2G8',10),{id:'x',item_id:'HN-12-13-G8',qty:5,unit_price:null,unit_cost:0}],{catalog:ITEMS.filter(i=>i.id!=='HN-12-13-G8')}).map(u=>u.item.sku)).toEqual(['FW-12-G8']);
  });
});

describe('summary',()=>{
  it('totals the GP of the chips to the cent, as "up to +$X gross profit"',()=>{
    const chips=[{gp_gain:33.5},{gp_gain:27.75},{gp_gain:0.1},{gp_gain:0.2}];
    expect(upsellGpTotal(chips)).toBe(61.55);
    expect(formatUpsellSummary(chips)).toBe('4 ideas · up to +$61.55 gross profit');
    expect(formatUpsellSummary([{gp_gain:1234.5}])).toBe('1 idea · up to +$1,234.50 gross profit');
    expect(formatUpsellSummary([])).toBe('No ideas for this quote');
  });
});
