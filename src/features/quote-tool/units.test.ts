import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {readPacks} from './pack-wording';
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

  it('reads cartons as cases: the same number of an item priced per case, with a note naming the customer\'s word',()=>{
    expect(convertQuantity(2,'cartons',BAGS)).toEqual({quantity:2,note:{kind:'converted',wrote:'2 cartons',text:'Customer asked for 2 cartons = 2 cases'}});
    expect(convertQuantity(1,'ctn',TAPE)?.note?.text).toBe('Customer asked for 1 carton = 1 case');
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

describe('readPacks: the pack size the customer states (one text, no quantity)',()=>{
  const one=(count:number,per:string|null,text:string)=>({packs:[{count,per,text}],unread:null});
  it.each<[string,ReturnType<typeof readPacks>]>([
    ['Corrugated Boxes 12x10x8 32 ECT 50/bundle',one(50,'bundle','50/bundle')],
    ['Reclosable Poly Bags 4x10" 6 mil 500/case',one(500,'case','500/case')],
    ['Boxes 12x10x8 25/bdl',one(25,'bundle','25/bundle')],
    ['Poly bags 1,000 / cs',one(1000,'case','1,000/case')],
    ['Poly bags 12,500/ctn',one(12500,'case','12,500/case')],
    ['Mailers 100 per carton',one(100,'case','100/case')],
    ['Boxes 25 per bundle',one(25,'bundle','25/bundle')],
    ['Mailers 50 per box',one(50,'box','50/box')],
    ['Labels 4x6 500 per roll',one(500,'roll','500/roll')],
    ['Gloves 100 per pack',one(100,'pack','100/pack')],
    ['Tape 36 rolls per case',one(36,'case','36/case')],
    ['Poly bags 500 bags/case',one(500,'case','500/case')],
    ['Boxes, bundle of 25',one(25,'bundle','25/bundle')],
    ['Poly bags case of 500',one(500,'case','500/case')],
    ['Poly bags case of 1,000',one(1000,'case','1,000/case')],
    ['Labels 4x6 roll of 250',one(250,'roll','250/roll')],
    ['Mailers, box of 100',one(100,'box','100/box')],
    ['Gloves pack of 100',one(100,'pack','100/pack')],
    ['Poly bags 500ct',one(500,null,'500 ct')],
    ['Poly bags 500 ct',one(500,null,'500 ct')],
    ['Poly bags 1,000 ct',one(1000,null,'1,000 ct')],
    ['Zip bags 100 count',one(100,null,'100 ct')],
    ['Labels 12 pk',one(12,'pack','12/pack')],
    ['Labels 12-pack',one(12,'pack','12/pack')],
    ['Poly mailers 10x13 100/pk',one(100,'pack','100/pack')],
    ['Corrugated Boxes 12x10x8" 32 ECT',{packs:[],unread:null}],
    ['Poly bags 2 mil 12x15',{packs:[],unread:null}],
    ['#2 Kraft Bubble Mailers 8.5x12',{packs:[],unread:null}],
    ['Bubble Dispenser Packs 24"x50\'',{packs:[],unread:null}],
    ['Tape 3/4" x 36 yds',{packs:[],unread:null}],
    // Without the quantity, "3 packs" is pack wording it cannot place; with it, it is the quantity.
    ['Gloves 3 packs',{packs:[],unread:'3 packs'}],
    ['Kraft paper 36" 50 lb./bundle',{packs:[],unread:'50 lb./bundle'}],
  ])('%j -> %j',(text,reading)=>{
    expect(readPacks(text,null,null,null)).toEqual(reading);
  });

  it('reads the whole line too, but never takes the quantity for a pack',()=>{
    expect(readPacks('Poly bags 4x10','2 cases of 500 poly bags 4x10',2,'case').packs).toEqual([{count:500,per:'case',text:'500/case'}]);
    expect(readPacks('Labels 4x6','Labels 4x6, 3 pk',3,'pack')).toEqual({packs:[],unread:null});
    expect(readPacks('Labels 4x6','Labels 4x6 x 12',12,null)).toEqual({packs:[],unread:null});
    expect(readPacks('Gloves','Gloves 3 packs',3,'pack')).toEqual({packs:[],unread:null});
    // Two different packs in the line are both kept (and so never converted).
    expect(readPacks('Boxes 50/bundle','Boxes 50/bundle 25/bundle, 2 bundles',2,'bundle').packs.map(p=>p.count)).toEqual([50,25]);
    expect(readPacks(null,null,null,null)).toEqual({packs:[],unread:null});
  });
});

describe('convertQuantity with the customer\'s stated pack',()=>{
  const BOX25=pricingUnit('Each',25,{description:'Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing',category:'boxes'});
  const BAGS1000=pricingUnit('Case of 1,000',1,{description:'Reclosable Poly Bags, 4x10" 6 MIL',category:'bags'});
  const BAGS500=pricingUnit('Case of 500',1,{description:'Reclosable Poly Bags, 4x6" 2 MIL',category:'bags'});
  const LABELS=pricingUnit('Roll of 500',1,{description:'Direct Thermal Labels 4x6"',category:'labels'});
  const TISSUE=pricingUnit('Case',1,{description:'Tissue Paper Sheets 20x30"',category:'paper'});
  const TAPE=pricingUnit('Roll',1,{description:'Carton Sealing Tape 2" x 110 yds',category:'tape'});
  const GAYLORD=pricingUnit('Each',1,{description:'Single Wall Gaylord 48x40x36"',category:'boxes'});
  /** The pack wording of a description, read with the quantity (as the review dialog does). */
  const said=(description:string,quantity:number,unit:string)=>readPacks(description,null,quantity,unit);

  it('never converts when the customer\'s pack differs from the item\'s: keeps the numbers and says why',()=>{
    // The verifier's examples: 2 bundles of 50 are not 2 bundles of 25; a case of 500 is not a case of 1,000.
    expect(convertQuantity(2,'bundle',BOX25,said('Corrugated Boxes 12x10x8 32 ECT 50/bundle',2,'bundle'))).toEqual({quantity:2,note:{kind:'check',wrote:'2 bundles (50/bundle)',
      text:'Check quantity: customer\'s pack is 50/bundle, this item is a bundle of 25'}});
    expect(convertQuantity(1,'case',BAGS1000,said('Reclosable Poly Bags 4x10" 6 mil 500/case',1,'case'))).toEqual({quantity:1,note:{kind:'check',wrote:'1 case (500/case)',
      text:'Check quantity: customer\'s pack is 500/case, this item is a case of 1,000'}});
    // Every phrasing, and in pieces too (3,000 bags would divide by 1,000, but not the customer's 500s).
    expect(convertQuantity(2,'cases',BAGS1000,said('Poly bags case of 500',2,'cases'))?.note?.text).toBe('Check quantity: customer\'s pack is 500/case, this item is a case of 1,000');
    expect(convertQuantity(2,'cases',BAGS1000,said('Poly bags 500ct',2,'cases'))?.note?.text).toBe('Check quantity: customer\'s pack is 500 ct, this item is a case of 1,000');
    expect(convertQuantity(3000,'bags',BAGS1000,said('Poly bags 500/cs',3000,'bags'))).toMatchObject({quantity:3000,note:{kind:'check'}});
    expect(convertQuantity(4,'bundles',BOX25,said('Boxes bundle of 20',4,'bundles'))).toMatchObject({quantity:4,note:{kind:'check',wrote:'4 bundles (20/bundle)'}});
    expect(convertQuantity(1,'case',BAGS1000,said('Bags 1,500/case',1,'case'))?.note?.text).toBe('Check quantity: customer\'s pack is 1,500/case, this item is a case of 1,000');
    // The same count per roll is not a case of it, nor a box a case.
    expect(convertQuantity(2,'case',BAGS500,said('Labels 500/roll',2,'case'))?.note?.text).toBe('Check quantity: customer\'s pack is 500/roll, this item is a case of 500');
    expect(convertQuantity(2,'rolls',LABELS,said('Labels 500/case',2,'rolls'))?.note?.text).toBe('Check quantity: customer\'s pack is 500/case, this item is a roll of 500');
    expect(convertQuantity(2,'case',BAGS500,said('bags 500 per box',2,'case'))?.note?.text).toBe('Check quantity: customer\'s pack is 500/box, this item is a case of 500');
    // An item sold one at a time is not a pack of 5.
    expect(convertQuantity(2,'bundles',GAYLORD,said('Gaylords 5/bundle',2,'bundles'))?.note?.text).toBe('Check quantity: customer\'s pack is 5/bundle, this item is sold one at a time');
  });

  it('converts as before when the customer\'s pack is the item\'s, naming it in the note',()=>{
    expect(convertQuantity(2,'bundles',BOX25,said('Corrugated Boxes 12x10x8 32 ECT 25/bundle',2,'bundles'))).toEqual({quantity:50,note:{kind:'converted',wrote:'2 bundles (25/bundle)',
      text:'Customer asked for 2 bundles (25/bundle) = 50 each'}});
    expect(convertQuantity(2,'cases',BAGS1000,said('bags case of 1,000',2,'cases'))).toEqual({quantity:2,note:null});
    expect(convertQuantity(3000,'bags',BAGS1000,said('bags 1000/cs',3000,'bags'))?.note?.text).toBe('Customer asked for 3,000 bags (1,000/case) = 3 cases');
    expect(convertQuantity(4,'bundle',BOX25,said('boxes 25 ct',4,'bundle'))?.quantity).toBe(100);
    expect(convertQuantity(4,'rolls',LABELS,said('labels roll of 500',4,'rolls'))).toEqual({quantity:4,note:null});
    // The same count in another outer pack is not the item's: 2 cases of 25 of an item bundled 25 is checked.
    expect(convertQuantity(2,'case',BOX25,said('boxes 25/case',2,'case'))).toMatchObject({quantity:2,note:{kind:'check',text:'Check quantity: customer\'s pack is 25/case, this item is a bundle of 25'}});
  });

  it('flags a stated pack when the item\'s count is not known',()=>{
    expect(convertQuantity(3,'case',TISSUE,said('tissue sheets 480/case',3,'case'))).toEqual({quantity:3,note:{kind:'check',wrote:'3 cases (480/case)',
      text:'Check quantity: customer\'s pack is 480/case, this item\'s pack count is not known'}});
    expect(convertQuantity(2,'case',TAPE,said('tape 36 rolls per case',2,'case'))?.note?.text).toBe('Check quantity: customer\'s pack is 36/case, this item\'s pack count is not known');
    expect(convertQuantity(2,'case',null,said('tape 36/cs',2,'case'))?.note?.text).toBe('Check quantity (customer wrote: 2 cases (36/case))');
  });

  it('flags pack wording it does not read, or two packs, naming what the customer wrote',()=>{
    expect(convertQuantity(2,'bundles',BOX25,said('boxes bdl/25',2,'bundles'))).toEqual({quantity:2,note:{kind:'check',wrote:'2 bundles (bdl/25)',text:'Check quantity (customer wrote: 2 bundles (bdl/25))'}});
    expect(convertQuantity(2,'cases',BAGS1000,said('bags 1000/cs 10 boxes/case',2,'cases'))?.note?.text).toBe('Check quantity (customer wrote: 2 cases (1,000/case, 10/case))');
  });

  it('keeps working without a stated pack',()=>{
    expect(convertQuantity(10,'bundle',BOX25,null)?.quantity).toBe(250);
    expect(convertQuantity(10,'bundle',BOX25,{packs:[],unread:null})?.quantity).toBe(250);
    expect(convertQuantity(null,'bundle',BOX25,said('boxes 50/bundle',2,'bundle'))).toEqual({quantity:null,note:null});
  });
});
