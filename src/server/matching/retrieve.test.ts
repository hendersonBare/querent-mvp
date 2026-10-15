import {describe,expect,it} from 'vitest';
import {CONFLICT,UNCONFIRMED,hundredths,scorePackaging} from './score-packaging';
import {retrieve} from './retrieve';
import {decide} from './decide';

// Real BOXT rows with the near-duplicates that make wrong matches easy: permuted and near box sizes,
// white vs kraft, pricing tiers of one box, 2/4 mil bags in both orientations, kraft vs poly bubble
// mailers, hot melt vs acrylic tape, reclosable vs warning bags.
const BOX_KW='bulk boxes cardboard boxes corrugated boxes rsc boxes shipping boxes wholesale boxes';
const BAG_KW='clear poly bags plastic bags poly bags reclosable bags resealable bags zip lock bags';
const CATALOG=[
  {sku:'12108-BDL',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:BOX_KW},
  {sku:'12108-PLT',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, pallet pricing',pack:'Each',caseQty:25,category:'boxes',keywords:BOX_KW},
  {sku:'12106-BDL',description:'Corrugated Boxes 12x10x6", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:BOX_KW},
  {sku:'1288-BDL',description:'Corrugated Boxes 12x8x8", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:BOX_KW},
  {sku:'1086-BDL',description:'Corrugated Boxes 10x8x6", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:BOX_KW},
  {sku:'1086W-BDL',description:'White Corrugated Boxes 10x8x6", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:'bulk boxes premium boxes white boxes white corrugated white shipping boxes'},
  {sku:'M1294',description:'White Corrugated Mailers 12.25x9.25x4"',pack:'Each',caseQty:50,category:'boxes',keywords:'cardboard mailers corrugated mailers shipping mailers tuck-front mailers wholesale mailers'},
  {sku:'HD1212DW-BDL',description:'Heavy Duty Boxes 12x12x12", bundle pricing, BC Flute',pack:'Each',caseQty:25,category:'boxes',keywords:'bulk boxes double wall boxes heavy duty boxes reinforced boxes strong shipping boxes'},
  {sku:'121212-BDL',description:'Corrugated Boxes 12x12x12", 32 ECT single wall, bundle pricing',pack:'Each',caseQty:25,category:'boxes',keywords:BOX_KW},
  {sku:'PB3565',description:'Reclosable Poly Bags, 4x6" 2 MIL',pack:'Case of 1,000',caseQty:1,category:'bags',keywords:BAG_KW},
  {sku:'PB3710',description:'Reclosable Poly Bags, 4x6" 4 MIL',pack:'Case of 1,000',caseQty:1,category:'bags',keywords:BAG_KW},
  {sku:'PB3600',description:'Reclosable Poly Bags, 6x4" 2 MIL',pack:'Case of 1,000',caseQty:1,category:'bags',keywords:BAG_KW},
  {sku:'PMR040615',description:'Suffocation Warning Bags, 4x6" 1.5 MIL',pack:'Case of 1,000',caseQty:1,category:'bags',keywords:'poly bags resealable bags safety bags suffocation bags suffocation warning bags warning bags'},
  {sku:'B855SS',description:'#2 Kraft Bubble Mailers 8.5x12"',pack:'Case of 100',caseQty:1,category:'mailers',keywords:'brown bubble mailers kraft bubble mailers natural bubble mailers paper bubble mailers'},
  {sku:'B833',description:'#2 Poly Bubble Mailers 8.5x12"',pack:'Case of 100',caseQty:1,category:'mailers',keywords:'bubble mailers e-commerce mailers padded mailers poly bubble mailers shipping mailers'},
  {sku:'T902700',description:'Clear Hot Melt Tape, Hand Length, 2"x110yd 1.9 MIL',pack:'Case of 36',caseQty:1,category:'tape',keywords:'carton sealing tape hand packing tape hot melt tape industrial tape packing tape shipping tape'},
  {sku:'T902900',description:'Clear Hot Melt Tape, Hand Length, 2"x110yd 2.5 MIL',pack:'Case of 36',caseQty:1,category:'tape',keywords:'carton sealing tape hand packing tape hot melt tape industrial tape packing tape shipping tape'},
  {sku:'T902400',description:'Clear Acrylic Tape, Hand Length, 2"x110yd 2.0 MIL',pack:'Case of 36',caseQty:1,category:'tape',keywords:'acrylic tape carton sealing tape clear packing tape clear tape packing tape'},
];

const scores=(line:string)=>Object.fromEntries(scorePackaging(line,CATALOG).map(c=>[c.item.sku,c.score]));
const score=(line:string,sku:string)=>scores(line)[sku]??0;
const best=(line:string)=>scorePackaging(line,CATALOG)[0]?.item.sku;
const STRICT={minScore:0.9,minLead:0.2};

describe('scorePackaging: what the line says',()=>{
  it('scores a fully confirmed line 1, best first, rounded to hundredths',()=>{
    const result=scorePackaging('12 x 10 x 8" Corrugated Boxes 32 ECT 25/bundle',CATALOG);
    expect(result.slice(0,2).map(c=>[c.item.sku,c.score])).toEqual([['12108-BDL',1],['12108-PLT',1]]);
    for(const c of result)expect(Math.round(c.score*100)/100).toBe(c.score);
  });

  it('reads dimensions by position: 12x8x10 is not 12x10x8',()=>{
    expect(score('12 x 8 x 10" Corrugated Boxes',  '12108-BDL')).toBeLessThan(0.5);
    expect(scorePackaging('12 x 8 x 10" Corrugated Boxes',CATALOG).every(c=>c.score<0.5)).toBe(true);
  });

  it('treats a near size as a contradiction, not a partial match',()=>{
    expect(score('12 x 10 x 6" corrugated boxes','12108-BDL')).toBeLessThan(0.5);
    expect(score('12.25 x 9.25 x 3" white corrugated mailers','M1294')).toBeLessThan(0.5);
    expect(score('12 x 9 x 4" white corrugated mailers','M1294')).toBeLessThan(0.5);
  });

  it('keeps bag sizes in order: 4 x 6 is not 6 x 4 (the catalog sells both)',()=>{
    expect(best('Reclosable poly bags 4 x 6" 2 mil')).toBe('PB3565');
    expect(score('Reclosable poly bags 4 x 6" 2 mil','PB3600')).toBeLessThan(0.5);
  });

  it('contradicts on ECT, and maps a burst rating to its ECT equivalent (200 lb = 32 ECT, 275 lb = 44 ECT)',()=>{
    expect(score('12 x 10 x 8" corrugated boxes 44 ECT','12108-BDL')).toBeLessThan(0.5);
    expect(score('12 x 10 x 8" corrugated boxes 200 lb test','12108-BDL')).toBe(1);
    expect(score('12 x 10 x 8" corrugated boxes 275 lb test','12108-BDL')).toBeLessThan(0.5);
    expect(score('12 x 10 x 8" corrugated boxes 150 lb test','12108-BDL')).toBeLessThan(0.5);
  });

  it('contradicts on the wall',()=>{
    expect(score('12 x 10 x 8" double wall corrugated boxes','12108-BDL')).toBeLessThan(0.5);
  });

  it('contradicts on mil thickness',()=>{
    expect(score('Reclosable poly bags 4 x 6" 4 mil','PB3565')).toBeLessThan(0.5);
    expect(best('Reclosable poly bags 4 x 6" 4 mil')).toBe('PB3710');
  });

  it('contradicts on a stated pack quantity, and counts a matching one',()=>{
    expect(score('Reclosable poly bags 4 x 6" 2 mil 500/case','PB3565')).toBeLessThan(0.5);
    expect(score('Reclosable poly bags 4 x 6" 2 mil 1000/case','PB3565')).toBe(1);
    expect(score('12 x 10 x 8" corrugated boxes 20/bundle','12108-BDL')).toBeLessThan(0.5);
    expect(score('12 x 10 x 8" corrugated boxes 25/bundle','12108-BDL')).toBe(1);
  });

  it('contradicts on colour: white is not kraft, kraft is not white',()=>{
    expect(score('10 x 8 x 6" white corrugated boxes','1086-BDL')).toBeLessThan(0.5);
    expect(score('10 x 8 x 6" kraft corrugated boxes','1086W-BDL')).toBeLessThan(0.5);
    expect(best('10 x 8 x 6" kraft corrugated boxes')).toBe('1086-BDL');
    expect(best('10 x 8 x 6" white corrugated boxes')).toBe('1086W-BDL');
  });

  it('contradicts on material: kraft (paper) bubble mailers are not poly ones',()=>{
    expect(best('Kraft bubble mailers #2 8.5 x 12"')).toBe('B855SS');
    expect(score('Kraft bubble mailers #2 8.5 x 12"','B833')).toBeLessThan(0.5);
    expect(score('Poly bubble mailers #2 8.5 x 12"','B855SS')).toBeLessThan(0.5);
  });

  it('contradicts on closure: open-top bags are not reclosable ones',()=>{
    expect(score('Open top poly bags 4 x 6" 2 mil','PB3565')).toBeLessThan(0.5);
  });

  it('contradicts on adhesive',()=>{
    expect(score('Hot melt tape 2" x 110 yds clear 2.0 mil','T902400')).toBeLessThan(0.5);
  });

  it('scales down an item whose defining kind the line does not state (reclosable, heavy duty, a stated colour)',()=>{
    // "Poly bags" may be flat open-top bags; the reclosable bag is unconfirmed, not contradicted.
    expect(score('Poly bags 4 x 6" 2 mil 1000/case','PB3565')).toBe(UNCONFIRMED);
    // The heavy duty box is double wall and heavy duty: two unstated features.
    expect(score('12 x 12 x 12" corrugated boxes','HD1212DW-BDL')).toBeLessThan(score('12 x 12 x 12" corrugated boxes','121212-BDL'));
    // A plain line prefers the plain box over the white one.
    expect(best('10 x 8 x 6" corrugated boxes')).toBe('1086-BDL');
    expect(score('10 x 8 x 6" corrugated boxes','1086W-BDL')).toBe(UNCONFIRMED);
  });

  it('reads a roll written thickness first (1/2" x 12" x 250\') against one written "1/2" Bubble 12"x250\'"',()=>{
    const catalog=[
      {sku:'BW12S12P',description:'Bubble Rolls, 1/2" Bubble 12"x250\' Perforated 12"',pack:'Roll',caseQty:1,keywords:'bubble rolls bubble wrap cushioning protective packaging shipping cushioning'},
      {sku:'BW316S12P',description:'Bubble Rolls, 3/16" Bubble 12"x750\' Perforated 12"',pack:'Roll',caseQty:1,keywords:'bubble rolls bubble wrap cushioning protective packaging shipping cushioning'},
    ];
    const s=(line:string)=>Object.fromEntries(scorePackaging(line,catalog).map(c=>[c.item.sku,c.score]));
    expect(s('Bubble wrap roll 1/2" x 12" x 250\' perforated').BW12S12P).toBe(1);
    expect(s('Bubble wrap roll 12" x 250\' 1/2" perforated').BW12S12P).toBe(1);
    expect(s('Bubble wrap roll 3/16" x 12" x 250\' perforated').BW12S12P).toBeLessThan(0.5);
    expect(s('Bubble wrap roll 12" x 1/2" x 250\' perforated').BW12S12P).toBeLessThan(0.5);
  });

  it('contradicts on paper grade: newsprint is not kraft paper',()=>{
    const catalog=[
      {sku:'NP2430',description:'Newsprint Sheets, 24x36" 50 lb.',pack:'Case of 800',caseQty:1,keywords:'newsprint sheets packing paper pre-cut paper void fill wrapping paper'},
      {sku:'KPS243650',description:'Kraft Paper Sheets, 24x36" 50 lb., 50 lb./Bundle',pack:'Case of 500',caseQty:1,keywords:'kraft paper sheets packing paper recycled paper void fill wrapping paper'},
    ];
    const s=(line:string)=>Object.fromEntries(scorePackaging(line,catalog).map(c=>[c.item.sku,c.score]));
    expect(s('Newsprint sheets 24 x 36" 50 lb')).toMatchObject({NP2430:1});
    expect(s('Newsprint sheets 24 x 36" 50 lb').KPS243650).toBeLessThan(0.5);
    expect(s('Kraft paper sheets 24 x 36" 50 lb').NP2430).toBeLessThan(0.5);
  });

  it('caps any item with a contradiction at CONFLICT, so it can never clear a level (every minScore is above it)',()=>{
    expect(CONFLICT).toBeLessThanOrEqual(0.5);
    for(const line of ['12 x 8 x 10" Corrugated Boxes 32 ECT 25/bundle','Reclosable poly bags 4 x 6" 4 mil 1000/case','10 x 8 x 6" kraft corrugated boxes']){
      for(const c of scorePackaging(line,CATALOG))if(c.conflicts.length)expect(c.score,`${line} -> ${c.item.sku}`).toBeLessThanOrEqual(CONFLICT);
    }
  });

  it('treats an item with no size at all as contradicting a line that names one',()=>{
    const catalog=[...CATALOG,{sku:'MBCOMBO2',description:'#2 Moving Box Combo Pack',pack:'Case',caseQty:1,keywords:'combo packs moving boxes packing kits wardrobe boxes'}];
    const r=scorePackaging('Corrugated boxes 6 x 6 x 12"',catalog);
    expect(r.find(c=>c.item.sku==='MBCOMBO2')?.score??0).toBeLessThanOrEqual(CONFLICT);
    expect(r[0].item.description).toMatch(/^Corrugated Boxes/);
  });

  it('keeps an item that contradicts only the size as a scored near-miss, nearest size first',()=>{
    const r=scorePackaging('12 x 10 x 7" corrugated boxes 32 ECT',CATALOG);
    expect(r.length).toBeGreaterThan(0);
    expect(r.slice(0,3).map(c=>c.item.sku)).toEqual(['12108-BDL','12108-PLT','12106-BDL']);
  });

  it('charges every qualifier the line asks for and the item does not account for, whatever the word',()=>{
    // Recognised features and words the scorer has never seen cost the same: the item must explain them.
    for(const line of ['Heavy Duty Corrugated Boxes 12 x 10 x 8" 32 ECT','Insulated Corrugated Boxes 12 x 10 x 8"','Printed Corrugated Boxes 12 x 10 x 8" 32 ECT',
      'Telescoping Boxes 12 x 10 x 8" 32 ECT','Waterproof Corrugated Boxes 12 x 10 x 8"','Corrugated Boxes 12x10x8 Used','Corrugated Boxes 12x10x8 frobnicated'])
      expect(score(line,'12108-BDL'),line).toBeLessThanOrEqual(UNCONFIRMED);
    expect(score('Anti-Static Reclosable Bags 4 x 6" 2 Mil','PB3565')).toBeLessThanOrEqual(UNCONFIRMED);
    expect(score('Insulated Bubble Mailers #2 8 1/2 x 12" Kraft','B855SS')).toBeLessThanOrEqual(UNCONFIRMED);
    expect(score('Self-seal kraft bubble mailers #2 8 1/2 x 12"','B855SS')).toBeLessThanOrEqual(UNCONFIRMED);
    // Two unexplained qualifiers cost twice.
    expect(score('Heavy duty printed corrugated boxes 12 x 10 x 8"','12108-BDL')).toBeLessThanOrEqual(UNCONFIRMED**2);
  });

  it('lists what the item does not account for',()=>{
    const [box]=scorePackaging('Telescoping corrugated boxes 12 x 10 x 8" heavy duty',CATALOG).filter(c=>c.item.sku==='12108-BDL');
    expect(box.unexplained).toEqual(['feature: heavy duty','word: telescoping']);
  });

  it('reads the condition: new, used and recycled contradict each other, and a used or recycled item must be asked for',()=>{
    const pallets=[
      {sku:'CPW4840RH',description:'#1 Recycled Heat Treated Pallet, 48x40"',pack:'Each',caseQty:1,keywords:'48x40 pallets export pallets heat treated pallets wood pallets'},
      {sku:'CPW4840R2',description:'#2 Used Pallets, 48x40"',pack:'Each',caseQty:1,keywords:'48x40 pallets economy pallets recycled pallets wood pallets'},
    ];
    const s=(line:string)=>Object.fromEntries(scorePackaging(line,pallets).map(c=>[c.item.sku,c.score]));
    expect(s('Heat Treated Pallets 48 x 40" New').CPW4840RH??0).toBeLessThanOrEqual(CONFLICT);
    expect(s('New Heat Treated Wood Pallets 48 x 40"').CPW4840RH??0).toBeLessThanOrEqual(CONFLICT);
    expect(s('Heat Treated Pallets 48 x 40"').CPW4840RH).toBeLessThanOrEqual(UNCONFIRMED);
    expect(s('Recycled Heat Treated Pallets 48 x 40"').CPW4840RH).toBe(1);
    expect(s('Used Pallets 48 x 40"').CPW4840R2).toBe(1);
  });

  it('charges each contradiction by the CONFLICT factor on top of its lost weight',()=>{
    const [one,two]=[score('Reclosable poly bags 4 x 6" 4 mil 1000/case','PB3565'),score('Reclosable poly bags 4 x 6" 4 mil 500/case','PB3565')];
    expect(two).toBeLessThan(one);
  });

  it('explains each score with the conflicts and unstated features it found',()=>{
    const [white]=scorePackaging('10 x 8 x 6" kraft corrugated boxes',CATALOG).filter(c=>c.item.sku==='1086W-BDL');
    expect(white.conflicts).toEqual(['color: kraft vs white']);
    const [bag]=scorePackaging('Poly bags 4 x 6" 2 mil',CATALOG).filter(c=>c.item.sku==='PB3565');
    expect(bag.unstated).toEqual(['closure: reclosable']);
  });

  it('never matches a typed SKU: a BOXT SKU in the line is just text',()=>{
    expect(score('12108-BDL','12108-BDL')).toBeLessThan(0.5);
    expect(score('PB3565','PB3565')).toBeLessThan(0.5);
    expect(retrieve('12108-BDL',CATALOG,STRICT).clears).toBe(false);
  });

  it('needs the item itself to fit: a matching pack quantity, mil or colour alone is no evidence',()=>{
    expect(scorePackaging('Nitrile gloves large 1000/case',CATALOG)).toEqual([]);
    expect(scorePackaging('Latex gloves 2 mil clear',CATALOG)).toEqual([]);
  });

  it('returns nothing for an empty line or words no item has',()=>{
    expect(scorePackaging('',CATALOG)).toEqual([]);
    expect(scorePackaging('xyzzy plugh',CATALOG)).toEqual([]);
    expect(scorePackaging('boxes',[])).toEqual([]);
  });
});

describe('round 3 classes',()=>{
  const STRAP=[{sku:'PS1231',description:'Black Poly Strapping, Hand Length, 0.5 600 lbs',pack:'Coil',caseQty:1,category:'tape',keywords:'poly strapping strapping'}];
  it('compares a pack count with the item\'s pack, never with a dimension',()=>{
    expect(score('Corrugated Boxes 12 x 10 x 8" (10 pk)','12108-BDL')).toBeLessThanOrEqual(CONFLICT);
    expect(score('Corrugated Boxes 12 x 10 x 8" 25 pk','12108-BDL')).toBe(1);
    expect(score('Reclosable Bags 6 x 4" 2 Mil 6 pk','PB3600')).toBeLessThanOrEqual(CONFLICT);
  });
  it('never confirms a stray number',()=>{
    expect(score('Corrugated Boxes 12 x 10 x 8" 10','12108-BDL')).toBeLessThanOrEqual(UNCONFIRMED);
  });
  it('reads * and hyphen tuples and L/W/H labels positionally',()=>{
    expect(score('Corrugated Boxes 12*8*10 32 ECT','12108-BDL')).toBeLessThanOrEqual(CONFLICT);
    expect(score('Corrugated Boxes 12-8-10 200# test','12108-BDL')).toBeLessThanOrEqual(CONFLICT);
    expect(score('Corrugated Boxes 12 in. L x 8 in. W x 10 in. H, 32 ECT','12108-BDL')).toBeLessThanOrEqual(CONFLICT);
    expect(score('Corrugated Boxes 10" W x 12" L x 8" H, 32 ECT','12108-BDL')).toBe(1);
  });
  it('contradicts an item that has what the line negates',()=>{
    expect(score('Poly Bags 4 x 6" 2 Mil, No Zipper','PB3565')).toBeLessThanOrEqual(CONFLICT);
    expect(score('Kraft Mailers #2 8 1/2 x 12" No Bubble','B855SS')).toBeLessThanOrEqual(CONFLICT);
    expect(score('Poly Mailers #2 8 1/2 x 12" No Bubble','B833')).toBeLessThanOrEqual(CONFLICT);
  });
  it('does not take an item\'s silence as keeping a negation: the catalog never states what an item lacks (B3b)',()=>{
    expect(score('Kraft Bubble Mailers #2 8 1/2 x 12" without self seal','B855SS')).toBeLessThanOrEqual(UNCONFIRMED);
    expect(score('Corrugated Boxes 12 x 10 x 8" Not Printed','12108-BDL')).toBe(UNCONFIRMED);
  });
  it('compares microns with mil after conversion, never as a stray number',()=>{
    expect(score('Reclosable Bags 4 x 6" 50.8 micron','PB3565')).toBe(1);
    expect(score('Reclosable Bags 4 x 6" 100 micron','PB3565')).toBeLessThanOrEqual(CONFLICT);
  });
  it('contradicts slider against press-to-close',()=>{
    expect(score('Slider Bags 4 x 6" 2 Mil','PB3565')).toBeLessThanOrEqual(CONFLICT);
  });
  it('converts units and never takes 0.5 cm for 0.5 in',()=>{
    const s=(line:string)=>scorePackaging(line,STRAP)[0]?.score??0;
    expect(s('Poly Strapping Hand Length 0.5 cm 600 lb Black')).toBeLessThanOrEqual(CONFLICT);
    expect(s('Poly Strapping Hand Length 12.7 mm 600 lb Black')).toBe(1);
    expect(s('Poly Strapping Hand Length 1/2" 600 lb Black')).toBe(1);
  });
  it('never clears a line that names no product type, and says why',()=>{
    const r=retrieve('12 x 10 x 8"',CATALOG,STRICT);
    expect(r.top?.score).toBe(1);
    expect(r.namesProduct).toBe(false);
    expect(r.clears).toBe(false);
    expect(decide(r,{sku:'12108-BDL'})).toEqual({outcome:'no_match',reason:'no_product_type'});
    expect(r.nearMisses.length).toBeGreaterThan(0);
    expect(retrieve('12 x 10 x 8" corrugated boxes',CATALOG,STRICT).namesProduct).toBe(true);
  });
});

describe('hundredths',()=>{
  it('compares in hundredths, so float noise never flips a threshold',()=>{
    expect(0.95-0.8).toBeLessThan(0.15);
    expect(hundredths(0.95-0.8)).toBe(15);
    expect(hundredths(0.7499999999)).toBe(75);
  });
});

describe('retrieve',()=>{
  it('clears a confirmed line, measuring the lead against another product group (not the pallet tier)',()=>{
    const r=retrieve('12 x 10 x 8" Corrugated Boxes 200 lb test 25/bundle',CATALOG,STRICT);
    expect(r.top?.item.sku).toBe('12108-BDL');
    expect(r.candidates[1].item.sku).toBe('12108-PLT');
    expect(r.top?.score).toBe(1);
    expect(r.lead).toBe(Math.round((1-r.candidates.find(c=>c.group!==r.top!.group)!.score)*100)/100);
    expect(r.lead).toBeGreaterThan(0.2);
    expect(r.clears).toBe(true);
    expect(r.rule).toEqual({...STRICT,requireTotalAccounting:false});
  });

  it('does not clear when two product groups tie',()=>{
    // 1.9 and 2.5 mil hot melt both fit "industrial tape 2 x 110 yds clear".
    const r=retrieve('Industrial Tape 2" x 110 yds clear',CATALOG,STRICT);
    expect(r.lead).toBe(0);
    expect(r.clears).toBe(false);
  });

  it('does not clear below minScore however big the lead',()=>{
    const r=retrieve('Poly bags 4 x 6" 2 mil 1000/case',CATALOG,STRICT);
    expect(r.top?.item.sku).toBe('PB3565');
    expect(r.top!.score).toBeLessThan(STRICT.minScore);
    expect(r.clears).toBe(false);
  });

  it('a lone candidate leads by its whole score',()=>{
    const r=retrieve('12 x 10 x 8" corrugated boxes',CATALOG.slice(0,1),STRICT);
    expect(r.lead).toBe(r.top!.score);
  });

  it('limits candidates, and gives near-misses one per product group',()=>{
    const r=retrieve('12 x 10 x 8" corrugated boxes',CATALOG,{...STRICT,candidateLimit:3,nearMissLimit:2});
    expect(r.candidates).toHaveLength(3);
    expect(r.nearMisses).toHaveLength(2);
    expect(new Set(r.nearMisses.map(c=>c.group)).size).toBe(2);
    expect(retrieve('12 x 10 x 8" corrugated boxes',CATALOG,STRICT).candidates.length).toBeLessThanOrEqual(8);
  });

  it('defaults to 8 candidates and 5 near-misses',()=>{
    const r=retrieve('corrugated boxes',CATALOG,STRICT);
    expect(r.candidates).toHaveLength(8);
    expect(r.nearMisses.length).toBeLessThanOrEqual(5);
  });

  it('returns an empty retrieval when nothing scores',()=>{
    expect(retrieve('xyzzy',CATALOG,STRICT)).toMatchObject({candidates:[],top:null,lead:0,clears:false,nearMisses:[]});
  });
});
