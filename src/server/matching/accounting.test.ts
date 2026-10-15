import {describe,expect,it} from 'vitest';
import {matchConfig} from '@/features/settings/strictness';
import {parseSpec} from './packaging';
import {scorePackaging} from './score-packaging';
import {retrieve} from './retrieve';
import {decide} from './decide';

// Total accounting (BOXT task B3b). At Strict a line is matched only when every token of it is
// consumed by exactly one recognised field and the item confirms each of them: the product noun (from
// the item's description), one size tuple, one value per attribute, the pack count, and qualifiers the
// item states. Anything else makes the line not Strict-eligible; `blockers` says why, for the rep.

const BOX_KW='bulk boxes cardboard boxes corrugated boxes rsc boxes shipping boxes wholesale boxes';
const BAG_KW='clear poly bags plastic bags poly bags reclosable bags resealable bags zip lock bags';
const CATALOG=[
  {sku:'12108-BDL',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:BOX_KW},
  {sku:'12108-PLT',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, pallet pricing',pack:'Each',caseQty:25,category:'boxes',keywords:BOX_KW},
  {sku:'12106-BDL',description:'Corrugated Boxes 12x10x6", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:BOX_KW},
  {sku:'121010-BDL',description:'Corrugated Boxes 12x10x10", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:BOX_KW},
  {sku:'RTC61',description:'Kraft Folding Cartons, 4x4x4"',pack:'Case',caseQty:1,category:'boxes',keywords:'folding cartons kraft cartons retail boxes retail packaging reverse tuck cartons'},
  {sku:'PB3565',description:'Reclosable Poly Bags, 4x6" 2 MIL',pack:'Case of 1,000',caseQty:1,category:'bags',keywords:BAG_KW},
  {sku:'PB3710',description:'Reclosable Poly Bags, 4x6" 4 MIL',pack:'Case of 1,000',caseQty:1,category:'bags',keywords:BAG_KW},
  {sku:'PB3600',description:'Reclosable Poly Bags, 6x4" 2 MIL',pack:'Case of 1,000',caseQty:1,category:'bags',keywords:BAG_KW},
  {sku:'PB3776',description:'Reclosable Poly Bags, 10x13" 4 MIL',pack:'Case of 500',caseQty:1,category:'bags',keywords:BAG_KW},
  {sku:'B855SS',description:'#2 Kraft Bubble Mailers 8.5x12"',pack:'Case of 100',caseQty:1,category:'mailers',keywords:'brown bubble mailers kraft bubble mailers natural bubble mailers paper bubble mailers'},
  {sku:'B858SS',description:'#5 Kraft Bubble Mailers 10.5x16"',pack:'Case of 100',caseQty:1,category:'mailers',keywords:'brown bubble mailers kraft bubble mailers natural bubble mailers paper bubble mailers'},
  {sku:'T902700',description:'Clear Hot Melt Tape, Hand Length, 2"x110yd 1.9 MIL',pack:'Case of 36',caseQty:1,category:'tape',keywords:'carton sealing tape hand packing tape hot melt tape industrial tape packing tape shipping tape'},
  {sku:'T9077200',description:'Kraft Tape, #7200 72MMx450\'',pack:'Case of 10',caseQty:1,category:'tape',keywords:'gummed tape kraft tape paper tape wat water activated tape'},
  {sku:'PS2215',description:'Black Poly Strapping, Machine Length, 0.5"x9000\' 300 lbs Black 8x8" Core',pack:'Coil',caseQty:1,category:'tape',keywords:'8x8 core 9x8 core machine grade strapping machine strapping pallet strapping poly strapping polypropylene strapping strapping'},
  {sku:'SF188CAST',description:'Cast Stretch Wrap, Hand Length, 18"x1500\' 80 Gauge',pack:'Case of 4',caseQty:1,category:'stretch-wrap',keywords:'cast stretch film hand pallet wrap hand stretch wrap pallet wrap stretch film stretch wrap clear'},
  {sku:'BW12S12P',description:'Bubble Rolls, 1/2" Bubble 12"x250\' Perforated 12"',pack:'Roll',caseQty:1,category:'cushioning',keywords:'bubble rolls bubble wrap cushioning protective packaging shipping cushioning'},
  {sku:'EP2248160BX',description:'Edge Protectors, Cased, 2x2x48" .160',pack:'Case of 80',caseQty:1,category:'storage',keywords:'corner protectors edge protectors pallet corner protectors pallet protectors'},
  {sku:'T2436J',description:'White Tissue Paper Sheets, 24x36"',pack:'Case of 960',caseQty:1,category:'paper',keywords:'e-commerce packaging eco packaging kraft tissue paper packing paper tissue paper unboxing white tissue paper wrapping paper'},
];
const STRICT=matchConfig('strict');
const BALANCED=matchConfig('balanced');
const blockers=(line:string)=>parseSpec(line).blockers;
const top=(line:string)=>scorePackaging(line,CATALOG)[0];
const strictTop=(line:string)=>{const t=top(line);return {sku:t?.item.sku,eligible:t?.eligibility.strictEligible,blockers:t?.eligibility.blockers??[]};};
const strictMatch=(line:string)=>{const r=retrieve(line,CATALOG,STRICT);const d=decide(r,{sku:r.top?.item.sku??null});return d.outcome==='matched'?d.item.sku:null;};

describe('total accounting: a clean line is Strict-eligible',()=>{
  it.each([
    ['12 x 10 x 8" Corrugated Boxes 200 lb test 25/bundle','12108-BDL'],
    ['Corrugated Boxes 12-10-8 200# test','12108-BDL'],
    ['Corrugated Boxes 12" L x 10" W x 8" H, 32 ECT','12108-BDL'],
    ['Reclosable Bags 4 x 6", 2 Mil, 1,000/case','PB3565'],
    ['Kraft Bubble Mailers #2 8 1/2 x 12" 100/case','B855SS'],
    ['Uline Industrial Tape 2" x 110 yds 1.9 Mil Clear Hot Melt 36 rolls/case','T902700'],
    ['Black Poly Strapping Machine Length 1/2" x 9000\' 300 lb 8x8 Core','PS2215'],
    ['Corrugated Boxes 12＂x10＂x8＂ 32 ECT','12108-BDL'],
  ])('"%s" has no blockers and matches %s',(line,sku)=>{
    expect(blockers(line)).toEqual([]);
    expect(strictTop(line)).toEqual({sku,eligible:true,blockers:[]});
    expect(strictMatch(line)).toBe(sku);
  });
});

describe('total accounting: no meaning is dropped as filler',()=>{
  it.each([
    ['Box for 12x10x8 item',['for','item']],
    ['Bubble mailers to fit 8.5 x 12 items, #2 kraft',['to','fit','item']],
    ['Shipping Boxes 12x10x8 Style A',['style','a']],
    ['Corrugated Boxes 12x10x8 approx',['approx']],
    ['Corrugated Boxes 12x10x8 each',['each']],
    ['Corrugated Boxes 12x10x8 assorted',['assorted']],
    ['Corrugated Boxes 12x10x8 outside dimensions',['outside']],
  ])('"%s" is not Strict-eligible: %j',(line,words)=>{
    const said=blockers(line).join(' | ');
    for(const word of words)expect(said).toContain(`"${word}"`);
    expect(strictMatch(line)).toBeNull();
  });

  it('blocks on symbols that join two things (+, &, /) and on numbers, letters and units nothing read',()=>{
    expect(blockers('12x10x8" Corrugated Boxes + 8" x 10" x 12"').join(' ')).toContain('"+"');
    expect(blockers('Corrugated Boxes 12x10x8 & Tape').join(' ')).toContain('"&"');
    expect(blockers('Cast Stretch Wrap Hand Length 18" x 1500 ft 80 ga / 70 ga').join(' ')).toContain('"/"');
    expect(blockers('Corrugated Boxes 12108 12 x 10 x 8"').join(' ')).toContain('12108');
    expect(blockers('Clear Packing Tape half inch x 110 yd').join(' ')).toMatch(/"half".*"inch"|"inch".*"half"/);
    expect(blockers('Corrugated Boxes 12x10x8 2 ply').join(' ')).toContain('2');
  });

  it('reads "200# test" whole: the "test" belongs to the burst rating',()=>{
    expect(blockers('Corrugated Boxes 12-10-8 200# test')).toEqual([]);
  });
});

describe('total accounting: one value per field',()=>{
  it.each([
    ['Corrugated Boxes 12x10x8" to 12x10x10"','size'],
    ['Corrugated Boxes 12x10x8" or 12x10x10"','size'],
    ['Reclosable Bags 4 x 6" and 6" x 4" 2 Mil','size'],
    ['#2 and #5 Kraft Bubble Mailers 8 1/2 x 12"','number'],
    ['Reclosable Bags 4 x 6" 2 Mil or 4 Mil','mil'],
    ['Corrugated Boxes 12x10x8 32 ECT or 44 ECT','ECT'],
    ['Corrugated Boxes 12x10x8 32 ECT 275 lb test','strength'],
    ['Cast Stretch Wrap Hand Length 18" x 1500 ft 80 ga / 70 ga','gauge'],
    ['Reclosable Bags 4 x 6" 2 Mil Open Top','closure'],
    ['Reclosable Bags 4x6 2 mil Self Seal','closure'],
    ['Hot Melt or Acrylic Tape 2" x 110 yds 1.9 Mil Clear','adhesive'],
    ['Hand Stretch Film blown 18" x 1000 ft 120 Gauge, machine grade','length'],
    ['Cast Stretch Film 18" x 1500 ft 80 Gauge Hand, Blown','film'],
    ['Direct Thermal Desktop Labels 4 x 6" White, Thermal Transfer','print'],
    ['Corrugated Boxes 12x10x8 25/bundle 20/bundle','pack'],
  ])('"%s" states two values of %s',(line,field)=>{
    expect(blockers(line).join(' | ')).toContain(field);
    expect(strictMatch(line)).toBeNull();
  });

  it('accepts a burst rating that is the stated ECT\'s equivalent',()=>{
    expect(blockers('Corrugated Boxes 12x10x8 32 ECT 200 lb test')).toEqual([]);
    expect(strictMatch('Corrugated Boxes 12x10x8 32 ECT 200 lb test')).toBe('12108-BDL');
  });

  it('contradicts at every level when the item has one of two stated values (so Balanced cannot match it either)',()=>{
    for(const line of ['Reclosable Bags 4 x 6" 2 Mil or 4 Mil','Corrugated Boxes 12x10x8 32 ECT or 44 ECT','Corrugated Boxes 12x10x8 32 ECT 275 lb test',
      'Reclosable Bags 4 x 6" 2 Mil Open Top','#2 and #5 Kraft Bubble Mailers 8 1/2 x 12"','Corrugated Boxes 12x10x8" or 12x10x10"']){
      expect(scorePackaging(line,CATALOG).every(c=>c.score<=0.5),line).toBe(true);
    }
  });
});

describe('total accounting: dimensions by position, labels in the catalog\'s order for the category',()=>{
  it.each([
    ['Reclosable Bags 4" W x 6" L 2 Mil','PB3565'],
    ['Reclosable Bags 6 x 4" (W x L) 2 Mil','PB3600'],
    ['Reclosable Bags 4" wide x 6" long 2 Mil','PB3565'],
    ['Reclosable Bags 2 Mil, 4" width x 6" length','PB3565'],
    ['Corrugated Boxes 10 in. W x 12 in. L x 8 in. D','12108-BDL'],
    ['Corrugated Boxes 12" long x 10" wide x 8" high','12108-BDL'],
  ])('bags are W x L and boxes L x W x H: "%s" is %s',(line,sku)=>{
    expect(strictTop(line)).toEqual({sku,eligible:true,blockers:[]});
    expect(strictMatch(line)).toBe(sku);
  });

  it('never matches the other orientation, at any level',()=>{
    for(const level of [STRICT,BALANCED]){
      const r=retrieve('Reclosable Bags 4" W x 6" L 2 Mil',CATALOG,level);
      expect(decide(r,{sku:'PB3600'}).outcome).toBe('no_match');
    }
  });

  it('a labelled size outside the tuple must agree with that position, and is never Strict-eligible',()=>{
    expect(blockers('Corrugated Boxes 12x10x8, 12" deep').join(' ')).toContain('outside');
    expect(top('Corrugated Boxes 12x10x8, 12" deep')!.conflicts.join(' ')).toContain('12');
    expect(scorePackaging('Reclosable Bags 10 x 13" 4 Mil, 13" wide',CATALOG).every(c=>c.score<=0.5)).toBe(true);
    expect(strictMatch('Corrugated Boxes 12x10x8, 12" deep')).toBeNull();
  });

  it('a partly labelled tuple, or labels on a product whose order is unknown, is not Strict-eligible',()=>{
    expect(blockers('Corrugated Boxes 12 x 10 x 8" H').join(' ')).toContain('label');
    expect(strictTop('Edge Protectors 2" W x 2" W x 48" L').eligible).toBe(false);
  });

  it('a loose measure is confirmed by an item measure only, never by a dimension',()=>{
    expect(strictTop('Corrugated Boxes 12x10x8 12"').eligible).toBe(false);
    expect(strictTop('Edge Protectors 2 x 2 x 48" .160"')).toEqual({sku:'EP2248160BX',eligible:true,blockers:[]});
    expect(strictTop('Bubble Wrap 1/2" x 12" x 250\' Perforated')).toEqual({sku:'BW12S12P',eligible:true,blockers:[]});
  });
});

describe('total accounting: claims are confirmed, never assumed',()=>{
  it.each(['BPA-Free Reclosable Bags 4 x 6" 2 Mil','Acid-Free White Tissue Paper Sheets 24 x 36"','Non-Toxic Reclosable Bags 4 x 6" 2 Mil',
    'Lead Free Corrugated Boxes 12x10x8','Reclosable Bags 4 x 6" 2 Mil, Not Printed'])('"%s": the item never states it, so the line is not Strict-eligible',line=>{
    const t=strictTop(line);
    expect(t.eligible).toBe(false);
    expect(t.blockers.join(' ')).toMatch(/not:/);
    expect(strictMatch(line)).toBeNull();
  });

  it('a negated closure is confirmed when the item states a different closure',()=>{
    const bubble=[{sku:'BOB912F',description:'Bubble Pouches, Flush Cut, 9x12"',pack:'Case of 350',caseQty:1,category:'bags',keywords:'bubble bags bubble pouches'}];
    const [c]=scorePackaging('Bubble Pouches 9 x 12" Flush Cut, No Zipper',bubble);
    expect(c.eligibility).toEqual({strictEligible:true,blockers:[]});
  });

  it('a stated pack count needs the item\'s count: a bare "Case" is not a confirmation',()=>{
    const t=strictTop('Kraft Folding Cartons 4 x 4 x 4" 500 per case');
    expect(t.sku).toBe('RTC61');
    expect(t.eligible).toBe(false);
    expect(t.blockers.join(' ')).toContain('pack');
    expect(strictTop('Kraft Folding Cartons 4 x 4 x 4"')).toEqual({sku:'RTC61',eligible:true,blockers:[]});
  });
});

describe('total accounting: the product noun comes from the item\'s description',()=>{
  it('a keyword cannot confirm the product noun ("paper" is a Kraft Tape keyword, not its description)',()=>{
    const t=strictTop('Kraft Paper 72mm x 450 ft');
    expect(t.sku).toBe('T9077200');
    expect(t.eligible).toBe(false);
    expect(t.blockers.join(' ')).toContain('paper');
    expect(strictMatch('Kraft Paper 72mm x 450 ft')).toBeNull();
    expect(strictMatch('Kraft Tape 72mm x 450\'')).toBe('T9077200');
    expect(strictMatch('Kraft Paper Tape 72mm x 450\'')).toBe('T9077200');
  });

  it('accepts the documented synonyms: bubble wrap is a bubble roll, stretch film is stretch wrap, an RSC is a box',()=>{
    expect(strictMatch('Bubble Wrap 1/2" x 12" x 250\' Perforated')).toBe('BW12S12P');
    expect(strictMatch('Cast Hand Stretch Film 18" x 1500\' 80 Gauge')).toBe('SF188CAST');
    expect(strictMatch('RSC 12x10x8 32 ECT')).toBe('12108-BDL');
  });

  it('a second product the item does not account for blocks the line',()=>{
    expect(strictTop('Corrugated Mailer Boxes 12 x 10 x 8"').eligible).toBe(false);
    expect(strictMatch('Corrugated Boxes 12 x 10 x 8" and Tape')).toBeNull();
  });
});

describe('total accounting: what retrieve and decide expose',()=>{
  it('Strict requires total accounting; Balanced and Lenient do not',()=>{
    expect(matchConfig('strict').requireTotalAccounting).toBe(true);
    expect(matchConfig('balanced').requireTotalAccounting).toBe(false);
    expect(matchConfig('lenient').requireTotalAccounting).toBe(false);
  });

  it('gives the rep the reasons, and decide says not_accounted',()=>{
    const r=retrieve('Box for 12x10x8 item',CATALOG,STRICT);
    expect(r.eligibility.strictEligible).toBe(false);
    expect(r.eligibility.blockers.join(' | ')).toContain('"for"');
    expect(r.clears).toBe(false);
    expect(decide(r,{sku:r.top!.item.sku})).toEqual({outcome:'no_match',reason:'not_accounted'});
  });

  it('a clean line clears Strict and reports itself eligible',()=>{
    const r=retrieve('Corrugated Boxes 12 x 10 x 8" 32 ECT',CATALOG,STRICT);
    expect(r.eligibility).toEqual({strictEligible:true,blockers:[]});
    expect(r.clears).toBe(true);
  });
});

describe('total accounting: what only keywords say, a second product, separators',()=>{
  const WHITE=[{sku:'1184W-BDL',description:'White Corrugated Boxes 11.25x8.75x4", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:'bulk boxes premium boxes white boxes white corrugated white shipping boxes'}];
  const DISPENSER=[{sku:'TDSS2',description:'Seal Safe Hand Tape Dispensers 2"',pack:'Each',caseQty:1,category:'tape',keywords:'carton sealer hand tape dispenser packing tape gun tape dispenser tape gun'}];

  it('takes a claim only the family\'s keywords make ("premium") as unconfirmed at Strict, but plain synonyms ("shipping") as confirmed',()=>{
    const [premium]=scorePackaging('Premium White Corrugated Boxes 11.25 x 8.75 x 4" 32 ECT',WHITE);
    expect(premium.score).toBe(1);
    expect(premium.eligibility.blockers.join(' ')).toContain('"premium"');
    const [shipping]=scorePackaging('White Corrugated Shipping Boxes 11.25 x 8.75 x 4" 32 ECT',WHITE);
    expect(shipping.eligibility).toEqual({strictEligible:true,blockers:[]});
  });

  it('reads "with" before a product as a second product, even when one item\'s description names both',()=>{
    expect(blockers('Packing Tape 2" with Dispenser').join(' ')).toContain('with dispenser');
    expect(scorePackaging('Packing Tape 2" with Dispenser',DISPENSER)[0].eligibility.strictEligible).toBe(false);
    expect(blockers('Kraft Bubble Mailers with Self Seal Strip').join(' ')).not.toContain('with');
  });

  it('a pack phrase may count pieces or rolls, or the line\'s own product, but not another product',()=>{
    expect(blockers('Reclosable Bags 4 x 6" 2 Mil 1000 labels/case').join(' ')).toContain('a pack of "label"');
    expect(blockers('Reclosable Bags 4 x 6" 2 Mil 1000 bags/case')).toEqual([]);
    expect(blockers('Clear Hot Melt Tape 2" x 110 yd 1.9 mil 36 rolls/case')).toEqual([]);
  });

  it('a spaced dash or bullet separates; an unspaced dash between numbers, or one unit on both sides, is a range',()=>{
    expect(blockers('Corrugated Boxes – 12 × 10 × 8″ – 32 ECT')).toEqual([]);
    expect(blockers('Corrugated Boxes 12x10x8 • 32 ECT • 25/bundle')).toEqual([]);
    expect(blockers('Kraft Paper Roll 36" x 900\' 40-50 lb')).toContain('a range');
    expect(blockers('Corrugated Boxes 12" - 14" x 10 x 8')).toContain('a range');
    expect(blockers('Mailers 12-1/4 x 9-1/4 x 4"')).toEqual([]);
  });
});

describe('total accounting: a thickness joined to the size with "x"',()=>{
  it('reads "4" x 6" x 2 mil" as a 4x6 bag of 2 mil, with nothing left over',()=>{
    expect(blockers('Reclosable Bags 4" x 6" x 2 mil')).toEqual([]);
    expect(parseSpec('Reclosable Bags 4x6x2mil').dims?.map(d=>d.value)).toEqual([4,6]);
    expect(strictMatch('Reclosable Bags 4" x 6" x 2 mil')).toBe('PB3565');
    // A bare third number is still a third dimension, which no 4x6 bag has.
    expect(parseSpec('Reclosable Bags 4x6x2').dims?.map(d=>d.value)).toEqual([4,6,2]);
    expect(strictMatch('Reclosable Bags 4x6x2')).toBeNull();
  });
});

// ---- B3b fix round 1 (verifier findings) --------------------------------------------------------
const ITEMS2=[
  {sku:'GAYLORDLID-BDL',description:'Gaylord Lid 48x40", bundle pricing',pack:'Each',caseQty:10,category:'boxes',keywords:'bulk containers gaylord boxes gaylord containers pallet boxes wholesale gaylords'},
  {sku:'GAYLORD-BDL',description:'Single Wall Gaylord 48x40x36", bundle pricing',pack:'Each',caseQty:1,category:'boxes',keywords:'bulk containers gaylord boxes gaylord containers pallet boxes wholesale gaylords'},
  {sku:'RM4SS',description:'White Flat Paper Mailers 12.75x15"',pack:'Case',caseQty:1,category:'mailers',keywords:'eco mailers flat mailers paper mailers rigid mailers'},
  {sku:'B705',description:'Padded Paper Mailers 10.5x15.25"',pack:'Case',caseQty:1,category:'mailers',keywords:'eco mailers padded mailers paper mailers recyclable mailers'},
  {sku:'TDSS2',description:'Seal Safe Hand Tape Dispensers 2"',pack:'Each',caseQty:1,category:'tape',keywords:'carton sealer hand tape dispenser packing tape gun tape dispenser tape gun'},
  {sku:'IQRT40',description:'Expandable Foam Bags, 18x24"',pack:'Case of 36',caseQty:1,category:'cushioning',keywords:'foam bags foam in bag foam in place'},
  {sku:'IQRT40B',description:'Expandable Foam Bags (Bulk Pack), 18x24"',pack:'Case of 112',caseQty:1,category:'cushioning',keywords:'foam bags foam in bag foam in place'},
  {sku:'IQRT60',description:'Expandable Foam Bags Extra Thick, 18x24"',pack:'Case of 36',caseQty:1,category:'cushioning',keywords:'foam bags foam in bag foam in place'},
  {sku:'IQRT60B',description:'Extra Thick (Bulk Pack) Expandable Foam Bags, 18x24"',pack:'Case of 112',caseQty:1,category:'cushioning',keywords:'foam bags foam in bag foam in place'},
  {sku:'EP2248160BX',description:'Edge Protectors, Cased, 2x2x48" .160',pack:'Case of 80',caseQty:1,category:'storage',keywords:'corner protectors edge protectors pallet corner protectors pallet protectors'},
  {sku:'INM1822',description:'Thermal Mailers 22x18"',pack:'Case of 100',caseQty:1,category:'mailers',keywords:'cold chain mailers insulated mailers temperature mailers thermal bubble mailers thermal mailers'},
  {sku:'PS3227',description:'Black Poly Strapping, Machine Length, 0.5"x6600\' 500 lbs Black 9x8" Core',pack:'Coil',caseQty:1,category:'tape',keywords:'machine strapping poly strapping'},
  ...CATALOG,
];
const eligibleTop=(line:string)=>{const t=scorePackaging(line,ITEMS2)[0];return t?{sku:t.item.sku,score:t.score,eligible:t.eligibility.strictEligible,blockers:t.eligibility.blockers}:null;};
const strict2=(line:string)=>{const r=retrieve(line,ITEMS2,STRICT);const d=decide(r,{sku:r.top?.item.sku??null});return d.outcome==='matched'?d.item.sku:null;};

describe('fix round 1: the item\'s own product noun and description words must be accounted for',()=>{
  it.each(['Gaylord Boxes 48 x 40','Gaylord 48x40"','Gaylords 48x40"','Gaylord 48x40" bundle of 10','White Paper 12.75" x 15"','Padded Paper 10.5 x 15.25"',
    'Seal Safe Hand Tape, 2 inch','Pallet Protectors 2x2x48"'])('"%s" does not name what the item is: never Strict',line=>{
    expect(strict2(line)).toBeNull();
    const t=eligibleTop(line);
    if(t)expect(t.eligible).toBe(false);
  });

  it('names the head noun the item is (a lid, mailers, a dispenser)',()=>{
    expect(eligibleTop('Gaylord 48x40"')!.blockers.join(' ')).toMatch(/"lid"/);
    expect(eligibleTop('White Paper 12.75" x 15"')!.blockers.join(' ')).toMatch(/"mailer"/);
    expect(eligibleTop('Seal Safe Hand Tape, 2 inch')!.blockers.join(' ')).toMatch(/"dispenser"/);
  });

  it('charges a description word the line leaves out ("Extra Thick", "Bulk Pack"), so the plain item leads',()=>{
    const scored=Object.fromEntries(scorePackaging('Expandable Foam Bags 18 x 24"',ITEMS2).map(c=>[c.item.sku,c.score]));
    expect(scored.IQRT40).toBe(1);
    expect(scored.IQRT40B).toBeLessThan(1);
    expect(scored.IQRT60B).toBeLessThan(scored.IQRT40B);
    expect(strict2('Expandable Foam Bags 18 x 24"')).toBe('IQRT40');
    expect(strict2('Expandable Foam Bags Extra Thick (Bulk Pack) 18 x 24"')).toBe('IQRT60B');
  });

  it('keeps lines that name the item in other words: a material left unsaid, corner protectors, the head by its stand-in',()=>{
    expect(strict2('Edge Protectors 2 x 2 x 48" .160"')).toBe('EP2248160BX');
    expect(strict2('Corner Protectors 2" x 2" x 48" .160"')).toBe('EP2248160BX');
    expect(strict2('Single Wall Gaylord Box 48 x 40 x 36"')).toBe('GAYLORD-BDL');
    expect(strict2('Gaylord Lid 48 x 40"')).toBe('GAYLORDLID-BDL');
    expect(strict2('Bubble Wrap 1/2" x 12" x 250\' Perforated')).toBe('BW12S12P');
  });

  it('a labelled size on a mailer listed wider than long is not placed (the order is unknown)',()=>{
    expect(eligibleTop('Thermal Mailers 18" L x 22" W')!.eligible).toBe(false);
  });
});

describe('fix round 1: sizes in one unit compare exactly; only a conversion has a tolerance',()=>{
  it.each(['Corrugated Boxes 12.05 x 10 x 8"','Corrugated Boxes 12 x 10.04 x 8"','Reclosable Poly Bags 4 x 6.03" 2 mil'])('"%s" is not the item',line=>{
    expect(strict2(line)).toBeNull();
    expect(scorePackaging(line,ITEMS2).every(c=>c.score<=0.5)).toBe(true);
  });
  it('0.5" x 6630\' strapping is not the 6600\' coil',()=>{
    expect(strict2('Poly Strapping, Machine Length, 0.5" x 6630\' 500 lbs Black 9x8" Core')).toBeNull();
  });
  it('a metric size that is a standard imperial size, to the nearest whole unit, still matches (within 0.2%)',()=>{
    expect(strict2('Corrugated Boxes 305 x 254 x 203 mm')).toBe('12108-BDL');
    expect(strict2('Corrugated Boxes 12x10x8.0"')).toBe('12108-BDL');
    expect(strict2('Corrugated Boxes 12 1/2 x 10 x 8"')).toBeNull();
  });
  it('2 mil is 50.8 micron, not 51',()=>{
    expect(scorePackaging('Reclosable Poly Bags 4 x 6" 50.8 micron',ITEMS2)[0].item.sku).toBe('PB3565');
    expect(strict2('Reclosable Poly Bags 4 x 6" 51 micron')).toBeNull();
  });
});

describe('fix round 1: only proper fractions are numbers',()=>{
  it.each(['Corrugated Boxes 12x10x16/2"','Corrugated Boxes 12x10x8/1"','Corrugated Boxes 12x10x8 1/0"','Reclosable Bags 4 x 6" 4/2 Mil'])('"%s" is blocked',line=>{
    expect(blockers(line).join(' ')).toMatch(/fraction/);
    expect(strict2(line)).toBeNull();
  });
  it('mixed numbers still read',()=>{
    expect(parseSpec('Mailers 8 1/2 x 12"').dims?.map(d=>d.value)).toEqual([8.5,12]);
    expect(parseSpec('Mailers 8-1/2 x 12"').dims?.map(d=>d.value)).toEqual([8.5,12]);
  });
});

describe('fix round 1: no shared state between calls, and bounded work per line',()=>{
  it('returns fresh candidates: mutating one result never changes the next',()=>{
    const a=scorePackaging('Corrugated Boxes 12 x 10 x 8" 32 ECT',CATALOG);
    a[0].score=0;a[0].eligibility.blockers.push('tampered');a.length=0;
    const b=scorePackaging('Corrugated Boxes 12 x 10 x 8" 32 ECT',CATALOG);
    expect(b[0].score).toBe(1);
    expect(b[0].eligibility.blockers).toEqual([]);
  });
  it('re-reads a catalog row edited in place',()=>{
    const rows=[{...CATALOG[0]}];
    expect(scorePackaging('Corrugated Boxes 12 x 10 x 8" 32 ECT',rows)[0].score).toBe(1);
    rows[0].description='Corrugated Boxes 12x10x6", 32 ECT single wall, bundle pricing';
    expect(scorePackaging('Corrugated Boxes 12 x 10 x 8" 32 ECT',rows)[0]?.score??0).toBeLessThanOrEqual(0.5);
  });
  it('blocks a line over 500 characters or a number over 12 digits, quickly',()=>{
    const long=`Corrugated Boxes 12 x 10 x 8" ${'kraft '.repeat(100)}`;
    expect(blockers(long).join(' ')).toMatch(/too long/);
    expect(blockers(`Corrugated Boxes ${'1'.repeat(20)} x 10 x 8"`).join(' ')).toMatch(/too long/);
    const t=performance.now();
    for(const line of ['1'.repeat(20000)+' boxes','2 '.repeat(5000)+'boxes','12x'.repeat(3000)+'8 boxes','1/'.repeat(5000)+'2 boxes','1'+',000'.repeat(3000)+' boxes',
      '1'.repeat(499)+' boxes','12x'.repeat(160)+'8 boxes','1 x '.repeat(120)+'boxes','no '.repeat(160)+'boxes'])retrieve(line,CATALOG,STRICT);
    expect(performance.now()-t).toBeLessThan(1500);
  });
});
