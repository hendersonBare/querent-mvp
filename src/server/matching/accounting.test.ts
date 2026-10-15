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
    ['Uline Industrial Tape 2" x 110 yds 1.9 Mil Clear Hot Melt Hand Length 36 rolls/case','T902700'],
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
    // B3b fix 2: the item's #7200 must be said too.
    expect(strictMatch('Kraft Tape #7200 72mm x 450\'')).toBe('T9077200');
    expect(strictMatch('Kraft Paper Tape #7200 72mm x 450\'')).toBe('T9077200');
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

describe('fix round 1: a micron value is a second mil unless it converts within the tolerance',()=>{
  it('"2 Mil 51 micron" states two thicknesses; "2 Mil 50.8 micron" one',()=>{
    expect(blockers('Reclosable Poly Bags 4" x 6" 2 Mil 51 micron').join(' ')).toMatch(/two mil values/);
    expect(blockers('Reclosable Poly Bags 4" x 6" 2 Mil 50.8 micron')).toEqual([]);
  });
});

// ---- B3b fix round 2: what the item states, the line must state ---------------------------------
const ITEMS3=[
  {sku:'PS5826',description:'Black Poly Strapping, Hand Length, 0.625 800 lbs',pack:'Coil',caseQty:1,category:'tape',keywords:'hand strapping poly strapping'},
  {sku:'PS3818',description:'Poly Strapping, Machine Length, 0.375"x12900\' 250 lbs White 9x8" Core',pack:'Coil',caseQty:1,category:'tape',keywords:'machine strapping poly strapping'},
  {sku:'SF189',description:'Blown Stretch Wrap, Hand Length, 18"x1500\' 90 Gauge',pack:'Case of 4',caseQty:1,category:'stretch-wrap',keywords:'blown stretch wrap hand stretch wrap stretch film clear'},
  {sku:'MSF2060B',description:'Blown Stretch Wrap, Machine Length, 20"x7500\' 60 Gauge',pack:'Roll',caseQty:1,category:'stretch-wrap',keywords:'blown stretch film machine stretch wrap clear'},
  {sku:'DL1082',description:'Fragile Labels 3x5"',pack:'Case of 500',caseQty:1,category:'labels',keywords:'fragile labels shipping labels'},
  {sku:'THD114',description:'White Direct Thermal Labels, Desktop, 4x6"',pack:'Case of 3,000',caseQty:1,category:'labels',keywords:'desktop labels direct thermal labels'},
  {sku:'NP4890',description:'Newsprint Rolls, 48"x1440\'',pack:'Roll',caseQty:1,category:'paper',keywords:'newsprint rolls packing paper'},
  {sku:'SP48',description:'Corrugated Sheets 48x48"',pack:'Each',caseQty:1,category:'boxes',keywords:'corrugated pads slip sheets'},
  {sku:'B873',description:'#3 Flat Poly Mailers 9x12"',pack:'Case of 1,000',caseQty:1,category:'mailers',keywords:'flat poly mailers poly mailers'},
  {sku:'B831',description:'#0 Poly Bubble Mailers 6.5x10"',pack:'Case of 250',caseQty:1,category:'mailers',keywords:'bubble mailers poly bubble mailers'},
  {sku:'T903700',description:'Clear Hot Melt Tape, Machine Length, 2"x1000yd 1.9 MIL',pack:'Case of 6',caseQty:1,category:'tape',keywords:'machine tape'},
  {sku:'T9077700',description:'Kraft Tape, #7700 3"x450\'',pack:'Case of 10',caseQty:1,category:'tape',keywords:'kraft tape'},
  {sku:'CPW4840R2',description:'#2 Used Pallets, 48x40"',pack:'Each',caseQty:1,category:'storage',keywords:'used pallets'},
  ...ITEMS2,
];
const strict3=(line:string)=>{const r=retrieve(line,ITEMS3,STRICT);const d=decide(r,{sku:r.top?.item.sku??null});return d.outcome==='matched'?d.item.sku:null;};
const top3=(line:string)=>scorePackaging(line,ITEMS3)[0];

describe('fix round 2: a choice the item states must be stated by the line',()=>{
  it.each([
    ['Black Poly Strapping 5/8" 800 lb','PS5826','length'],
    ['White Poly Strapping 3/8" x 12900\' 250 lb 9x8 Core','PS3818','length'],
    ['Stretch Film 18" x 1500\' 90 Gauge','SF189','film'],
    ['Hand Stretch Film 18" x 1500\' 90 ga Clear','SF189','film'],
    ['Machine Stretch Film 20" x 7500\' 60 Gauge','MSF2060B','film'],
    ['White Desktop Labels 4 x 6"','THD114','print'],
    ['Clear Tape 2" x 110 yd 1.9 Mil','T902700','adhesive'],
  ])('"%s" leaves %s\'s %s unsaid: not Strict',(line,sku,what)=>{
    const t=top3(line);
    expect(t.item.sku).toBe(sku);
    expect(t.eligibility.strictEligible).toBe(false);
    expect(t.eligibility.blockers.join(' ')).toContain(what);
    expect(t.score).toBeLessThanOrEqual(0.75);
    expect(strict3(line)).toBeNull();
  });
  it('a line that states the choices still matches',()=>{
    expect(strict3('Black Poly Strapping Hand Length 5/8" 800 lb')).toBe('PS5826');
    expect(strict3('Blown Hand Stretch Wrap 18" x 1500\' 90 Gauge')).toBe('SF189');
    expect(strict3('Blown Machine Stretch Wrap 20" x 7500\' 60 Gauge')).toBe('MSF2060B');
  });
});

describe('fix round 2: the item\'s size, specs and kind must be stated',()=>{
  it.each([
    ['Fragile Labels','DL1082','size'],
    ['Newsprint Rolls 48"','NP4890','size'],
    ['Sheets 48 x 48"','SP48','material'],
    ['Flat Mailers 9 x 12"','B873','material'],
    ['Bubble Mailers #0 6 1/2 x 10"','B831','material'],
    ['Edge Protectors 2 x 2 x 48"','EP2248160BX','size'],
    ['Reclosable Bags 4 x 6"','PB3565','mil'],
    ['Kraft Tape 3" x 450\'','T9077700','number'],
    ['Used Pallets 48 x 40"','CPW4840R2','number'],
  ])('"%s" leaves %s\'s %s unsaid: not Strict',(line,sku,what)=>{
    const t=top3(line);
    expect(t.item.sku).toBe(sku);
    expect(t.eligibility.blockers.join(' ')).toContain(what);
    expect(strict3(line)).toBeNull();
  });
  it('counts the bubble size given in the tuple, and ignores the 12" perforation spacing every roll has',()=>{
    expect(top3('Bubble Wrap 1/2" x 12" x 250\' Perforated').eligibility).toEqual({strictEligible:true,blockers:[]});
  });
});

describe('fix round 2: no tolerance between yards, feet and inches',()=>{
  it.each(['Clear Hot Melt Tape Machine Length 2" x 2995\' 1.9 Mil','Clear Hot Melt Tape Hand Length 2" x 329.5\' 1.9 Mil'])('"%s" is not the tape',line=>{
    expect(strict3(line)).toBeNull();
  });
  it('3000\' is exactly 1000 yd, and 330\' exactly 110 yd',()=>{
    expect(strict3('Clear Hot Melt Tape Machine Length 2" x 3000\' 1.9 Mil')).toBe('T903700');
    expect(strict3('Clear Hot Melt Tape Hand Length 2" x 330\' 1.9 Mil')).toBe('T902700');
  });
});

describe('fix round 2: a colour shade is its own colour',()=>{
  it('reads "Deep Lavender" apart from "Lavender", and "Light Blue" apart from "Blue"',()=>{
    expect(parseSpec('#5 Colored Bubble Mailers 10.5x15.25", Deep Lavender').colors).toEqual(['deep lavender']);
    expect(parseSpec('#5 Lavender Colored Bubble Mailers').colors).toEqual(['lavender']);
    expect(parseSpec('Light Blue Mailers').colors).toEqual(['light blue']);
    const deep=[{sku:'AJ5DL',description:'#5 Colored Bubble Mailers 10.5x15.25", Deep Lavender',pack:'Case',caseQty:1,category:'mailers',keywords:'colored bubble mailers'}];
    expect(scorePackaging('#5 Lavender Colored Bubble Mailers 10 1/2 x 15 1/4"',deep)[0]?.score??0).toBeLessThanOrEqual(0.5);
    expect(scorePackaging('#5 Deep Lavender Colored Bubble Mailers 10 1/2 x 15 1/4"',deep)[0].eligibility.strictEligible).toBe(true);
  });
});

// ---- B3b final fix round: materials, half mils, explicit defaults, recall fixes ------------------
const ROWS4=[
  {sku:'FW14S12P',description:'Foam Rolls, 1/4" Foam 12"x250\' Perforated 12"',pack:'Roll',caseQty:1,category:'cushioning',keywords:'air foam foam packaging foam rolls protective foam surface protection foam'},
  {sku:'FW1448P',description:'Foam Rolls, 1/4" Foam 48"x250\' Perforated 12"',pack:'Roll',caseQty:1,category:'cushioning',keywords:'air foam foam packaging foam rolls protective foam surface protection foam'},
  {sku:'FW14S24P',description:'Foam Rolls, 1/4" Foam 24"x250\' Perforated 12"',pack:'Roll',caseQty:1,category:'cushioning',keywords:'air foam foam packaging foam rolls protective foam surface protection foam'},
  {sku:'IQRT20',description:'Expandable Foam Bags, 18x18"',pack:'Case of 36',caseQty:1,category:'cushioning',keywords:'foam bags foam in bag foam in place instapak instapak quick protective foam'},
  {sku:'PS1231',description:'Black Poly Strapping, Hand Length, 0.5 600 lbs',pack:'Coil',caseQty:1,category:'tape',keywords:'carton strapping hand strapping pallet strapping poly strapping polypropylene strapping strapping void fill'},
  {sku:'GL484048-BDL',description:'Single Wall Gaylord 48x40x48", bundle pricing',pack:'Each',caseQty:1,category:'boxes',keywords:'bulk containers gaylord boxes gaylord containers pallet boxes wholesale gaylords'},
  {sku:'GL484048DW',description:'Double Wall Gaylord 48x40x48"',pack:'Each',caseQty:5,category:'boxes',keywords:'bulk containers gaylord boxes gaylord containers pallet boxes wholesale gaylords'},
  {sku:'AJ5R',description:'#5 Colored Bubble Mailers 10.5x15.25"',pack:'Case',caseQty:1,category:'mailers',keywords:'brand mailers color mailers colored bubble mailers colored mailer bags colored packaging mailers'},
  {sku:'AJ5B',description:'#5 Colored Bubble Mailers 10.5x15.25", Blue',pack:'Case',caseQty:1,category:'mailers',keywords:'blue mailers brand mailers color mailers colored bubble mailers'},
  {sku:'SP4048DW',description:'Heavyweight 48-ECT Double Wall Sheets 48x40"',pack:'Each',caseQty:5,category:'boxes',keywords:'corrugated pads corrugated sheets layer pads pallet pads slip sheets'},
  {sku:'SP40',description:'Standard 32-ECT Sheets 48x40"',pack:'Each',caseQty:5,category:'boxes',keywords:'corrugated pads corrugated sheets layer pads pallet pads slip sheets'},
  {sku:'MSF2080BLUE',description:'Cast Stretch Wrap, Machine Length, Colors 20"x6000\' 80 Gauge, Blue',pack:'Roll',caseQty:1,category:'stretch-wrap',keywords:'cast stretch film colored pallet wrap colored stretch wrap machine stretch wrap'},
  {sku:'PB3615',description:'Reclosable Poly Bags, 6x9" 2 MIL',pack:'Case of 1,000',caseQty:1,category:'bags',keywords:'clear poly bags plastic bags poly bags reclosable bags resealable bags zip lock bags'},
  {sku:'1184-BDL',description:'Corrugated Boxes 11.25x8.75x4", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:'bulk boxes cardboard boxes corrugated boxes rsc boxes shipping boxes wholesale boxes'},
  {sku:'1184W-BDL',description:'White Corrugated Boxes 11.25x8.75x4", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:'bulk boxes premium boxes white boxes white corrugated white shipping boxes'},
  ...CATALOG,
];
const strict4=(line:string)=>{const r=retrieve(line,ROWS4,STRICT);const d=decide(r,{sku:r.top?.item.sku??null});return d.outcome==='matched'?d.item.sku:null;};
const top4=(line:string)=>scorePackaging(line,ROWS4)[0];

describe('final round: a material the item states must be stated, or implied by the line\'s own words',()=>{
  it.each([['Rolls 1/4" 12" x 250\'','FW14S12P'],['1/4" Roll 48" x 250\'','FW1448P'],['Expandable Bags 18 x 18"','IQRT20'],
    ['Black Hand Strapping 1/2" 600 lb','PS1231'],['Strapping, Hand Length, 1/2" 600 lb, Black','PS1231'],['Shipping Boxes 12 x 10 x 8"','12108-BDL']])('"%s": %s\'s material is unsaid',(line,sku)=>{
    const t=top4(line);
    expect(t.item.sku).toBe(sku);
    expect(t.eligibility.blockers.join(' ')).toContain('material');
    expect(strict4(line)).toBeNull();
  });
  it('takes the material from the line\'s own words where they imply it: an ECT, flute or wall is corrugated board; mil or gauge is plastic film',()=>{
    expect(strict4('Foam Rolls 1/4" x 12" x 250\' Perforated')).toBe('FW14S12P');
    expect(strict4('Black Poly Strapping Hand Length 1/2" 600 lb')).toBe('PS1231');
    expect(strict4('Brown Shipping Boxes 12x10x8 32ECT')).toBe('12108-BDL');
    expect(strict4('Reclosable Bags 6 x 9" 2 Mil')).toBe('PB3615');
  });
});

describe('final round: fractions and mixed numbers before a unit are read whole',()=>{
  it.each([['1/2 Mil',0.5],['1-1/2 Mil',1.5],['1 1/2 mil',1.5],['1.5 mil',1.5],['.5 mil',0.5]])('"%s" is %s mil',(text,mil)=>{
    expect(parseSpec(`Reclosable Poly Bags 6 x 9" ${text}`).values.mil).toEqual([mil]);
  });
  it('a half mil is not 2 mil, at any level',()=>{
    for(const line of ['Reclosable Poly Bags 6 x 9" 1/2 Mil','Reclosable Poly Bags 6 x 9" 1-1/2 Mil'])
      expect(scorePackaging(line,ROWS4).filter(c=>c.item.sku==='PB3615').every(c=>c.score<=0.5),line).toBe(true);
    expect(parseSpec('Stretch Film 18" x 1500\' 1/2 gauge').gauge).toBe(0.5);
  });
});

describe('final round: a default is implied only when no variant of the item states otherwise',()=>{
  it('single wall must be said when the same gaylord comes double wall',()=>{
    expect(top4('Gaylord 48 x 40 x 48"').eligibility.blockers.join(' ')).toContain('wall');
    expect(strict4('Gaylord 48 x 40 x 48"')).toBeNull();
    expect(strict4('Single Wall Gaylord 48 x 40 x 48"')).toBe('GL484048-BDL');
  });
  it('an item whose colour is not stated, among variants that state theirs, can\'t be confirmed',()=>{
    expect(strict4('#5 Colored Bubble Mailers 10.5 x 15.25"')).toBeNull();
    expect(strict4('#5 Blue Colored Bubble Mailers 10.5 x 15.25"')).toBe('AJ5B');
  });
  it('kraft must be said when the same box comes white; not when it doesn\'t',()=>{
    expect(strict4('Corrugated Boxes 11 1/4 x 8 3/4 x 4" 32 ECT')).toBeNull();
    expect(strict4('Kraft Corrugated Boxes 11 1/4 x 8 3/4 x 4" 32 ECT')).toBe('1184-BDL');
    expect(strict4('Corrugated Boxes 12 x 10 x 8" 32 ECT')).toBe('12108-BDL');
  });
});

describe('final round: recall fixes',()=>{
  it('reads a product name past a number in it ("Heavyweight 48-ECT Double Wall Sheets")',()=>{
    expect(strict4('Heavyweight 48 ECT Double Wall Corrugated Sheets 48 x 40"')).toBe('SP4048DW');
  });
  it('accounts for a family word "Colors" with the colour the line states',()=>{
    expect(strict4('Blue Cast Stretch Wrap Machine Length 20" x 6000\' 80 Gauge')).toBe('MSF2080BLUE');
  });
  it('takes "Foam Wrap" as the foam roll it stands for',()=>{
    expect(strict4('Foam Wrap 1/4" 24" x 250\', Perforated')).toBe('FW14S24P');
  });
});
