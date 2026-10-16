// @vitest-environment node
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {parseLine} from '@/server/llm/scripted-parser';
import {readPacks} from './pack-wording';
import {convertQuantity,pricingUnit,type ConvertedQuantity,type PricingUnit} from './units';

// Fail-closed quantity conversion (docs/boxt/plan.md B10b). A line's quantity is converted (or kept as
// the same number in the same unit without a note) only when the customer's line has no pack wording
// besides the quantity's own unit, or when all of it is ONE fully read pack statement equal to the
// item's pack (count and kind). Anything else keeps the customer's numbers with "Check quantity".

interface Row {sku:string;pack:string|null;caseQty:number|null;description:string;category:string|null}
const catalog=JSON.parse(readFileSync(join(__dirname,'../../../data/boxt-catalog.json'),'utf8')) as Row[];
const bySku=new Map(catalog.map(r=>[r.sku,r]));
const pricingOf=(sku:string):PricingUnit=>{
  const row=bySku.get(sku);
  if(!row)throw new Error(`no ${sku} in the catalog`);
  return pricingUnit(row.pack,row.caseQty,row)!;
};

type Override={description?:string;quantity?:number|null;unit?:string|null};
/** The raw line through the scripted parser (or a live parser's output, `ov`), read and converted for the item. */
function run(raw:string,sku:string,ov:Override={}):ConvertedQuantity{
  const row=parseLine(raw)!;
  const description=ov.description??row.description;
  const quantity='quantity' in ov?ov.quantity!:row.quantity;
  const unit='unit' in ov?ov.unit!:row.unit;
  return convertQuantity(quantity,unit,pricingOf(sku),readPacks(description,raw,quantity,unit));
}
const CHECK='check' as const;
type Expected=typeof CHECK|{quantity:number|null};
const outcome=(r:ConvertedQuantity):Expected=>r.note?.kind==='check'?CHECK:{quantity:r.quantity};

describe('the B10 round-3 verifier\'s pack table (every silent wrong conversion now flags; correct ones stay)',()=>{
  const LIVE_CASE_QTY={description:'Reclosable Poly Bags 4x10" 6 mil, case qty 500',quantity:2,unit:'cases'};
  it.each<[string,string,string,Override|null,Expected]>([
    ['50 per bundle','Corrugated Boxes 12x10x8 50 per bundle, 2 bundles','12108-BDL',null,CHECK],
    ['50 per bundle (= M1044, bundles of 50)','White Corrugated Mailers 10x4x4 50 per bundle, 2 bundles','M1044',null,{quantity:100}],
    ['50/bdl','Corrugated Boxes 12x10x8 50/bdl, 2 bdl','12108-BDL',null,CHECK],
    ['bundle of 50','Corrugated Boxes 12x10x8 bundle of 50, 2 bundles','12108-BDL',null,CHECK],
    ['bdl/50 (was silent)','Corrugated Boxes 12x10x8 bdl/50, 2 bundles','12108-BDL',null,CHECK],
    ['50 bx/bdl','Corrugated Boxes 12x10x8 50 bx/bdl, 2 bundles','12108-BDL',null,CHECK],
    ['case qty 500','Reclosable Poly Bags 4x10 6 mil case qty 500, 2 cases','PB3866',null,CHECK],
    ['case qty 500, live parser keeps it in the description (was silent)','Reclosable Poly Bags 4x10 6 mil, case qty 500 - 2 cases','PB3866',LIVE_CASE_QTY,CHECK],
    ['500 pcs/case','Reclosable Poly Bags 4x10 6 mil 500 pcs/case, 2 cases','PB3866',null,CHECK],
    ['1,000/cs (= PB3866)','Reclosable Poly Bags 4x10 6 mil 1,000/cs, 2 cs','PB3866',null,{quantity:2}],
    ['1000 per carton (= PB3866)','Reclosable Poly Bags 4x10 6 mil 1000 per carton, 2 cartons','PB3866',null,{quantity:2}],
    ['1000 per carton vs a case of 500','Reclosable Poly Bags 20x24 2 mil 1000 per carton, 2 cartons','PB3689',null,CHECK],
    ['2 cases of 500','2 cases of 500 Reclosable Poly Bags 4x10 6 mil','PB3866',null,CHECK],
    ['case (500) (was silent)','Reclosable Poly Bags 4x10 6 mil case (500), 2 cases','PB3866',null,CHECK],
    ['case (500), live (was silent)','Reclosable Poly Bags 4x10 6 mil case (500), 2 cases','PB3866',{description:'Reclosable Poly Bags 4x10" 6 mil case (500)',quantity:2,unit:'case'},CHECK],
    ['500/cs 2 cs','Reclosable Poly Bags 4x10 6 mil 500/cs 2 cs','PB3866',null,CHECK],
    ['pack of 12, 3 packs (KN100)','Safety Knives pack of 12, 3 packs','KN100',null,CHECK],
    ['pack of 12, 3 cases (KN100 is a case of 12: a pack is not a case)','Safety Knives pack of 12, 3 cases','KN100',null,CHECK],
    ['12-pk, no quantity','12-pk Safety Knives','KN100',null,{quantity:null}],
    ['12 pk is the quantity','12 pk Safety Knives','KN100',null,CHECK],
    ['12 pk in the description, 3 cases (live)','Safety Knives 12 pk, 3 cases','KN100',{description:'Safety Knives 12 pk',quantity:3,unit:'case'},CHECK],
    ['50 lb/bundle','Kraft paper 36in 50 lb/bundle, 2 bundles','12108-BDL',null,CHECK],
    ['50 lb./bundle (was silent)','Kraft paper 36in 50 lb./bundle, 2 bundles','12108-BDL',null,CHECK],
    ['50 lbs per bundle','Kraft paper 36in 50 lbs per bundle, 2 bundles','12108-BDL',null,CHECK],
    ['25 bundles/pallet, 2 pallets','Corrugated Boxes 12x10x8 25 bundles/pallet, 2 pallets','12108-BDL',null,CHECK],
    ['25 bundles/pallet, 4 bundles (a pallet pack is not a bundle pack)','Corrugated Boxes 12x10x8 25 bundles/pallet, 4 bundles','12108-BDL',null,CHECK],
    ['two packs: 25/bundle 400/pallet','Corrugated Boxes 12x10x8 25/bundle 400/pallet, 2 bundles','12108-BDL',null,CHECK],
    ['two packs: 100/box 10 boxes/case on a case of 100 (was a 10x under-quote)','Thermal Mailers 8x11 100/box 10 boxes/case, 2 cases','INM811',null,CHECK],
    ['two packs, case first','Thermal Mailers 8x11 10 boxes/case 100/box, 2 cases','INM811',null,CHECK],
    ['the raw line\'s pack differs from the description\'s (was silent)','Poly Bags 4x10 6 mil 1000/cs - ship as 500/case, 2 cases','PB3866',{description:'Reclosable Poly Bags 4x10" 6 mil 1000/cs',quantity:2,unit:'case'},CHECK],
    ['100 per box, 2 boxes (the parser finds no quantity)','Thermal Mailers 8x11 100 per box, 2 boxes','INM811',null,{quantity:null}],
    ['100 per box, 2 cases on a case of 100 (a box is not a case; was silent)','Thermal Mailers 8x11 100 per box, 2 cases','INM811',null,CHECK],
    ['case of 100, 2 boxes (no quantity)','Thermal Mailers 8x11 case of 100, 2 boxes','INM811',null,{quantity:null}],
    ['25 per box on a box bundled 25 (a box is not a bundle)','Corrugated Boxes 12x10x8 25 per box, 4 bundles','12108-BDL',null,CHECK],
    ['36 rolls per case (= T902900)','Clear Hot Melt Tape 2x110yd 2.5 mil 36 rolls per case, 2 cases','T902900',null,{quantity:2}],
    ['36 rolls/case vs a case of 6','Clear Hot Melt Tape 2x1000yd 36 rolls/case, 2 cases','T9031000',null,CHECK],
    ['2 cases of 36 rolls (= T902900)','2 cases of 36 rolls Clear Hot Melt Tape 2x110yd 2.5 mil','T902900',null,{quantity:2}],
    ['250 per roll (= PC85, roll of 250)','Black Top Sheeting 60x60 250 per roll, 2 rolls','PC85',null,{quantity:2}],
    ['250 per case vs a roll of 250','Black Top Sheeting 60x60 250 per case, 2 cases','PC85',null,CHECK],
    ['500 ct, 2 cases (= PL527)','Clear Face Document Envelopes 12x15 500 ct, 2 cases','PL527',null,{quantity:2}],
    ['500 a case (= PL527)','Clear Face Document Envelopes 12x15 500 a case, 2 cases','PL527',null,{quantity:2}],
    ['1,000 / case, 2000 pcs (= PB3866)','Reclosable Poly Bags 4x10 6 mil 1,000 / case, 2000 pcs','PB3866',null,{quantity:2}],
    ['500/case, 2000 pcs vs a case of 1,000','Reclosable Poly Bags 4x10 6 mil 500/case, 2000 pcs','PB3866',null,CHECK],
    ['no pack, 2 cases (baseline)','Reclosable Poly Bags 4x10 6 mil, 2 cases','PB3866',null,{quantity:2}],
    ['12/case (= KN100)','Safety Knives 12/case, 3 cases','KN100',null,{quantity:3}],
    ['24/case vs KN100','Safety Knives 24/case, 3 cases','KN100',null,CHECK],
    ['bundles of 50','Corrugated Boxes 12x10x8 bundles of 50, 2 bundles','12108-BDL',null,CHECK],
    ['3/case (= WARDCOMBO)','Wardrobe Box Combo 3/case, 2 cases','WARDCOMBO',null,{quantity:2}],
    ['10/case, the item\'s count unknown','Moving Box Combo Pack 10/case, 2 cases','MBCOMBO2',null,CHECK],
    ['5/bundle of an item sold one at a time','Triple Wall Gaylord 48x40x36 5/bundle, 2 bundles','GAYLORDTW-BDL',null,CHECK],
    ['500 pc. per case (was silent)','Reclosable Poly Bags 4x10 6 mil 500 pc. per case, 2 cases','PB3866',null,CHECK],
    ['500 per cs.','Reclosable Poly Bags 4x10 6 mil 500 per cs., 2 cs','PB3866',null,CHECK],
    ['500pcs/cs','Reclosable Poly Bags 4x10 6 mil 500pcs/cs 2 cs','PB3866',null,CHECK],
    ['500 ea/case','Reclosable Poly Bags 4x10 6 mil 500 ea/case 2 cases','PB3866',null,CHECK],
    ['500 bags per master case (was silent)','Reclosable Poly Bags 4x10 6 mil 500 bags per master case 2 cases','PB3866',null,CHECK],
    ['500 bags in a case (was silent)','Reclosable Poly Bags 4x10 6 mil 500 bags in a case, 2 cases','PB3866',null,CHECK],
    ['cs/500 (was silent)','Reclosable Poly Bags 4x10 6 mil cs/500, 2 cases','PB3866',null,CHECK],
    ['case pack 500 (was silent)','Reclosable Poly Bags 4x10 6 mil case pack 500, 2 cases','PB3866',null,CHECK],
    ['500 per pack, 2 cases','Reclosable Poly Bags 4x10 6 mil 500 per pack, 2 cases','PB3866',null,CHECK],
    ['5,00/case (typo; was silent)','Reclosable Poly Bags 4x10 6 mil 5,00/case, 2 cases','PB3866',null,CHECK],
  ])('%s',(_,raw,sku,ov,expected)=>{
    expect(outcome(run(raw,sku,ov??{}))).toEqual(expected);
  });
});

describe('adversarial pack phrasings: none converts silently',()=>{
  // Every phrase states 500 to a pack on PB3866 (a case of 1,000), so anything but "Check quantity" is wrong.
  it.each([
    'case/500','500-ct case','500 count case','cs 500','case:500','case: 500','500 /cs','(500/cs)','case of 500 bags','1M/cs',
    '2x case 500','500⁄case','500∕case','500／case','500per case','500 to a case','500 in each case','case=500','case - 500','cs-500',
    '500 ct per case','500ct/cs','box of 500','500 per sleeve','inner pack 500','500 bags/master case','ctn qty: 500','500 pcs per ctn',
    'packed 500s','(500)','500 bags','bags of 500','500 per','pk 500','500/case 500/case','500 x case','500 each case','case x 500',
    '500 ﹙case﹚','½ case of 1,000','500 CS','500/CASE','QTY/CS 500','500 Per Case','500 per outer','dozen cases','2 gross',
  ])('"Reclosable Poly Bags 4x10 6 mil %s, 2 cases" on a case of 1,000',phrase=>{
    const raw=`Reclosable Poly Bags 4x10 6 mil ${phrase}, 2 cases`;
    expect(run(raw,'PB3866').note?.kind,raw).toBe('check');
    // And as a live parser might keep it in the description.
    expect(run(raw,'PB3866',{description:`Reclosable Poly Bags 4x10" 6 mil ${phrase}`,quantity:2,unit:'cases'}).note?.kind,raw).toBe('check');
  });

  it.each([
    // 1,000 to a case on a case of 500: still wrong.
    ['Reclosable Poly Bags 20x24 2 mil 1,000 bags/case 2 cases','PB3689'],
    ['Reclosable Poly Bags 20x24 2 mil 1,000/cs, 2 cartons','PB3689'],
    // A box is not a case, even with the same count.
    ['Thermal Mailers 8x11 100/box, 2 cases','INM811'],
    ['Thermal Mailers 8x11 box of 100, 2 cases','INM811'],
    // A pallet or a case is not the bundle a box is sold in.
    ['Corrugated Boxes 12x10x8 25/case, 4 bundles','12108-BDL'],
    ['Corrugated Boxes 12x10x8 25 per pallet, 4 bundles','12108-BDL'],
    // An item sold one at a time has no pack.
    ['Triple Wall Gaylord 48x40x36 1/bundle, 2 bundles','GAYLORDTW-BDL'],
  ])('%s (%s) flags',(raw,sku)=>{
    expect(run(raw,sku).note?.kind).toBe('check');
  });

  it('keeps the old correct conversions without pack wording',()=>{
    expect(run('12 x 10 x 8" Corrugated Boxes, 32 ECT   10 bundles','12108-BDL')).toEqual({quantity:250,note:{kind:'converted',wrote:'10 bundles',text:'Customer asked for 10 bundles = 250 each'}});
    expect(run('Reclosable Poly Bags 30 x 30" 2 Mil, qty 2 cases','PB3866')).toEqual({quantity:2,note:null});
    expect(run('Cast Stretch Wrap 18" x 1500\' 80 Gauge   4 rolls','SF188CAST').note?.text).toBe('Customer asked for 4 rolls = 1 case');
    expect(run('S-4128 12x10x8 boxes 32 ECT 10 bdl','12108-BDL').quantity).toBe(250);
    expect(run('1. Reclosable Poly Bags 4x10 6 mil 2 cases','PB3866')).toEqual({quantity:2,note:null});
    expect(run('Reclosable Poly Bags 4x10 6 mil','PB3866',{quantity:2000,unit:'bags'}).note?.text).toBe('Customer asked for 2,000 bags = 2 cases');
    expect(run('500 Corrugated Boxes 12x10x8','12108-BDL',{description:'Corrugated Boxes 12x10x8',quantity:500,unit:'boxes'})).toEqual({quantity:500,note:null});
    expect(run('Corrugated Boxes 12x10x8 x 500','12108-BDL',{description:'Corrugated Boxes 12x10x8',quantity:500,unit:'each'})).toEqual({quantity:500,note:null});
    expect(run('Corrugated Boxes 12x10x8 32 ECT 25/bundle, 2 bundles','12108-BDL').note?.text).toBe('Customer asked for 2 bundles (25/bundle) = 50 each');
  });

  it('says what the customer wrote, pack wording included, in at most 100 characters',()=>{
    expect(run('Corrugated Boxes 12x10x8 bdl/50, 2 bundles','12108-BDL').note).toEqual({kind:'check',wrote:'2 bundles (bdl/50)',text:'Check quantity (customer wrote: 2 bundles (bdl/50))'});
    expect(run('Thermal Mailers 8x11 100/box 10 boxes/case, 2 cases','INM811').note).toEqual({kind:'check',wrote:'2 cases (100/box, 10/case)',text:'Check quantity (customer wrote: 2 cases (100/box, 10/case))'});
    expect(run('Reclosable Poly Bags 4x10 6 mil 500 bags per master case 2 cases','PB3866').note?.wrote).toBe('2 cases (500 bags per master case)');
    expect(run('Thermal Mailers 8x11 100 per box, 2 cases','INM811').note?.text).toBe('Check quantity: customer\'s pack is 100/box, this item is a case of 100');
    const long=run(`Poly bags 4x10 ${'case qty 500 '.repeat(20)}, 2 cases`,'PB3866').note!;
    expect(long.kind).toBe('check');
    expect(long.wrote.length).toBeLessThanOrEqual(100);
  });
});

describe('readPacks',()=>{
  it('reads one pack statement and leaves nothing unread',()=>{
    expect(readPacks('Corrugated Boxes 50/bundle','Corrugated Boxes 50/bundle, 2 bundles',2,'bundle')).toEqual({packs:[{count:50,per:'bundle',text:'50/bundle'}],unread:null});
    expect(readPacks('poly bags 4x10','2 cases of 1,000 poly bags 4x10',2,'case')).toEqual({packs:[{count:1000,per:'case',text:'1,000/case'}],unread:null});
    // A bare count is per the quantity's unit when that is a pack ("500 ct, 2 cases": 500 to a case).
    expect(readPacks('Envelopes 500 ct','Envelopes 500 ct, 2 cases',2,'case').packs).toEqual([{count:500,per:'case',text:'500 ct'}]);
    expect(readPacks('Envelopes 500 ct','Envelopes 500 ct, 2000 pcs',2000,'each').packs).toEqual([{count:500,per:null,text:'500 ct'}]);
  });
  it('never takes the quantity for a pack',()=>{
    expect(readPacks('Labels 4x6','Labels 4x6, 3 pk',3,'pack')).toEqual({packs:[],unread:null});
    expect(readPacks('Labels 4x6','Labels 4x6 x 12',12,null)).toEqual({packs:[],unread:null});
    expect(readPacks('Labels 4x6','Qty: 12 rolls Labels 4x6',12,'roll')).toEqual({packs:[],unread:null});
  });
  it('dedupes the same pack in the description and the raw line, and keeps different ones apart',()=>{
    expect(readPacks('Bags 1000/cs','Bags 1000/cs, 2 cs',2,'case').packs).toHaveLength(1);
    expect(readPacks('Bags 1000/cs','Bags 1000/cs - ship as 500/case, 2 cs',2,'case').packs.map(p=>p.text)).toEqual(['1,000/case','500/case']);
  });
  it('reports wording it does not read',()=>{
    expect(readPacks('Bags cs/500','Bags cs/500, 2 cases',2,'case').unread).toBe('cs/500');
    expect(readPacks('Bags case (500)','Bags case (500), 2 cases',2,'case').unread).toBe('case (500)');
    expect(readPacks('Kraft paper 50 lb/bundle','Kraft paper 50 lb/bundle, 2 bundles',2,'bundle').unread).toBe('50 lb/bundle');
  });
  it('reads nothing into product words, sizes, gauges, SKUs and list numbers',()=>{
    for(const [description,raw,q,u] of [
      ['12 x 10 x 8" Corrugated Boxes, 32 ECT','12 x 10 x 8" Corrugated Boxes, 32 ECT   10 bundles',10,'bundle'],
      ['Cast Stretch Wrap 18" x 1500\' 80 Gauge','Cast Stretch Wrap 18" x 1500\' 80 Gauge   4 rolls',4,'roll'],
      ['Poly Bags on a Roll 12x15"','Poly Bags on a Roll 12x15", 2 cases',2,'case'],
      ['Bubble Dispenser Packs 24"x50\'','Bubble Dispenser Packs 24"x50\', 3 each',3,'each'],
      ['#2 Kraft Bubble Mailers 8.5x12"','#2 Kraft Bubble Mailers 8.5x12" qty 2 cases',2,'case'],
      ['12x10x8 boxes 32 ECT','S-4128 12x10x8 boxes 32 ECT 10 bdl',10,'bundle'],
      ['Foam peanuts 14 cu ft','Foam peanuts 14 cu ft 2 bags',2,'bag'],
      ['Corrugated Boxes 12x10x8 275# test','1) Corrugated Boxes 12x10x8 275# test - 10 bundles',10,'bundle'],
      ['Clear Hot Melt Tape 2" x 110 yd 1.8 mil','Clear Hot Melt Tape 2" x 110 yd 1.8 mil, 6 rolls',6,'roll'],
    ] as const)expect(readPacks(description,raw,q,u),raw).toEqual({packs:[],unread:null});
  });
});

// ---- Property: random quantity + pack phrases -----------------------------------------------------

/** A small seeded generator (mulberry32), so a failure is reproducible. */
function rng(seed:number){
  return ()=>{
    seed|=0;seed=seed+0x6d2b79f5|0;
    let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

type Kind='case'|'bundle'|'roll'|'box'|'pack'|'pallet';
/** Pack phrases a customer may write for `count` per `kind`; some the reader parses, some it does not. */
const PACK_TEMPLATES:((n:string,word:string,kind:Kind)=>string)[]=[
  (n,w)=>`${n}/${w}`,(n,w)=>`${n} / ${w}`,(n,w)=>`${n} per ${w}`,(n,w)=>`${n} pcs/${w}`,(n,w)=>`${n} pcs per ${w}`,
  (n,w)=>`${w} of ${n}`,(n,w)=>`${w} of ${n} pcs`,(n,w)=>`${n} a ${w}`,(n,w)=>`${n}per ${w}`,(n,w)=>`${n} ea/${w}`,
  (n,w)=>`${w}/${n}`,(n,w)=>`${w} qty ${n}`,(n,w)=>`${w} (${n})`,(n,w)=>`${w}: ${n}`,(n,w)=>`${n}-ct ${w}`,(n,w)=>`${n} count ${w}`,
  (n,w)=>`${w} pack ${n}`,(n,w)=>`${n} in a ${w}`,(n,w)=>`${n} per master ${w}`,(n,w)=>`${w}=${n}`,(n,w)=>`(${n}/${w})`,(n,w)=>`${n}⁄${w}`,
  (n,w)=>`${n} pc. per ${w}`,(n,w)=>`${n} ${w}`,(n,w)=>`${w} ${n}`,(n,w)=>`${n} pcs. per ${w}.`,(n,w)=>`${n} to the ${w}`,
];
const WORDS:Record<Kind,string[]>={
  case:['case','cs','carton','ctn','CASE','Cs.'],bundle:['bundle','bdl','bndl','Bundle'],roll:['roll','rl'],box:['box','bx'],pack:['pack','pk','pkg'],pallet:['pallet','skid'],
};
const COUNTS=[1,5,6,12,25,36,50,100,250,500,1000];
const fmt=(n:number,r:()=>number)=>n>=1000&&r()<0.5?n.toLocaleString('en-US'):String(n);
const pick=<T,>(xs:readonly T[],r:()=>number)=>xs[Math.floor(r()*xs.length)];

/** Items: what one pack of each is (null: sold one at a time, or count unknown). */
const ITEMS:{sku:string;product:string;own:{count:number;kind:Kind}|null}[]=[
  {sku:'12108-BDL',product:'Corrugated Boxes 12x10x8 32 ECT',own:{count:25,kind:'bundle'}},
  {sku:'M1044',product:'White Corrugated Mailers 10x4x4',own:{count:50,kind:'bundle'}},
  {sku:'PB3866',product:'Reclosable Poly Bags 4x10 6 mil',own:{count:1000,kind:'case'}},
  {sku:'PB3689',product:'Reclosable Poly Bags 20x24 2 mil',own:{count:500,kind:'case'}},
  {sku:'INM811',product:'Thermal Mailers 8x11',own:{count:100,kind:'case'}},
  {sku:'T902900',product:'Clear Hot Melt Tape 2x110yd 2.5 mil',own:{count:36,kind:'case'}},
  {sku:'PC85',product:'Black Top Sheeting 60x60',own:{count:250,kind:'roll'}},
  {sku:'KN100',product:'Safety Knives',own:{count:12,kind:'case'}},
  {sku:'GAYLORDTW-BDL',product:'Triple Wall Gaylord 48x40x36',own:null},
  {sku:'MBCOMBO2',product:'Moving Box Combo Pack',own:null},
];
const QUANTITIES:((r:()=>number)=>string)[]=[
  r=>`${1+Math.floor(r()*9)} cases`,r=>`${1+Math.floor(r()*9)} cs`,r=>`${1+Math.floor(r()*9)} bundles`,r=>`${1+Math.floor(r()*9)} bdl`,
  r=>`qty ${1+Math.floor(r()*9)} cases`,r=>`${pick([100,500,1000,2000,3000],r)} pcs`,r=>`${pick([2,4,36,72],r)} rolls`,r=>`${1+Math.floor(r()*9)} cartons`,
  r=>`${pick([50,100,250,500],r)} each`,r=>`${1+Math.floor(r()*9)} rolls`,
];

describe('property: conversion happens only when no pack was written or the written pack is the item\'s',()=>{
  it('holds for 600 random lines (quantity phrase x 0 to 2 pack phrases x item), through the scripted parser',()=>{
    const r=rng(20261016);
    let converted=0,flagged=0,withPack=0;
    for(let n=0;n<600;n++){
      const item=pick(ITEMS,r);
      const packs:{count:number;kind:Kind}[]=[];
      const phrases:string[]=[];
      const howMany=r()<0.2?0:r()<0.85?1:2;
      for(let k=0;k<howMany;k++){
        // Half the time, the item's own pack (count and kind), so matching packs are exercised too.
        const own=item.own&&r()<0.5?item.own:{count:pick(COUNTS,r),kind:pick(Object.keys(WORDS) as Kind[],r)};
        packs.push(own);
        phrases.push(pick(PACK_TEMPLATES,r)(fmt(own.count,r),pick(WORDS[own.kind],r),own.kind));
      }
      const quantity=pick(QUANTITIES,r)(r);
      const raw=r()<0.7?`${item.product} ${phrases.join(' ')}, ${quantity}`:`${quantity} ${item.product} ${phrases.join(' ')}`;
      const result=run(raw,item.sku);
      if(packs.length)withPack++;
      if(result.note?.kind==='check'){flagged++;continue;}
      converted++;
      // Not flagged: no pack written, or exactly the item's own (a written pack must name the item's count and kind).
      const ok=packs.length===0||(item.own!==null&&packs.every(p=>p.count===item.own!.count&&p.kind===item.own!.kind));
      expect(ok,`${raw} on ${item.sku} -> ${JSON.stringify(result)}`).toBe(true);
    }
    // The generator covers both outcomes.
    expect(converted).toBeGreaterThan(30);
    expect(flagged).toBeGreaterThan(200);
    expect(withPack).toBeGreaterThan(400);
  });

  it('never converts a line that states two different packs, whatever they are',()=>{
    const r=rng(7);
    for(let n=0;n<300;n++){
      const item=pick(ITEMS.filter(i=>i.own),r);
      const own=item.own!;
      const other={count:pick(COUNTS.filter(c=>c!==own.count),r),kind:pick(Object.keys(WORDS) as Kind[],r)};
      const a=`${fmt(own.count,r)}/${pick(WORDS[own.kind],r)}`,b=pick(PACK_TEMPLATES,r)(fmt(other.count,r),pick(WORDS[other.kind],r),other.kind);
      const raw=`${item.product} ${r()<0.5?`${a} ${b}`:`${b} ${a}`}, ${pick(QUANTITIES,r)(r)}`;
      expect(run(raw,item.sku).note?.kind,raw).toBe('check');
    }
  });
});
