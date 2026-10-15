import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {convertQuantity,customerUnit,perUnitLabel,pricingUnit,productNouns,unitLabel,type PricingUnit} from './units';

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
    ['Each',25,{unit:'each',contains:1,bundleOf:25,nouns:[]}],
    ['Each',1,{unit:'each',contains:1,bundleOf:null,nouns:[]}],
    ['Each',null,{unit:'each',contains:1,bundleOf:null,nouns:[]}],
    ['Case of 1,000',1,{unit:'case',contains:1000,bundleOf:null,nouns:[]}],
    ['Case of 4',1,{unit:'case',contains:4,bundleOf:null,nouns:[]}],
    ['Case of 1',1,{unit:'case',contains:1,bundleOf:null,nouns:[]}],
    ['Case',1,{unit:'case',contains:null,bundleOf:null,nouns:[]}],
    ['Roll',1,{unit:'roll',contains:null,bundleOf:null,nouns:[]}],
    ['Roll of 250',1,{unit:'roll',contains:250,bundleOf:null,nouns:[]}],
    ['Coil',1,{unit:'coil',contains:null,bundleOf:null,nouns:[]}],
    ['Pack of 12',1,{unit:'pack',contains:12,bundleOf:null,nouns:[]}],
    ['Box',null,{unit:'box',contains:null,bundleOf:null,nouns:[]}],
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
    // Without the item's product noun, rolls are not known to be the pieces of a case.
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

describe('productNouns: what one piece of an item is called',()=>{
  it.each<[string,string|null,string[]]>([
    ['Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing','boxes',['box']],
    ['White Corrugated Mailers 10x4x4"','boxes',['mailer','box']],
    ['#2 Kraft Bubble Mailers 8.5x12"','mailers',['mailer']],
    ['Reclosable Poly Bags, 30x30" 2 MIL','bags',['bag']],
    ['Expandable Foam Bags (Bulk Pack)','cushioning',['bag']],
    ['Clear Face Document Envelopes 7.5x5.5"','storage',['mailer']],
    ['Newsprint Sheets 24x36"','paper',['sheet']],
    ['White Direct Thermal Labels 4x6"','labels',['label']],
    ['Bubble Rolls 12"x250\'','cushioning',['roll']],
    ['Cast Stretch Wrap, Hand Length, 18"x1500\' 80 Gauge','stretch-wrap',['roll']],
    ['Clear Hot Melt Tape 2"x110 yd 1.8 mil','tape',['roll']],
    ['Workhorse Hand Tape Dispensers 2"','tape',[]],
    ['Poly Strapping, Machine Length, 0.25"x18000\'','tape',[]],
    ['#2 Used Pallets 48x40"','storage',[]],
    ['Single Wall Gaylord 48x40x36", pallet pricing','boxes',['box']],
  ])('%j (%s) -> %j',(description,category,nouns)=>{
    expect(productNouns(description,category)).toEqual(nouns);
  });

  it('gives the nouns to the pricing unit when the item is given',()=>{
    expect(pricingUnit('Case of 4',1,{description:'Cast Stretch Wrap 18"x1500\'',category:'stretch-wrap'})).toEqual({unit:'case',contains:4,bundleOf:null,nouns:['roll']});
  });
});

describe('convertQuantity: the item\'s own product noun counts as pieces',()=>{
  const item=(pack:string,caseQty:number,description:string,category:string)=>pricingUnit(pack,caseQty,{description,category});
  const BOXES=item('Each',25,'Corrugated Boxes 12x10x8"','boxes');
  const WRAP=item('Case of 4',1,'Cast Stretch Wrap, Hand Length, 18"x1500\' 80 Gauge','stretch-wrap');
  const POLY=item('Case of 1,000',1,'Reclosable Poly Bags, 4x6" 2 MIL','bags');
  const BUBBLE=item('Case of 100',1,'#2 Kraft Bubble Mailers 8.5x12"','mailers');
  const ENVELOPES=item('Case of 1,000',1,'Clear Face Document Envelopes 7.5x5.5"','storage');
  const LABELS=item('Case of 500',1,'Fragile Labels 3x5"','labels');
  const SHEETS=item('Case of 960',1,'White Tissue Paper Sheets 20x30"','paper');
  const TISSUE=item('Case',1,'Tissue Paper Sheets 20x30"','paper');

  it('reads "500 boxes" of a box priced each as 500 each: the same unit, no note',()=>{
    expect(convertQuantity(500,'boxes',BOXES)).toEqual({quantity:500,note:null});
    expect(convertQuantity(500,'Boxes',BOXES)).toEqual({quantity:500,note:null});
    expect(convertQuantity(500,'carton',BOXES)).toEqual({quantity:500,note:null});
  });

  it('divides pieces into whole cases, with a note in the customer\'s words',()=>{
    expect(convertQuantity(4,'rolls',WRAP)).toEqual({quantity:1,note:{kind:'converted',wrote:'4 rolls',text:'Customer asked for 4 rolls = 1 case'}});
    expect(convertQuantity(2000,'bags',POLY)).toEqual({quantity:2,note:{kind:'converted',wrote:'2,000 bags',text:'Customer asked for 2,000 bags = 2 cases'}});
    expect(convertQuantity(100,'mailers',BUBBLE)).toEqual({quantity:1,note:{kind:'converted',wrote:'100 mailers',text:'Customer asked for 100 mailers = 1 case'}});
    expect(convertQuantity(3000,'envelopes',ENVELOPES)?.note?.text).toBe('Customer asked for 3,000 envelopes = 3 cases');
    expect(convertQuantity(1000,'labels',LABELS)?.note?.text).toBe('Customer asked for 1,000 labels = 2 cases');
    expect(convertQuantity(1920,'sheets',SHEETS)?.note?.text).toBe('Customer asked for 1,920 sheets = 2 cases');
    expect(convertQuantity(1,'pouch',item('Case of 1',1,'Stand Up Pouches','bags'))?.note?.text).toBe('Customer asked for 1 pouch = 1 case');
  });

  it('flags pieces that do not divide exactly, or a case whose count is not known',()=>{
    expect(convertQuantity(6,'rolls',WRAP)).toEqual({quantity:6,note:{kind:'check',wrote:'6 rolls',text:'Check quantity (customer wrote: 6 rolls)'}});
    expect(convertQuantity(1500,'bags',POLY)?.note?.kind).toBe('check');
    expect(convertQuantity(500,'sheets',TISSUE)?.note?.text).toBe('Check quantity (customer wrote: 500 sheets)');
  });

  it('flags another product\'s noun and nouns it does not know',()=>{
    expect(convertQuantity(500,'bags',BOXES)?.note?.text).toBe('Check quantity (customer wrote: 500 bags)');
    expect(convertQuantity(2000,'boxes',POLY)?.note?.kind).toBe('check');
    expect(convertQuantity(2,'pallets',BOXES)?.note?.text).toBe('Check quantity (customer wrote: 2 pallets)');
    expect(convertQuantity(3,'skids',POLY)?.note?.text).toBe('Check quantity (customer wrote: 3 skids)');
  });
});
