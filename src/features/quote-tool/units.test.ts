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
    // A carton is a case (scripts/fetch-boxt-catalog.ts reads "per carton" as "Case of N").
    ['carton','case'],['Cartons','case'],['ctn','case'],['ctns','case'],
    ['each','each'],['ea','each'],['ea.','each'],['pcs','each'],['pc','each'],['piece','each'],['pieces','each'],
    ['roll','roll'],['rolls','roll'],['rl','roll'],['coil','coil'],['coils','coil'],
  ])('reads %j as %j',(written,unit)=>expect(customerUnit(written)).toBe(unit));
  it.each([null,'','pallet','box','bag','pack','gross','dozen'])('does not read %j',written=>expect(customerUnit(written)).toBeNull());
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
    expect(convertQuantity(1,'carton',BOX)?.note?.text).toBe('Check quantity (customer wrote: 1 carton)');
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

  it('flags a part of a countable unit: fractional bundles, cases, rolls or pieces are never presented as exact',()=>{
    expect(convertQuantity(2.5,'bundles',BOX)).toEqual({quantity:2.5,note:{kind:'check',wrote:'2.5 bundles',text:'Check quantity (customer wrote: 2.5 bundles)'}});
    expect(convertQuantity(0.001,'bundle',BOX)?.note?.kind).toBe('check');
    expect(convertQuantity(2.5,'cases',BAGS)).toEqual({quantity:2.5,note:{kind:'check',wrote:'2.5 cases',text:'Check quantity (customer wrote: 2.5 cases)'}});
    expect(convertQuantity(1.5,'rolls',FILM)?.note?.kind).toBe('check');
    expect(convertQuantity(12.5,'each',BOX)?.note?.kind).toBe('check');
    expect(convertQuantity(2500.5,'each',BAGS)?.note?.kind).toBe('check');
  });

  it('reads cartons as cases: the same number of an item priced per case of a known count, with a note naming the customer\'s word',()=>{
    expect(convertQuantity(2,'cartons',BAGS)).toEqual({quantity:2,note:{kind:'converted',wrote:'2 cartons',text:'Customer asked for 2 cartons = 2 cases'}});
    // A case whose count is not known may not be the customer's carton (B10b round 3).
    expect(convertQuantity(1,'ctn',TAPE)?.note?.text).toBe('Check quantity (customer wrote: 1 carton)');
  });
});

describe('unitLabel and perUnitLabel',()=>{
  it('reads a unit with its quantity, in the plural after any number but 1',()=>{
    expect(unitLabel(4,'roll')).toBe('rolls');
    expect(unitLabel(1,'case')).toBe('case');
    expect(unitLabel(2,'case')).toBe('cases');
    expect(unitLabel(2,'box')).toBe('boxes');
    expect(unitLabel(2,'pouch')).toBe('pouches');
    expect(unitLabel(10,'pallet')).toBe('pallets');
    expect(unitLabel(1,'pallet')).toBe('pallet');
    expect(unitLabel(3,'each')).toBe('each');
    expect(unitLabel(10,'bundle')).toBe('bundles');
    expect(unitLabel(10,'bundles')).toBe('bundles');
    expect(unitLabel(null,'bundle')).toBe('bundles');
    expect(unitLabel(2,null)).toBeNull();
  });
  it('echoes a unit word it does not know as written, never adding to it',()=>{
    expect(unitLabel(10,'bundle(s)')).toBe('bundle(s)');
    expect(unitLabel(10,'bx')).toBe('bx');
    expect(unitLabel(3,'cu ft')).toBe('cu ft');
    expect(unitLabel(4,'Rolls')).toBe('rolls'); // a known word, in lowercase
    expect(convertQuantity(10,'bundle(s)',null)?.note?.text).toBe('Check quantity (customer wrote: 10 bundle(s))');
    expect(convertQuantity(10,'bx',BOX)?.note?.text).toBe('Check quantity (customer wrote: 10 bx)');
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
    ['White Corrugated Mailers 10x4x4"','boxes',['mailer']],
    // A noun used as a modifier is not the product: "Box Cutters", "Box Combo Pack", "Mailer Boxes".
    ['Safety Knives & Box Cutters, 12/Case','storage',[]],
    ['Wardrobe Box Combo Pack, 3/Case','boxes',['box']],
    ['Kraft Mailer Boxes 9x6x3"','boxes',['box']],
    ['Poly Bags on a Roll 12x15"','bags',['bag']],
    // Categories that also hold other things give no noun.
    ['Clear Pallet Covers, 48x42x48" 2 MIL','bags',[]],
    ['Bubble Dispenser Packs, 24"x50\'','mailers',[]],
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

  it('takes a case count the description states over a pack of "Each" or a bare "Case" (catalog anomalies)',()=>{
    expect(pricingUnit('Each',1,{description:'Safety Knives & Box Cutters, 12/Case',category:'storage'})).toEqual({unit:'case',contains:12,bundleOf:null,nouns:[]});
    expect(pricingUnit('Case',1,{description:'Wardrobe Box Combo Pack, 3/Case',category:'boxes'})).toEqual({unit:'case',contains:3,bundleOf:null,nouns:['box']});
    expect(pricingUnit('Each',1,{description:'Gaylord, case of 4 pricing',category:'boxes'})?.unit).toBe('case');
    // A stated count never overrides a pack that gives its own.
    expect(pricingUnit('Case of 500',1,{description:'Poly Bags 500/case',category:'bags'})?.contains).toBe(500);
    const knives=pricingUnit('Each',1,{description:'Safety Knives & Box Cutters, 12/Case',category:'storage'});
    expect(convertQuantity(24,'each',knives)?.note?.text).toBe('Customer asked for 24 each = 2 cases');
    expect(convertQuantity(12,'boxes',knives)?.note?.kind).toBe('check');
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
    expect(convertQuantity(500,'box',BOXES)).toEqual({quantity:500,note:null});
  });

  it('never reads cartons as pieces: "2 cartons" of a box sold each is flagged, not 2 each',()=>{
    expect(convertQuantity(2,'cartons',BOXES)).toEqual({quantity:2,note:{kind:'check',wrote:'2 cartons',text:'Check quantity (customer wrote: 2 cartons)'}});
    expect(convertQuantity(2,'ctn',BOXES)?.note?.kind).toBe('check');
  });

  it('flags boxes of an item priced per case: a box may be the case itself or a piece in it',()=>{
    const COMBO=item('Case',1,'Wardrobe Box Combo Pack, 3/Case','boxes');
    expect(convertQuantity(3,'boxes',COMBO)?.note?.text).toBe('Check quantity (customer wrote: 3 boxes)');
    expect(convertQuantity(12,'boxes',item('Case of 12',1,'Corrugated Boxes 6x6x6"','boxes'))?.note?.kind).toBe('check');
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

describe('convertQuantity with the two-part gate (B10b): converts only a line the item fully accounts for, with nothing left over',()=>{
  const BOX25=pricingUnit('Each',25,{description:'Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing',category:'boxes'});
  const BAGS1000=pricingUnit('Case of 1,000',1,{description:'Reclosable Poly Bags, 4x10" 6 MIL',category:'bags'});
  const LABELS=pricingUnit('Roll of 500',1,{description:'Direct Thermal Labels 4x6"',category:'labels'});
  const OK={accounted:true,leftover:null};

  it('converts as the rules say when both parts hold',()=>{
    expect(convertQuantity(10,'bundles',BOX25,OK)).toEqual({quantity:250,note:{kind:'converted',wrote:'10 bundles',text:'Customer asked for 10 bundles = 250 each'}});
    expect(convertQuantity(2,'cases',BAGS1000,OK)).toEqual({quantity:2,note:null});
    expect(convertQuantity(2000,'bags',BAGS1000,{...OK,packs:['case']})?.note?.text).toBe('Customer asked for 2,000 bags = 2 cases');
  });

  it('keeps the number and flags it when the item does not account for the whole description',()=>{
    expect(convertQuantity(10,'bundles',BOX25,{accounted:false,leftover:null})).toEqual({quantity:10,note:{kind:'check',wrote:'10 bundles',text:'Check quantity (customer wrote: 10 bundles)'}});
    expect(convertQuantity(2,'cases',BAGS1000,{accounted:false,leftover:null})?.note?.kind).toBe('check');
  });

  it('keeps the number and flags it, with the leftover, when the raw line says anything else',()=>{
    expect(convertQuantity(4,'bundles',BOX25,{accounted:true,leftover:'pack size 50'})).toEqual({quantity:4,note:{kind:'check',wrote:'4 bundles, pack size 50',text:'Check quantity (customer wrote: 4 bundles, pack size 50)'}});
    // Brackets in the leftover never unbalance the note's own.
    expect(convertQuantity(2,'cases',BAGS1000,{accounted:true,leftover:'(500'})?.note?.text).toBe('Check quantity (customer wrote: 2 cases, 500)');
    expect(convertQuantity(2,'cases',BAGS1000,{accounted:true,leftover:'x'.repeat(200)})!.note!.wrote.length).toBeLessThanOrEqual(100);
  });

  it('keeps the number and flags it when a stated pack is not the item\'s own kind of pack (the matcher counts a box, a case and a bundle alike)',()=>{
    expect(convertQuantity(2,'cases',BAGS1000,{...OK,packs:['box']})?.note?.kind).toBe('check');
    expect(convertQuantity(4,'bundles',BOX25,{...OK,packs:['box']})?.note?.kind).toBe('check');
    expect(convertQuantity(4,'bundles',BOX25,{...OK,packs:['case']})?.note?.kind).toBe('check');
    expect(convertQuantity(2,'rolls',LABELS,{...OK,packs:['case']})?.note?.kind).toBe('check');
    expect(convertQuantity(4,'bundles',BOX25,{...OK,packs:['bundle']})?.quantity).toBe(100);
    expect(convertQuantity(2,'cartons',BAGS1000,{...OK,packs:['case']})?.note?.text).toBe('Customer asked for 2 cartons = 2 cases');
    // A bare count ("500 ct") is per the customer's unit: 2 cases of 1,000 ct is a case of 1,000; 2,000 each of it is not a pack.
    expect(convertQuantity(2,'cases',BAGS1000,{...OK,packs:[null]})).toEqual({quantity:2,note:null});
    expect(convertQuantity(2000,'each',BAGS1000,{...OK,packs:[null]})?.note?.kind).toBe('check');
    // An item sold one at a time has no pack a stated one could be.
    expect(convertQuantity(3,'each',pricingUnit('Each',1),{...OK,packs:['bundle']})?.note?.kind).toBe('check');
  });
});

describe('the item\'s own product noun means pieces, never a container (B10b, the verifier\'s folding cartons)',()=>{
  const OK={accounted:true,leftover:null};
  const FOLDING=pricingUnit('Case',1,{description:'White Folding Cartons, 4x4x4"',category:'boxes'})!;
  it('reads a folding carton\'s noun as carton, not as the box category',()=>{
    expect(FOLDING.nouns).toEqual(['carton']);
    expect(productNouns('Kraft Folding Cartons, 3x3x3"','boxes')).toEqual(['carton']);
    // "Carton Sealing Tape": carton is a modifier there.
    expect(productNouns('Carton Sealing Tape 2" x 110 yds','tape')).toEqual(['roll']);
  });
  it('flags "500 cartons" of folding cartons sold per case of an unknown count (never 500 cases)',()=>{
    expect(convertQuantity(500,'cartons',FOLDING,OK)).toEqual({quantity:500,note:{kind:'check',wrote:'500 cartons',text:'Check quantity (customer wrote: 500 cartons)'}});
    expect(convertQuantity(1000,'carton',FOLDING,OK)?.note?.kind).toBe('check');
    expect(convertQuantity(2,'ctn',FOLDING,OK)?.note?.kind).toBe('check');
  });
  it('converts cartons of a carton item only as pieces into a known case count that divides',()=>{
    const KNOWN=pricingUnit('Case of 250',1,{description:'White Folding Cartons, 4x4x4"',category:'boxes'})!;
    expect(convertQuantity(500,'cartons',KNOWN,OK)?.note?.text).toBe('Customer asked for 500 cartons = 2 cases');
    expect(convertQuantity(300,'cartons',KNOWN,OK)?.note?.kind).toBe('check');
    const EACH=pricingUnit('Each',50,{description:'White Folding Cartons, 4x4x4"',category:'boxes'})!;
    expect(convertQuantity(500,'cartons',EACH,OK)).toEqual({quantity:500,note:null});
  });
  it('reads cartons as cases only of an item that is not a carton, with a known case count',()=>{
    const BAGS=pricingUnit('Case of 1,000',1,{description:'Reclosable Poly Bags, 4x10" 6 MIL',category:'bags'})!;
    expect(convertQuantity(2,'cartons',BAGS,OK)?.note?.text).toBe('Customer asked for 2 cartons = 2 cases');
    const TAPE=pricingUnit('Case',1,{description:'Clear Tape',category:'tape'})!;
    expect(convertQuantity(1,'ctn',TAPE,OK)?.note?.kind).toBe('check');
  });
  it('keeps the other container nouns as pieces: rolls of a roll, bags of a case of bags, boxes only of an item priced each',()=>{
    const FILM=pricingUnit('Roll',1,{description:'Machine Stretch Film 20" x 5000\'',category:'stretch-wrap'})!;
    expect(convertQuantity(10,'rolls',FILM,OK)).toEqual({quantity:10,note:null});
    const POLY=pricingUnit('Case of 1,000',1,{description:'Reclosable Poly Bags, 4x6" 2 MIL',category:'bags'})!;
    expect(convertQuantity(2000,'bags',POLY,OK)?.quantity).toBe(2);
    const MAILER_BOXES=pricingUnit('Case of 50',1,{description:'Kraft Mailer Boxes 9x6x3"',category:'boxes'})!;
    expect(convertQuantity(100,'boxes',MAILER_BOXES,OK)?.note?.kind).toBe('check');
  });
});
