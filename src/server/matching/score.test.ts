import {describe,expect,it} from 'vitest';
import {CONFIDENCE,isConfident,scoreItems,type Purchase} from './score';

// A small catalog with the seed's kinds of near-duplicates. The seeded catalog itself is in catalog.test.ts.
const CATALOG=[
  {sku:'B-2-G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',keywords:'bolt hex bolt'},
  {sku:'B-2-G5',description:'Hex cap screw 1/2-13 x 2 in, Grade 5, zinc plated',keywords:'bolt hex bolt'},
  {sku:'B-112-G8',description:'Hex cap screw 1/2-13 x 1-1/2 in, Grade 8, yellow zinc',keywords:'bolt hex bolt'},
  {sku:'N-G8',description:'Hex nut 1/2-13, Grade 8, yellow zinc',keywords:'nut'},
  {sku:'W-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',keywords:'cutoff disc'},
  {sku:'W-T27',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 27',keywords:'cutoff disc'},
  {sku:'S-27',description:'Ratchet strap 2 in x 27 ft, J-hooks',keywords:'tie down strap'},
  {sku:'S-30',description:'Ratchet strap 2 in x 30 ft, flat hooks',keywords:'tie down strap'},
  {sku:'E-2',description:'Ratchet strap edge protector, 2 in',keywords:'corner protector'},
];

const scores=(query:string,purchases:Purchase[]=[],catalog=CATALOG)=>Object.fromEntries(scoreItems(query,catalog,{purchases}).map(c=>[c.item.sku,c.score]));
const ranked=(query:string,purchases:Purchase[]=[])=>scoreItems(query,CATALOG,{purchases}).map(c=>c.item.sku);
const bought=(sku:string,order_count:number,last_order_date='2026-09-09'):Purchase=>({sku,order_count,last_order_date});

describe('scoreItems: what the line says',()=>{
  it('returns only items that match at all, best first, with scores rounded to hundredths',()=>{
    const result=scoreItems('1/2-13 x 2 grade 8 hex bolts',CATALOG);
    expect(result.map(c=>c.item.sku).slice(0,4)).toEqual(['B-2-G8','B-2-G5','B-112-G8','N-G8']);
    for(const {score} of result){
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
      expect(Math.round(score*100)/100).toBe(score);
    }
  });

  it('scores a fully specified line 1, and each near-duplicate loses what it contradicts',()=>{
    expect(scores('1/2-13 x 2 grade 8 hex bolts')).toMatchObject({'B-2-G8':1,'B-2-G5':0.5,'B-112-G8':0.5,'N-G8':0.38});
    expect(scores('½-13 grade 8 hex cap screws 2 in')['B-2-G8']).toBe(1);
  });

  it('charges more for a contradicted attribute than a missing one',()=>{
    const catalog=[
      {sku:'G5',description:'Hex cap screw 1/2-13 x 2 in, Grade 5',keywords:'bolt'},
      {sku:'PLAIN',description:'Hex cap screw 1/2-13 x 2 in',keywords:'bolt'},
    ];
    // "grade 8" (2) + "bolts" (1): the plain bolt just lacks a grade; the Grade 5 bolt contradicts it.
    expect(scores('grade 8 bolts',[],catalog)).toEqual({PLAIN:0.33});
  });

  it('counts words the catalog does not know, so an unknown request is never a confident match',()=>{
    expect(scores('stainless hex bolts')).toMatchObject({'B-2-G8':0.67,'B-2-G5':0.67,'B-112-G8':0.67});
    expect(isConfident(scoreItems('stainless hex bolts',CATALOG))).toBe(false);
  });

  it('ignores chat filler and quantities',()=>{
    expect(scores('Please send 10 boxes of the 1/2-13 x 2 grade 8 hex bolts, thanks')).toEqual(scores('1/2-13 x 2 grade 8 hex bolts'));
  });

  it('scales down an item whose product noun the line does not name',()=>{
    // The edge protector matches "2 in ratchet strap" word for word, but it is a protector, not a strap.
    expect(scores('2 in ratchet straps')).toMatchObject({'S-27':1,'S-30':1,'E-2':0.6});
    expect(scores('edge protectors')).toEqual({'E-2':1});
    // "bolts" names the hex cap screws through their keywords, so the nut is the one scaled down.
    expect(scores('1/2-13 grade 8 hex bolts')).toMatchObject({'B-2-G8':1,'N-G8':0.5});
    expect(scores('1/2-13 grade 8 hex nuts')).toMatchObject({'N-G8':1,'B-2-G8':0.5});
  });

  it('only charges for the noun when the line names one',()=>{
    expect(scores('1/2-13 grade 8')).toMatchObject({'B-2-G8':1,'B-112-G8':1,'N-G8':1});
  });

  it('lets a typed SKU win outright',()=>{
    const result=scoreItems('W-T27 cut-off wheels',CATALOG);
    expect(result.map(c=>[c.item.sku,c.score])).toEqual([['W-T27',1],['W-T1',0.5]]);
    expect(isConfident(result)).toBe(true);
    expect(scores('b-112-g8')).toEqual({'B-112-G8':1});
  });

  it('returns nothing for an empty line, filler, or words no item has',()=>{
    expect(scoreItems('',CATALOG)).toEqual([]);
    expect(scoreItems('  please, thanks ',CATALOG)).toEqual([]);
    expect(scoreItems('xyzzy',CATALOG)).toEqual([]);
    expect(scoreItems('grade 8 bolts',[])).toEqual([]);
  });
});

describe('scoreItems: order history',()=>{
  it('"the usual" picks the contender the customer orders most',()=>{
    expect(scores('the usual cut-off wheels',[bought('W-T1',6)])).toEqual({'W-T1':1,'W-T27':0.7});
    expect(scores('same as last time: cut-off wheels',[bought('W-T1',6),bought('W-T27',2)])).toEqual({'W-T1':1,'W-T27':0.8});
    expect(isConfident(scoreItems('the usual cut-off wheels',CATALOG,{purchases:[bought('W-T1',6)]}))).toBe(true);
  });

  it('"the usual" is not confident when two contenders are ordered equally often',()=>{
    const result=scoreItems('the usual cut-off wheels',CATALOG,{purchases:[bought('W-T1',3),bought('W-T27',3)]});
    expect(result.map(c=>c.score)).toEqual([1,1]);
    expect(isConfident(result)).toBe(false);
  });

  it('fills in one missing size from history without "the usual" (Dana always buys 2 in bolts)',()=>{
    expect(scores('1/2 in grade 8 hex bolts',[bought('B-2-G8',7)])).toMatchObject({'B-2-G8':1,'B-112-G8':0.8});
    expect(isConfident(scoreItems('1/2 in grade 8 hex bolts',CATALOG,{purchases:[bought('B-2-G8',7)]}))).toBe(true);
    expect(scores('ratchet straps 2 in x 30',[bought('S-30',1)])).toMatchObject({'S-30':1});
  });

  it('never fills in a missing type, grade or other spec: those are always asked',()=>{
    expect(scores('cut-off wheels',[bought('W-T1',6)])).toEqual({'W-T1':1,'W-T27':1});
    expect(scores('1/2-13 x 2 hex bolts',[bought('B-2-G8',7)])).toMatchObject({'B-2-G8':1,'B-2-G5':1});
    // The 27 ft and 30 ft straps differ in length and hooks: two details, so history can't fill them.
    expect(scores('2 in ratchet straps',[bought('S-27',4)])).toMatchObject({'S-27':1,'S-30':1});
  });

  it('only counts purchases of the items the words cannot separate',()=>{
    // The protector was bought, but "ratchet straps" means a strap: history doesn't pull it up.
    expect(scores('the usual ratchet straps',[bought('E-2',5)])).toEqual({'S-27':1,'S-30':1,'E-2':0.6});
    expect(scores('the usual 1/2-13 x 2 grade 5 hex bolts',[bought('B-2-G8',7)])['B-2-G5']).toBe(1);
  });

  it('orders ties by how often the customer buys them, then by catalog order',()=>{
    expect(ranked('cut-off wheels',[bought('W-T27',2)])).toEqual(['W-T27','W-T1']);
    expect(ranked('cut-off wheels')).toEqual(['W-T1','W-T27']);
  });

  it('matches SKUs in purchases without regard to case',()=>{
    expect(scores('the usual cut-off wheels',[bought('w-t1',6)])['W-T1']).toBe(1);
  });
});

describe('isConfident',()=>{
  it('starts from the spec rule: top >= 0.75 and at least 0.15 ahead of the next',()=>{
    expect(CONFIDENCE).toEqual({minScore:0.75,minLead:0.15});
  });

  it.each([
    [[],false],
    [[{score:0.75}],true],
    [[{score:0.74}],false],
    [[{score:1},{score:0.85}],true],
    [[{score:0.95},{score:0.8}],true],
    [[{score:1},{score:0.86}],false],
    [[{score:0.9},{score:0.9}],false],
    [[{score:0.8},{score:0.5},{score:0.5}],true],
  ])('%j -> %s',(candidates,expected)=>{
    expect(isConfident(candidates)).toBe(expected);
  });

  it('compares in hundredths, so float noise never flips the answer',()=>{
    expect(0.95-0.8).toBeLessThan(0.15);
    expect(isConfident([{score:0.95},{score:0.8}])).toBe(true);
    expect(isConfident([{score:0.7499999999}])).toBe(true);
  });

  it('does not rely on the candidates being sorted',()=>{
    expect(isConfident([{score:0.5},{score:1}])).toBe(true);
    expect(isConfident([{score:0.9},{score:0.95}])).toBe(false);
  });

  it('takes another rule for tuning',()=>{
    expect(isConfident([{score:0.85},{score:0.5}],{minScore:0.9,minLead:0.15})).toBe(false);
    expect(isConfident([{score:0.95},{score:0.7}],{minScore:0.9,minLead:0.3})).toBe(false);
  });
});
