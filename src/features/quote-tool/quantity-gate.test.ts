// @vitest-environment node
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {describe,expect,it} from 'vitest';
import {parseLine} from '@/server/llm/scripted-parser';
import {accountLine,packContainersOf,type PackagingItem} from '@/server/matching';
import {rawLeftover} from './quantity-gate';
import {convertQuantity,pricingUnit,type ConvertedQuantity,type PricingUnit} from './units';

// Fail-closed quantity acceptance (docs/boxt/plan.md B10b), two-part total accounting: a customer's
// quantity is converted (or kept as the same number without a note) only when the chosen item fully
// accounts for the line's description (accountLine, the matcher's Strict accounting) AND nothing but
// the description, the supplier's SKU and the quantity phrase is in the raw line. Nothing recognises
// pack wording: a pack the item does not confirm, or anything left over, flags.

interface Row extends PackagingItem {pack:string|null;caseQty:number|null;description:string;category:string|null}
const catalog=JSON.parse(readFileSync(join(__dirname,'../../../data/boxt-catalog.json'),'utf8')) as Row[];
const bySku=new Map(catalog.map(r=>[r.sku,r]));
const rowOf=(sku:string)=>{
  const row=bySku.get(sku);
  if(!row)throw new Error(`no ${sku} in the catalog`);
  return row;
};
const pricingOf=(sku:string):PricingUnit=>{const row=rowOf(sku);return pricingUnit(row.pack,row.caseQty,row)!;};
const ACCOUNTED=new Map<string,boolean>();
const accounted=(description:string,sku:string)=>{
  const key=`${sku}\u0000${description}`;
  let value=ACCOUNTED.get(key);
  if(value===undefined)ACCOUNTED.set(key,value=accountLine(description,rowOf(sku),catalog).strictEligible);
  return value;
};

type Override={description?:string;quantity?:number|null;unit?:string|null;suppliersSku?:string|null};
/** The raw line through the scripted parser (or a live parser's output, `ov`), put on the item. */
function run(raw:string,sku:string,ov:Override={}):ConvertedQuantity{
  const row=parseLine(raw)!;
  const description=ov.description??row.description;
  const quantity='quantity' in ov?ov.quantity!:row.quantity;
  const unit='unit' in ov?ov.unit!:row.unit;
  const suppliersSku='suppliersSku' in ov?ov.suppliersSku!:row.suppliersSku;
  const leftover=rawLeftover({rawText:raw,description,suppliersSku,quantity,unit});
  return convertQuantity(quantity,unit,pricingOf(sku),{accounted:accounted(description,sku),leftover,packs:packContainersOf(description)});
}
const flagged=(r:ConvertedQuantity)=>r.quantity===null||r.note?.kind==='check';
/** Safe: flagged, or (when the line states nothing but the item's own pack) exactly `right`. */
function expectSafe(r:ConvertedQuantity,right:number|null,label:string){
  if(right===null)expect(flagged(r),`${label} -> ${JSON.stringify(r)}`).toBe(true);
  else if(!flagged(r))expect(r.quantity,`${label} -> ${JSON.stringify(r)}`).toBe(right);
}
const CHECK='check' as const;
type Expected=typeof CHECK|{quantity:number|null};

describe('the B10 round-3 verifier\'s pack table: every row that was wrong flags; the rest flag or convert exactly',()=>{
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
  ])('%s',(label,raw,sku,ov,expected)=>{
    expectSafe(run(raw,sku,ov??{}),expected===CHECK?null:expected.quantity,label);
  });
});

describe('the B10b round-1 verifier\'s silent rows (pack size, "50 x 4", labels, number words, other digits) all flag',()=>{
  const BAGS='Reclosable Poly Bags 4x10" 6 mil';
  it.each<[string,string,Override|null]>([
    ['S-4128 12x10x8 Corrugated Boxes 32 ECT, pack size 50, 4 bundles','12108-BDL',null],
    ['S-4128 12x10x8 Corrugated Boxes 32 ECT, pack size 50, 4 bundles','12108-BDL',{description:'12x10x8 Corrugated Boxes 32 ECT',quantity:4,unit:'bundles'}],
    ['12x10x8 Corrugated Boxes 32 ECT 50 x 4 bundles','12108-BDL',null],
    ['12x10x8 Corrugated Boxes 32 ECT 50 x 4 bundles','12108-BDL',{description:'12x10x8 Corrugated Boxes 32 ECT',quantity:4,unit:'bundle'}],
    ['Corrugated Boxes 12x10x8 32 ECT std pack size 50, 2 bundles','12108-BDL',null],
    [`${BAGS}, pack size 500, 2 cases`,'PB3866',null],
    [`${BAGS}, pack size 500, 2 cases`,'PB3866',{description:BAGS,quantity:2,unit:'case'}],
    [`${BAGS}, carton size 500, 2 cartons`,'PB3866',null],
    [`${BAGS}, box contains 500 x 2 cases`,'PB3866',null],
    [`${BAGS}, box contains 500 x 2 cases`,'PB3866',{description:BAGS,quantity:2,unit:'case'}],
    [`${BAGS}, pack: 500 x 2 cases`,'PB3866',null],
    [`${BAGS}, std carton size 250, qty 2 cases`,'PB3866',null],
    [`${BAGS} carton type 2000, 2 cartons`,'PB3866',null],
    [`${BAGS} pack#2000, 2 cases`,'PB3866',null],
    [`${BAGS}, carton # 500, 2 cartons`,'PB3866',null],
    [`${BAGS}, carton of five hundred, 2 cartons`,'PB3866',null],
    [`${BAGS}, carton of five hundred, 2 cartons`,'PB3866',{description:BAGS,quantity:2,unit:'carton'}],
    [`${BAGS}, five hundred a carton, 2 cartons`,'PB3866',null],
    [`${BAGS}, five hundred bags, 2 cases`,'PB3866',null],
    [`${BAGS}, ٥٠٠ bags a carton, 2 cartons`,'PB3866',null],
    [`${BAGS}, ٥٠٠ bags a carton, 2 cartons`,'PB3866',{description:BAGS,quantity:2,unit:'carton'}],
    [`${BAGS} 500 in, 2 cases`,'PB3866',null],
    [`${BAGS} 500# case, 2 cases`,'PB3866',null],
    [`${BAGS} CS500, 2 cases`,'PB3866',null],
    [`${BAGS} 2 cs x 500`,'PB3866',{description:BAGS,quantity:2,unit:'case'}],
    [`${BAGS} two cases (1,000 total)`,'PB3866',{description:BAGS,quantity:2,unit:'case'}],
    [`${BAGS}, 2 cases, 1000 total`,'PB3866',{description:BAGS,quantity:2,unit:'case'}],
  ])('%s (%s) flags',(raw,sku,ov)=>{
    expect(flagged(run(raw,sku,ov??{})),raw).toBe(true);
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
    // Found while attacking this design: a possessive plural, a count after x, a bare count next to a container, packages, zero-width characters.
    "500's",'x500','500 ct box','box 500 ct','500-bag case','500/package','package of 500','500 in box','1000/cs (500 bags)','500 units',
    'ca\u200bse 500','500 ct (box)','500 bags x 2 cases',
  ])('"Reclosable Poly Bags 4x10 6 mil %s, 2 cases" on a case of 1,000',phrase=>{
    const raw=`Reclosable Poly Bags 4x10 6 mil ${phrase}, 2 cases`;
    expect(flagged(run(raw,'PB3866')),raw).toBe(true);
    // And as a live parser might give it: the phrase kept in the description, or left out of it.
    expect(flagged(run(raw,'PB3866',{description:`Reclosable Poly Bags 4x10" 6 mil ${phrase}`,quantity:2,unit:'cases'})),raw).toBe(true);
    expect(flagged(run(raw,'PB3866',{description:'Reclosable Poly Bags 4x10 6 mil',quantity:2,unit:'cases'})),raw).toBe(true);
  });

  it('keeps the plain conversions: a line the item fully accounts for, with nothing else in it',()=>{
    expect(run('12 x 10 x 8" Corrugated Boxes, 32 ECT   10 bundles','12108-BDL')).toEqual({quantity:250,note:{kind:'converted',wrote:'10 bundles',text:'Customer asked for 10 bundles = 250 each'}});
    expect(run('Reclosable Poly Bags 30 x 30" 2 Mil, qty 2 cases','PB3669')).toEqual({quantity:2,note:null});
    expect(run('S-4128 12 x 10 x 8" Corrugated Boxes, 32 ECT 10 bdl','12108-BDL').quantity).toBe(250);
    expect(run('1. Reclosable Poly Bags 30 x 30" 2 Mil 2 cases','PB3669')).toEqual({quantity:2,note:null});
    expect(run('12 x 10 x 8" Corrugated Boxes, 32 ECT x 500','12108-BDL',{description:'12 x 10 x 8" Corrugated Boxes, 32 ECT',quantity:500,unit:'each'})).toMatchObject({quantity:500});
  });

  it('says what the customer wrote, the leftover included, with balanced brackets, in at most 100 characters',()=>{
    expect(run('12 x 10 x 8" Corrugated Boxes, 32 ECT, pack size 50, 4 bundles','12108-BDL',{description:'12 x 10 x 8" Corrugated Boxes, 32 ECT',quantity:4,unit:'bundle'}).note)
      .toEqual({kind:'check',wrote:'4 bundles, pack size 50',text:'Check quantity (customer wrote: 4 bundles, pack size 50)'});
    expect(run('12 x 10 x 8" Corrugated Boxes, 32 ECT (500), 2 cases','12108-BDL',{description:'12 x 10 x 8" Corrugated Boxes, 32 ECT',quantity:2,unit:'case'}).note?.text)
      .toBe('Check quantity (customer wrote: 2 cases, 500)');
    const long=run(`Poly bags 4x10 ${'case qty 500 '.repeat(20)}, 2 cases`,'PB3866',{description:'Poly bags 4x10',quantity:2,unit:'case'}).note!;
    expect(long.kind).toBe('check');
    expect(long.wrote.length).toBeLessThanOrEqual(100);
    for(const text of [long.text,run('Bags (500, 2 cases','PB3866',{description:'Bags',quantity:2,unit:'case'}).note!.text]){
      expect(text.split('(').length,text).toBe(text.split(')').length);
    }
  });
});

describe('rawLeftover: the raw line besides the description, the supplier\'s SKU and the quantity phrase',()=>{
  it.each<[string,string,string|null,number|null,string|null,string|null]>([
    ['12 x 10 x 8" Corrugated Boxes, 32 ECT   10 bundles','12 x 10 x 8" Corrugated Boxes, 32 ECT',null,10,'bundle',null],
    ['S-4128 12x10x8 boxes 32 ECT 10 bdl','12x10x8 boxes 32 ECT','S-4128',10,'bundle',null],
    ['Reclosable Poly Bags 30 x 30" 2 Mil, qty 2 cases','Reclosable Poly Bags 30 x 30" 2 Mil',null,2,'case',null],
    ['Reclosable Poly Bags 30 x 30" 2 Mil, Quantity: 2 cs.','Reclosable Poly Bags 30 x 30" 2 Mil',null,2,'cases',null],
    ['Poly bags 4x10, 2,000 bags please','Poly bags 4x10',null,2000,'each',null],
    ['Poly bags 4x10 x 12','Poly bags 4x10',null,12,null,null],
    // The parser's description word for word, with other marks: still the description.
    ['Poly bags 4x10" - 6 mil, 2 cases','Poly bags 4x10 6 mil',null,2,'case',null],
    // Left over: digits of any script, any word but filler.
    ['Bags 4x10, pack size 50, 2 cases','Bags 4x10',null,2,'case','pack size 50'],
    ['Boxes 12x10x8 50 x 4 bundles','Boxes 12x10x8',null,4,'bundle','50'],
    ['Bags 4x10 ٥٠٠ a carton, 2 cartons','Bags 4x10',null,2,'carton','٥٠٠ a carton'],
    ['Bags 4x10 five hundred bags, 2 cases','Bags 4x10',null,2,'case','five hundred bags'],
    ['Bags 4x10 ½ case, 2 cases','Bags 4x10',null,2,'case','1⁄2 case'],
    // A plain currency amount (a unit price "each", or a line total) is not about the quantity: taken out.
    ['Boxes 12x10x8, 4 bundles $1.10','Boxes 12x10x8',null,4,'bundle',null],
    ['Boxes 12x10x8, 4 bundles, $1,100.00','Boxes 12x10x8',null,4,'bundle',null],
    ['Boxes 12x10x8, 4 bundles USD 45.00','Boxes 12x10x8',null,4,'bundle',null],
    ['Boxes 12x10x8, 4 bundles $1.10 ea','Boxes 12x10x8',null,4,'bundle',null],
    ['Boxes 12x10x8, 4 bundles $1.10/ea','Boxes 12x10x8',null,4,'bundle',null],
    ['Boxes 12x10x8, 4 bundles $1.10 EACH $110.00','Boxes 12x10x8',null,4,'bundle',null],
    ['Boxes 12x10x8 $1.10 4 bundles','Boxes 12x10x8',null,4,'bundle',null],
    ['Boxes 12x10x8, $1.10 ea, 4 bundles, $110.00','Boxes 12x10x8',null,4,'bundle',null],
    // A price per any other unit or pack leaves that unit behind: flagged.
    ['Bags 4x10, 2 cases $45/cs','Bags 4x10',null,2,'case','/cs'],
    ['Boxes 12x10x8, 4 bundles $0.50 per bundle','Boxes 12x10x8',null,4,'bundle','per bundle'],
    ['Boxes 12x10x8, 4 bundles $1.10/box','Boxes 12x10x8',null,4,'bundle','/box'],
    ['Boxes 12x10x8, 4 bundles $1.10 each case','Boxes 12x10x8',null,4,'bundle','case'],
    // Not a currency amount: a bare number, or one glued to more digits, stays.
    ['Boxes 12x10x8, 4 bundles 1.10','Boxes 12x10x8',null,4,'bundle','1.10'],
    ['Boxes 12x10x8, 4 bundles $1.10x50','Boxes 12x10x8',null,4,'bundle','$1.10x50'],
    ['Boxes 12x10x8, 4 bundles $1,10','Boxes 12x10x8',null,4,'bundle','$1,10'],
    ['Boxes 12x10x8, 4 bundles $1100.00','Boxes 12x10x8',null,4,'bundle',null],
    // A piece noun is not the unit "each" the parser gave: the raw word and the parser's unit disagree.
    ['Thermal Mailers 8x11, 800 boxes','Thermal Mailers 8x11',null,800,'each','800 boxes'],
    ['Poly bags 4x10, 2,000 bags','Poly bags 4x10',null,2000,'each','2,000 bags'],
    // Symbols left over (anything but spaces and separators) flag.
    ['Boxes 12x10x8 ~4 bundles','Boxes 12x10x8',null,4,'bundle','~'],
    ['Boxes 12x10x8 4 # bundles','Boxes 12x10x8',null,4,'bundle','4 # bundles'],
    ['Boxes 12x10x8 4 = bundles','Boxes 12x10x8',null,4,'bundle','4 = bundles'],
    ['Boxes 12x10x8 4 bundles +','Boxes 12x10x8',null,4,'bundle','+'],
    ['Boxes 12x10x8 ≈4 bundles','Boxes 12x10x8',null,4,'bundle','≈'],
    ['Boxes 12x10x8 4 bundles ±','Boxes 12x10x8',null,4,'bundle','±'],
    ['Boxes 12x10x8 <4 bundles','Boxes 12x10x8',null,4,'bundle','<'],
    ['Boxes 12x10x8 4 bundles @','Boxes 12x10x8',null,4,'bundle','@'],
    ['Boxes 12x10x8 4 bundles *','Boxes 12x10x8',null,4,'bundle','*'],
    ['Boxes 12x10x8 4 bundles %','Boxes 12x10x8',null,4,'bundle','%'],
    // Separators are not symbols.
    ['Boxes 12x10x8 - 4 bundles; (rush) ','Boxes 12x10x8',null,4,'bundle','rush'],
    ['Boxes 12x10x8 - 4 bundles.','Boxes 12x10x8',null,4,'bundle',null],
    // A description the raw line does not contain word for word leaves it all over.
    ['Bags 4x10, 2 cases','Reclosable Bags 4x10',null,2,'case','Bags 4x10'],
    // A unit the raw line does not say is not the quantity phrase.
    ['Bags 4x10, 2','Bags 4x10',null,2,'case','2'],
    ['Bags 4x10, 2 pallets','Bags 4x10',null,2,'case','2 pallets'],
  ])('%j',(rawText,description,suppliersSku,quantity,unit,left)=>{
    expect(rawLeftover({rawText,description,suppliersSku,quantity,unit})).toBe(left);
  });
});

describe('folding cartons (the B10b round-2 verifier): "N cartons" of a carton item are cartons, never cases',()=>{
  it.each<[string,string,Override|null]>([
    ['White Folding Cartons 4x4x4, 500 cartons','RTC61W',null],
    ['White Folding Cartons, 4x4x4", 500 cartons','RTC61W',{description:'White Folding Cartons, 4x4x4"',quantity:500,unit:'cartons'}],
    ['Kraft Folding Cartons 3x3x3, 1000 cartons','RTC60',null],
    ['Kraft Folding Cartons, 3x3x3", 2 ctns','RTC60',{description:'Kraft Folding Cartons, 3x3x3"',quantity:2,unit:'carton'}],
  ])('%s (%s) flags',(raw,sku,ov)=>{
    expect(flagged(run(raw,sku,ov??{})),raw).toBe(true);
  });

  it('sweep: for every catalog item whose product noun is also a container word, "N <noun>s" is pieces (exact) or flagged, never N containers',()=>{
    const CONTAINER_NOUNS=new Set(['box','carton','pack','bag','roll','sleeve','tube','coil']);
    let items=0;
    for(const row of catalog){
      const pricing=pricingUnit(row.pack,row.caseQty,row);
      const noun=pricing?.nouns[0];
      if(!pricing||!noun||!CONTAINER_NOUNS.has(noun))continue;
      items++;
      const plural=noun==='box'?'boxes':`${noun}s`;
      for(const n of [1,2,12,100,500,1000]){
        for(const word of [plural,noun]){
          const result=convertQuantity(n,word,pricing,{accounted:true,leftover:null});
          if(flagged(result))continue;
          // Pieces: the same number of an item priced each, or per its own piece (a roll priced per roll), or whole cases of a known count.
          const pieces=pricing.unit==='each'||pricing.unit===noun?n:pricing.contains?n/pricing.contains:NaN;
          expect(result.quantity,`${row.sku} ${row.description} (${row.pack}) ${n} ${word} -> ${JSON.stringify(result)}`).toBe(pieces);
        }
      }
    }
    expect(items).toBeGreaterThan(300);
  });
});

describe('the B10b verifier\'s 40 realistic lines: every line whose pack is not the item\'s flags; the rest flag or are exact',()=>{
  // [raw, item, the right quantity in the item's pricing unit, or null when the line's pack is not the item's]
  it.each<[string,string,number|null]>([
    ['S-4128 12x10x8 Corrugated Boxes 25/bundle, 4 bundles','12108-BDL',100],
    ['S-1695 4x6 2 mil reclosable 1000/case, 2 cases','PB3565',2],
    ['S-4122 6x6x6 Corrugated Boxes 25/bundle, 10 bundles','666-BDL',250],
    ['S-4128 12x10x8 Corrugated Boxes - 25 per bundle - qty 4 bundles','12108-BDL',100],
    ['S-4128 12x10x8" Corrugated Boxes, bundle of 25, 100 boxes','12108-BDL',100],
    ['S-4140 16x12x12 Corrugated Boxes 25/bdl 8 bdl','161212-BDL',200],
    ['S-4166 18x18x18 Corrugated Boxes 20/bundle, 5 bundles','181818-BDL',null],
    ['S-4128 12x10x8 Corrugated Boxes 25/bundle, 400/pallet, 1 pallet','12108-BDL',null],
    ['S-1695 Reclosable Bags 4x6" 2 Mil 1,000/carton - 3 cartons','PB3565',3],
    ['S-1293 Reclosable Bags 6x9" 2 Mil 1000/cs 5 cs','PB3615',5],
    ['S-1293 Reclosable Bags 6x9" 2 Mil 1,000 per case, 5,000 bags','PB3615',5],
    ['S-1293 Reclosable Bags 6x9" 2 Mil (1,000/case) qty 5','PB3615',5],
    ['S-1695 4x6 2 mil reclosable 1000/case, 2 cases (2,000 bags)','PB3565',2],
    ['S-12738 4x6 6 mil reclosable bags 500/case, 4 cases','PB3864',null],
    ['S-423 Uline Industrial Tape 2" x 110 yds 2.6 Mil Clear 36 rolls/case, 2 cases','T902291',2],
    ['S-423 Tape 2"x110yd 2.6 mil, 6 rolls/pack, 36 rolls/case, 2 cases','T902291',null],
    ['S-423 Tape 2"x110yd 2.6 mil clear, 72 rolls','T902291',2],
    ['S-3216 Hot Melt Tape 2" x 110 yds 1.9 mil 36/case 4 cases','T902700',4],
    ['S-5048 Direct Thermal Labels 4x6" 250 labels/roll, 12 rolls/case, 2 cases','THD114',null],
    ['S-5048 Direct Thermal Labels 4x6 3,000/case, 2 cases','THD114',2],
    ['S-5048 Direct Thermal Labels 4x6 - 6,000 labels','THD114',2],
    ['S-3487 #6 Poly Mailers 14 1/2 x 19 250/case, 2 cases','B876',2],
    ['S-3487 #6 Poly Mailers 14.5x19" 100/case, 2 cases','B876',null],
    ['S-8457 Flat Poly Mailers 24x24 #8 125/carton x 2 cartons','B878',2],
    ['S-11289 Cast Stretch Film 18" x 1500\' 80 gauge 4 rolls/case, 10 cases','SF188CAST',10],
    ['S-11289 Cast Stretch Film 18" x 1500\' 80 ga, 40 rolls','SF188CAST',10],
    ['S-11289 Cast Stretch Film 18"x1500\' 80 Gauge - 4/cs - 6 cs','SF188CAST',6],
    ['S-13523 Machine Stretch Film 20" x 5000\' 90 gauge, 1 roll/case, 10 rolls','MSF2090B',null],
    ['S-13523 Machine Stretch Film 20" x 5000\' 90 gauge, 10 rolls','MSF2090B',10],
    ['S-3400 Poly Strapping 1/2" x 7,200\' 600 lb, 1 coil/case, 4 coils','PS1231',null],
    ['S-4128 Corrugated Boxes 12 x 10 x 8" 32 ECT, 25 bundle qty, 4 bundles','12108-BDL',100],
    ['S-4128 Corrugated Boxes 12x10x8 (bundle of 25) - 200 ea','12108-BDL',200],
    ['S-4128 Corrugated Boxes 12x10x8, 25 ct, 4 bundles','12108-BDL',100],
    ['S-4128 Corrugated Boxes 12x10x8, sold in bundles of 25, 4 bundles','12108-BDL',100],
    ['S-1695 4x6 2 mil reclosable, case pack 1,000, 2 cases','PB3565',2],
    ['S-1695 4x6 2 mil reclosable, 1M/cs, 2 cs','PB3565',2],
    ['S-1695 4x6 2 mil reclosable, 1000 ct case, 2 cases','PB3565',2],
    ['S-1695 4x6 2 mil reclosable, pack size 1000, 2 cases','PB3565',2],
    ['S-1695 4x6 2 mil reclosable, 2 cases','PB3565',2],
    ['S-4128 12x10x8 Corrugated Boxes, 4 bundles','12108-BDL',100],
  ])('%s (%s)',(raw,sku,right)=>{
    expectSafe(run(raw,sku),right,raw);
  });
});

// ---- Properties -------------------------------------------------------------------------------------

/** A small seeded generator (mulberry32), so a failure is reproducible. */
function rng(seed:number){
  return ()=>{
    seed|=0;seed=seed+0x6d2b79f5|0;
    let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return ((t^t>>>14)>>>0)/4294967296;
  };
}

describe('property: a stated pack other than the item\'s never converts (the B10b verifier\'s generator, digits and number words)',()=>{
  const PB={sku:'PB3866',desc:['Reclosable Poly Bags 4x10 6 mil','4x10" 6 MIL reclosable bags','Poly Bags, Reclosable, 4 x 10, 6 mil'],C:['case','cs','carton','ctn','box','pack','pkg','master case','inner'],P:['bags','pcs','pieces','ea','units','bag',''],
    Q:[{t:', 2 cases',q:2,u:'case'},{t:' - 2 cs',q:2,u:'case'},{t:', qty 2 cases',q:2,u:'case'},{t:', 2 cartons',q:2,u:'carton'},{t:'; 2 ctns',q:2,u:'carton'},{t:' x 2 cases',q:2,u:'case'},{t:', 2,000 bags',q:2000,u:'each'},{t:', 2000 pcs',q:2000,u:'each'}]};
  const BX={sku:'12108-BDL',desc:['Corrugated Boxes 12x10x8 32 ECT','12 x 10 x 8" RSC boxes','Shipping box 12x10x8, kraft'],C:['bundle','bdl','bndl','pack','skid','pallet'],P:['boxes','pcs','ea','units','box',''],
    Q:[{t:', 2 bundles',q:2,u:'bundle'},{t:' - 2 bdl',q:2,u:'bundle'},{t:', qty 2 bundles',q:2,u:'bundle'},{t:', 100 boxes',q:100,u:'box'},{t:', 100 pcs',q:100,u:'each'}]};
  const NUMBERS:Record<'digits'|'words',Record<string,string[]>>={
    digits:{PB3866:['500','250','2,000','2000'],'12108-BDL':['50','20','100']},
    words:{PB3866:['500','250','2,000','2000','five hundred','5 hundred','half a thousand','٥٠٠','５００','500.0'],'12108-BDL':['50','20','100','fifty','twenty','5 dozen','٥٠']},
  };
  const FORMS=[
    '{C} size {N}','{C} size: {N}','std {C} size {N}','{C} qty {N}','{C} count {N}','{C} quantity {N}',
    '{N} {P} to a {C}','{N} {P} to the {C}','{N} {P} in a {C}','{N} {P} in each {C}','{N} {P} a {C}','{N} {P} per {C}','{N} {P}/{C}','{N} {P} each {C}','{N} {P} every {C}','{N} {P} inside each {C}','{N} {P} for each {C}','{N} {P} by the {C}',
    '{C} of {N}','{C}s of {N} {P}','{N}-{P} {C}','({N} {P}/{C})','{C}: {N}','{C} = {N}','{C} contains {N}','{C} holds {N} {P}','{C} w/ {N}','{C} with {N} {P}',
    '{N}/{C}','{N} per {C}','{C} pk {N}','packaged {N}','packed {N} per','{N}s','{N}\'s','in {C}s of {N}','{C} - {N}','{N}pc/{C}','{C}/{N}','{C}#{N}','{C} # {N}','{C} no. {N}','{C} {N}','{N} {C}','{N} {P}','{N} {P} x','{N} x','{N}x','{N} ×','{N} {P} @ {C}','@ {N}/{C}','{C} @ {N}','sold by the {C} ({N})','{C} ct {N}','{C} lot of {N}','lots of {N}','{N} per','{N} ea.','{N}pk','{N}-pack','{N} pack','{C}={N}','{N} in {C}','{N} in','{N}#','#{N}','sz {N}','size {N}','{C} sz {N}','{C} style {N}','{C} type {N}','{N} high','{N} long','{N} per {C} (approx)','~{N}/{C}','{N}+ per {C}','min {N}/{C}','{N} {P} per {C} min',
  ];
  it.each(['digits','words'] as const)('%s: every generated line flags, scripted and live',mode=>{
    const r=rng(mode==='digits'?7:11);
    const pick=<T,>(a:readonly T[])=>a[Math.floor(r()*a.length)];
    const silent:string[]=[];
    let total=0;
    for(const it of [PB,BX])for(const form of FORMS)for(let k=0;k<6;k++){
      const C=pick(it.C),P=pick(it.P),N=pick(NUMBERS[mode][it.sku]),Q=pick(it.Q),D=pick(it.desc);
      const phrase=form.replace('{C}',C).replace('{P}',P).replace('{N}',N).replace(/\s+/g,' ').trim();
      const raw=r()<0.5?`${D} ${phrase}${Q.t}`:`${D}${Q.t}, ${phrase}`;
      for(const ov of [{},{description:`${D} ${phrase}`,quantity:Q.q,unit:Q.u},{description:D,quantity:Q.q,unit:Q.u}] as Override[]){
        total++;
        const result=run(raw,it.sku,ov);
        if(!flagged(result))silent.push(`${it.sku} ${JSON.stringify(raw)} ${JSON.stringify(ov)} -> ${JSON.stringify(result)}`);
      }
    }
    expect(total).toBeGreaterThan(2500);
    expect(silent).toEqual([]);
  });
});


type Kind='case'|'bundle'|'roll'|'box'|'pack'|'pallet';
const PACK_TEMPLATES:((n:string,word:string,kind:Kind)=>string)[]=[
  (n,w)=>`${n}/${w}`,(n,w)=>`${n} / ${w}`,(n,w)=>`${n} per ${w}`,(n,w)=>`${n} pcs/${w}`,(n,w)=>`${n} pcs per ${w}`,
  (n,w)=>`${w} of ${n}`,(n,w)=>`${w} of ${n} pcs`,(n,w)=>`${n} a ${w}`,(n,w)=>`${n}per ${w}`,(n,w)=>`${n} ea/${w}`,
  (n,w)=>`${w}/${n}`,(n,w)=>`${w} qty ${n}`,(n,w)=>`${w} (${n})`,(n,w)=>`${w}: ${n}`,(n,w)=>`${n}-ct ${w}`,(n,w)=>`${n} count ${w}`,
  (n,w)=>`${w} pack ${n}`,(n,w)=>`${n} in a ${w}`,(n,w)=>`${n} per master ${w}`,(n,w)=>`${w}=${n}`,(n,w)=>`(${n}/${w})`,(n,w)=>`${n}⁄${w}`,
  (n,w)=>`${n} pc. per ${w}`,(n,w)=>`${n} ${w}`,(n,w)=>`${w} ${n}`,(n,w)=>`${n} pcs. per ${w}.`,(n,w)=>`${n} to the ${w}`,
  (n,w)=>`${n}'s ${w}`,(n,w)=>`x${n} ${w}`,(n,w)=>`${n} ct ${w}`,(n,w)=>`${w} ${n} ct`,(n,w)=>`${n} in ${w}`,(n,w)=>`${n} pcs in each ${w}`,
  (n,w)=>`${w} - ${n} pcs`,(n,w)=>`${n} bags/${w}`,(n,w)=>`${w}s of ${n}`,(n,w)=>`${n}${w}`,
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
  it('holds for 1,500 random lines (quantity phrase x 0 to 2 pack phrases x item), through the scripted parser',()=>{
    const r=rng(20261016);
    let converted=0,checked=0;
    for(let n=0;n<1500;n++){
      const item=pick(ITEMS,r);
      const packs:{count:number;kind:Kind}[]=[];
      const phrases:string[]=[];
      const howMany=r()<0.3?0:r()<0.85?1:2;
      for(let k=0;k<howMany;k++){
        const own=item.own&&r()<0.5?item.own:{count:pick(COUNTS,r),kind:pick(Object.keys(WORDS) as Kind[],r)};
        packs.push(own);
        phrases.push(pick(PACK_TEMPLATES,r)(fmt(own.count,r),pick(WORDS[own.kind],r),own.kind));
      }
      const quantity=pick(QUANTITIES,r)(r);
      const raw=r()<0.7?`${item.product} ${phrases.join(' ')}, ${quantity}`:`${quantity} ${item.product} ${phrases.join(' ')}`;
      const result=run(raw,item.sku);
      if(flagged(result)){checked++;continue;}
      converted++;
      const ok=packs.length===0||(item.own!==null&&packs.every(p=>p.count===item.own!.count&&p.kind===item.own!.kind));
      expect(ok,`${raw} on ${item.sku} -> ${JSON.stringify(result)}`).toBe(true);
    }
    expect(converted).toBeGreaterThan(20);
    expect(checked).toBeGreaterThan(500);
  });

  it('never converts a line that states two different packs, whatever they are',()=>{
    const r=rng(7);
    for(let n=0;n<300;n++){
      const item=pick(ITEMS.filter(i=>i.own),r);
      const own=item.own!;
      const other={count:pick(COUNTS.filter(c=>c!==own.count),r),kind:pick(Object.keys(WORDS) as Kind[],r)};
      const a=`${fmt(own.count,r)}/${pick(WORDS[own.kind],r)}`,b=pick(PACK_TEMPLATES,r)(fmt(other.count,r),pick(WORDS[other.kind],r),other.kind);
      const raw=`${item.product} ${r()<0.5?`${a} ${b}`:`${b} ${a}`}, ${pick(QUANTITIES,r)(r)}`;
      expect(flagged(run(raw,item.sku)),raw).toBe(true);
    }
  });
});
