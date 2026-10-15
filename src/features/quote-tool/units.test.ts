import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {convertQuantity,customerUnit,perUnitLabel,pricingUnit,unitLabel,type PricingUnit} from './units';

// The pricing unit of a catalog item (what its list price, and so the rep's unit price and the line's
// quantity, are per) and the conversion of the customer's stated quantity into it.

const catalog=JSON.parse(readFileSync(join(__dirname,'../../../data/boxt-catalog.json'),'utf8')) as {pack:string|null;caseQty:number|null}[];

/** The shape of a pack value: "Case of 1,000" and "Case of 4" are one shape, "Case of N". */
const shapeOf=(pack:string|null)=>pack===null?'null':pack.replace(/\d[\d,]*/g,'N');

describe('pricingUnit',()=>{
  it('reads every pack shape in the catalog (documented here; a new shape fails this test until it is added)',()=>{
    const shapes=new Set(catalog.map(row=>`${shapeOf(row.pack)}${row.pack==='Each'?(row.caseQty??1)>1?' (caseQty > 1)':' (caseQty 1)':''}`));
    expect([...shapes].sort()).toEqual([
      'Case',              // per case; how many pieces a case holds is not stated
      'Case of N',         // per case of N pieces ("Case of 1,000": bags)
      'Coil',              // per coil (strapping)
      'Each (caseQty 1)',  // per piece, sold one at a time (gaylords)
      'Each (caseQty > 1)',// per piece, sold in bundles of caseQty (boxes, mailers)
      'Roll',              // per roll
      'Roll of N',         // per roll of N pieces (labels)
    ]);
  });

  it.each<[string|null,number|null,PricingUnit|null]>([
    ['Each',25,{unit:'each',contains:1,bundleOf:25}],
    ['Each',1,{unit:'each',contains:1,bundleOf:null}],
    ['Each',null,{unit:'each',contains:1,bundleOf:null}],
    ['Case of 1,000',1,{unit:'case',contains:1000,bundleOf:null}],
    ['Case of 4',1,{unit:'case',contains:4,bundleOf:null}],
    ['Case of 1',1,{unit:'case',contains:1,bundleOf:null}],
    ['Case',1,{unit:'case',contains:null,bundleOf:null}],
    ['Roll',1,{unit:'roll',contains:null,bundleOf:null}],
    ['Roll of 250',1,{unit:'roll',contains:250,bundleOf:null}],
    ['Coil',1,{unit:'coil',contains:null,bundleOf:null}],
    ['Pack of 12',1,{unit:'pack',contains:12,bundleOf:null}],
    ['Box',null,{unit:'box',contains:null,bundleOf:null}],
    [null,null,null],
    ['',25,null],
  ])('%j with caseQty %j is %j',(pack,caseQty,expected)=>{
    expect(pricingUnit(pack,caseQty)).toEqual(expected);
  });

  it('gives every catalog row a pricing unit',()=>{
    for(const row of catalog)expect(pricingUnit(row.pack,row.caseQty),JSON.stringify(row)).not.toBeNull();
  });
});

describe('customerUnit',()=>{
  it.each([
    ['bundle','bundle'],['Bundles','bundle'],['bdl','bundle'],['BDLS','bundle'],['bndl','bundle'],
    ['case','case'],['cases','case'],['cs','case'],['cs.','case'],
    ['each','each'],['ea','each'],['ea.','each'],['pcs','each'],['pc','each'],['piece','each'],['pieces','each'],
    ['roll','roll'],['rolls','roll'],['rl','roll'],['coil','coil'],['coils','coil'],
  ])('reads %j as %j',(written,unit)=>expect(customerUnit(written)).toBe(unit));
  it.each([null,'','pallet','carton','box','bag','pack','gross','dozen'])('does not read %j',written=>expect(customerUnit(written)).toBeNull());
});

const BOX=pricingUnit('Each',25)!;          // a box sold each, in bundles of 25
const GAYLORD=pricingUnit('Each',1)!;       // sold each, one at a time
const BAGS=pricingUnit('Case of 1,000',1)!; // bags, per case of 1,000
const TAPE=pricingUnit('Case',1)!;          // per case, pieces not stated
const FILM=pricingUnit('Roll',1)!;
const LABELS=pricingUnit('Roll of 250',1)!;

describe('convertQuantity',()=>{
  it('converts bundles of a box sold each in bundles: 10 bundles = 250 each',()=>{
    expect(convertQuantity(10,'bundle',BOX)).toEqual({quantity:250,note:{kind:'converted',wrote:'10 bundles',text:'Customer asked for 10 bundles = 250 each'}});
    expect(convertQuantity(1,'bdl',BOX)).toEqual({quantity:25,note:{kind:'converted',wrote:'1 bundle',text:'Customer asked for 1 bundle = 25 each'}});
    expect(convertQuantity(2.5,'bundles',BOX)?.quantity).toBe(62.5);
  });

  it('keeps cases of an item priced per case: the same number, no note',()=>{
    expect(convertQuantity(2,'case',BAGS)).toEqual({quantity:2,note:null});
    expect(convertQuantity(3,'cs',TAPE)).toEqual({quantity:3,note:null});
    expect(convertQuantity(4,'rolls',FILM)).toEqual({quantity:4,note:null});
  });

  it('keeps each of an item priced each: the same number, no note',()=>{
    expect(convertQuantity(500,'each',BOX)).toEqual({quantity:500,note:null});
    expect(convertQuantity(3,'pcs',GAYLORD)).toEqual({quantity:3,note:null});
  });

  it('converts pieces into cases of N only when they divide exactly',()=>{
    expect(convertQuantity(2000,'each',BAGS)).toEqual({quantity:2,note:{kind:'converted',wrote:'2,000 each',text:'Customer asked for 2,000 each = 2 cases'}});
    expect(convertQuantity(1000,'pcs',BAGS)).toEqual({quantity:1,note:{kind:'converted',wrote:'1,000 each',text:'Customer asked for 1,000 each = 1 case'}});
    expect(convertQuantity(500,'ea',LABELS)).toEqual({quantity:2,note:{kind:'converted',wrote:'500 each',text:'Customer asked for 500 each = 2 rolls'}});
  });

  it('keeps the customer\'s number and flags it when pieces do not divide into whole cases',()=>{
    expect(convertQuantity(1500,'each',BAGS)).toEqual({quantity:1500,note:{kind:'check',wrote:'1,500 each',text:'Check quantity (customer wrote: 1,500 each)'}});
    expect(convertQuantity(10,'each',TAPE)).toEqual({quantity:10,note:{kind:'check',wrote:'10 each',text:'Check quantity (customer wrote: 10 each)'}});
  });

  it('flags units it cannot convert exactly, keeping the customer\'s number',()=>{
    expect(convertQuantity(10,'pallet',BOX)).toEqual({quantity:10,note:{kind:'check',wrote:'10 pallets',text:'Check quantity (customer wrote: 10 pallets)'}});
    expect(convertQuantity(2,'case',BOX)?.note).toEqual({kind:'check',wrote:'2 cases',text:'Check quantity (customer wrote: 2 cases)'});
    expect(convertQuantity(2,'bundle',GAYLORD)?.note?.kind).toBe('check');
    expect(convertQuantity(3,'bundle',BAGS)?.note?.kind).toBe('check');
    expect(convertQuantity(4,'roll',pricingUnit('Case of 4',1))).toEqual({quantity:4,note:{kind:'check',wrote:'4 rolls',text:'Check quantity (customer wrote: 4 rolls)'}});
    expect(convertQuantity(1,'carton',BAGS)?.note?.text).toBe('Check quantity (customer wrote: 1 carton)');
  });

  it('flags a quantity without a unit',()=>{
    expect(convertQuantity(10,null,BOX)).toEqual({quantity:10,note:{kind:'check',wrote:'10, no unit',text:'Check quantity (customer wrote: 10, no unit)'}});
  });

  it('flags any quantity when the item has no known pricing unit',()=>{
    expect(convertQuantity(10,'case',null)).toEqual({quantity:10,note:{kind:'check',wrote:'10 cases',text:'Check quantity (customer wrote: 10 cases)'}});
  });

  it('has nothing to convert without a quantity',()=>{
    expect(convertQuantity(null,'bundle',BOX)).toEqual({quantity:null,note:null});
    expect(convertQuantity(null,null,BAGS)).toEqual({quantity:null,note:null});
  });

  it('never gives a quantity the line cannot store (more than 3 decimals): it keeps the number and flags it',()=>{
    expect(convertQuantity(0.0001,'bundle',BOX)?.note?.kind).toBe('check');
    expect(convertQuantity(0.0001,'bundle',BOX)?.quantity).toBe(0.0001);
  });
});

describe('unitLabel and perUnitLabel',()=>{
  it('reads a unit with its quantity, in the plural after any number but 1',()=>{
    expect(unitLabel(4,'roll')).toBe('rolls');
    expect(unitLabel(1,'case')).toBe('case');
    expect(unitLabel(2,'case')).toBe('cases');
    expect(unitLabel(2,'box')).toBe('boxes');
    expect(unitLabel(3,'each')).toBe('each');
    expect(unitLabel(10,'bundle')).toBe('bundles');
    expect(unitLabel(10,'bundles')).toBe('bundles');
    expect(unitLabel(null,'bundle')).toBe('bundles');
    expect(unitLabel(2,null)).toBeNull();
  });
  it('labels a unit price by its unit',()=>{
    expect(perUnitLabel('each')).toBe('per each');
    expect(perUnitLabel('case')).toBe('per case');
    expect(perUnitLabel(null)).toBeNull();
  });
});
