import {describe,expect,it} from 'vitest';
import {CATALOG} from '@/server/db/seed/catalog';
import {fastenerSpec,itemName,matchesBolt,piecesPerPack,sameSize} from './fasteners';

const spec=(description:string)=>fastenerSpec(description)!;

describe('itemName',()=>{
  it('keeps the words before the size',()=>{
    expect(itemName('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc')).toBe('Hex cap screw');
    expect(itemName('Self-drilling screw #12 x 1 in, hex washer head')).toBe('Self-drilling screw');
    expect(itemName('Nitrile disposable gloves, 8 mil, black, size L')).toBe('Nitrile disposable gloves');
    expect(itemName('N95 particulate respirator')).toBe('N95 particulate respirator');
    expect(itemName('Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks')).toBe('Ratchet strap');
  });
});

describe('fastenerSpec',()=>{
  it('reads bolts, nuts and washers with their size and grade',()=>{
    expect(spec('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc')).toEqual({kind:'bolt',diameter:'1/2',thread:'13',grade:'8',flat:false});
    expect(spec('Hex nut 1/2-13, Grade 8, yellow zinc')).toEqual({kind:'nut',diameter:'1/2',thread:'13',grade:'8',flat:false});
    expect(spec('Flat washer 1/2 in, Grade 8, yellow zinc')).toEqual({kind:'washer',diameter:'1/2',thread:null,grade:'8',flat:true});
    expect(spec('Hex bolt 1-1/2-6 x 6 in, grade 5')).toEqual({kind:'bolt',diameter:'1-1/2',thread:'6',grade:'5',flat:false});
  });

  it('has no grade for SAE and lock washers',()=>{
    expect(spec('Flat washer 1/2 in, SAE, zinc plated')).toMatchObject({kind:'washer',diameter:'1/2',grade:null});
    expect(spec('Split lock washer 1/2 in, zinc plated')).toMatchObject({kind:'washer',diameter:'1/2',grade:null,flat:false});
  });

  it('ignores items that are not bolts, nuts or washers, or have no readable size',()=>{
    expect(fastenerSpec('Self-drilling screw #12 x 1 in, hex washer head')).toBeNull();
    expect(fastenerSpec('Wedge anchor 1/2 x 4-1/4 in, zinc plated')).toBeNull();
    expect(fastenerSpec('Lever load binder, 3/8-1/2 in chain')).toBeNull();
    expect(fastenerSpec('Hex cap screw M12 x 40, class 10.9')).toBeNull();
    expect(fastenerSpec('Hex nut, assorted')).toBeNull();
  });

  it('reads every fastener in the seeded catalog',()=>{
    const found=CATALOG.flatMap(item=>{const s=fastenerSpec(item.description);return s?[[item.sku,s.kind,s.diameter,s.thread,s.grade]]:[];});
    expect(found).toEqual([
      ['HCS-12-13-2G8','bolt','1/2','13','8'],['HCS-12-13-2G5','bolt','1/2','13','5'],['HCS-12-13-112G8','bolt','1/2','13','8'],['HCS-12-13-3G8','bolt','1/2','13','8'],
      ['HCS-38-16-1G5','bolt','3/8','16','5'],['HCS-58-11-3G8','bolt','5/8','11','8'],
      ['HN-12-13-G8','nut','1/2','13','8'],['HN-12-13-G5','nut','1/2','13','5'],['HN-38-16-G5','nut','3/8','16','5'],
      ['FW-12-G8','washer','1/2',null,'8'],['FW-12-SAE','washer','1/2',null,null],['LW-12-ZP','washer','1/2',null,null],
    ]);
  });
});

describe('matchesBolt',()=>{
  const bolt=spec('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc');
  it('needs the same diameter and grade, and for nuts the same thread',()=>{
    expect(matchesBolt(bolt,spec('Hex nut 1/2-13, Grade 8, yellow zinc'))).toBe(true);
    expect(matchesBolt(bolt,spec('Flat washer 1/2 in, Grade 8, yellow zinc'))).toBe(true);
    expect(matchesBolt(bolt,spec('Hex nut 1/2-13, Grade 5, zinc plated'))).toBe(false);
    expect(matchesBolt(bolt,spec('Hex nut 1/2-20, Grade 8, yellow zinc'))).toBe(false);
    expect(matchesBolt(bolt,spec('Hex nut 3/8-16, Grade 8, zinc plated'))).toBe(false);
    expect(matchesBolt(bolt,spec('Flat washer 1/2 in, SAE, zinc plated'))).toBe(false);
    expect(matchesBolt(bolt,spec('Hex cap screw 1/2-13 x 3 in, Grade 8, yellow zinc'))).toBe(false);
  });

  it('never matches an ungraded bolt',()=>{
    const ungraded=spec('Hex cap screw 1/2-13 x 2 in, 18-8 stainless');
    expect(ungraded.grade).toBeNull();
    expect(matchesBolt(ungraded,spec('Split lock washer 1/2 in, zinc plated'))).toBe(false);
  });

  it('sameSize compares kind, diameter and thread only',()=>{
    expect(sameSize(spec('Hex nut 1/2-13, Grade 5, zinc plated'),spec('Hex nut 1/2-13, Grade 8, yellow zinc'))).toBe(true);
    expect(sameSize(spec('Split lock washer 1/2 in, zinc plated'),spec('Flat washer 1/2 in, Grade 8, yellow zinc'))).toBe(true);
    expect(sameSize(spec('Hex nut 3/8-16, Grade 5, zinc plated'),spec('Hex nut 1/2-13, Grade 8, yellow zinc'))).toBe(false);
  });
});

describe('piecesPerPack',()=>{
  it('reads the count in the pack',()=>{
    expect(piecesPerPack('Box of 50')).toBe(50);
    expect(piecesPerPack('Box of 100 pairs')).toBe(100);
    expect(piecesPerPack('Case of 1,000')).toBe(1000);
    expect(piecesPerPack('Each')).toBe(1);
  });
  it('is null when the pack gives no count',()=>{
    expect(piecesPerPack('4 pack')).toBeNull();
    expect(piecesPerPack('25 lb box')).toBeNull();
    expect(piecesPerPack('Box of 0')).toBeNull();
  });
});
