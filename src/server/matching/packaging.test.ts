import {describe,expect,it} from 'vitest';
import {itemPack,packLabel,parseItemSpec,parseSpec,productGroup} from './packaging';

// The packaging side of the text parser: what a customer's line (from another supplier, usually a
// Uline catalog line with the supplier SKU already removed) and a BOXT catalog row say about size,
// strength, film, colour, material, closure and pack quantity.

const dims=(text:string)=>parseSpec(text).dims?.map(d=>[d.unit,d.value]);
const measures=(text:string)=>parseSpec(text).measures.map(m=>[m.unit,m.value]);
const row=(description:string,extra:{pack?:string|null;caseQty?:number|null;keywords?:string}={})=>({sku:'X',description,...extra});

describe('parseSpec: dimensions are a positional tuple',()=>{
  it.each([
    ['12 x 10 x 8" Corrugated Boxes',[['in',12],['in',10],['in',8]]],
    ['12x10x8 corrugated boxes',[[null,12],[null,10],[null,8]]],
    ['12"x10"x8" boxes',[['in',12],['in',10],['in',8]]],
    ['12 in. x 10 in. x 8 in. boxes',[['in',12],['in',10],['in',8]]],
    ['12 by 10 by 8 inch boxes',[['in',12],['in',10],['in',8]]],
    ['12-1/4 x 9-1/4 x 9" mailers',[['in',12.25],['in',9.25],['in',9]]],
    ['Poly Bags 4 x 6" 2 Mil',[['in',4],['in',6]]],
    ['Industrial Tape 2" x 110 yds clear',[['in',2],['yd',110]]],
    ["Kraft paper roll 30\"x1200' 30 lb",[['in',30],['ft',1200]]],
    ['Kraft Tape 70MMx450\'',[['mm',70],['ft',450]]],
  ])('"%s"',(text,expected)=>{
    expect(dims(text)).toEqual(expected);
  });

  it('keeps the order the line gives, so 12x8x10 is not 12x10x8',()=>{
    expect(dims('12 x 8 x 10" boxes')).toEqual([['in',12],['in',8],['in',10]]);
  });

  it('reads numbers outside the tuple as separate measures, and weights never join a tuple',()=>{
    expect(measures('Bubble roll 1/2" bubble 12" x 250\' perforated')).toEqual([['in',0.5]]);
    expect(dims('Bubble roll 1/2" bubble 12" x 250\' perforated')).toEqual([['in',12],['ft',250]]);
    expect(measures('Kraft paper sheets 24 x 36" 50 lb')).toEqual([['lb',50]]);
    expect(measures('Poly strapping 1/2" 600 lb')).toEqual([['in',0.5],['lb',600]]);
    expect(measures('Loose fill peanuts 14 cubic feet')).toEqual([['cuft',14]]);
    expect(parseSpec('Edge protectors 2 x 2 x 48", .160" thick').words).toEqual(['edge','protector']);
    expect(parseSpec('Strapping 1/2" wide 600 lb, 9000\' long').words).toEqual(['strapping']);
    expect(parseSpec('Long corrugated boxes 12 x 10 x 8"').words).toContain('long');
    expect(parseSpec('Tall boxes 6 x 6 x 12"').words).toContain('tall');
  });

  it('has no tuple when the line gives no size',()=>{
    expect(dims('Corrugated boxes')).toBeUndefined();
  });
});

describe('parseSpec: strength, film and paper weights',()=>{
  it.each(['32 ECT','32ECT','32-ECT','ECT 32','ect-32'])('"%s" is 32 ECT',text=>{
    expect(parseSpec(`boxes ${text}`).ect).toBe(32);
  });

  it.each(['200 lb test','200 lb. test','200lb test','200# test','200#test','200 lbs test','burst 200','Mullen 200'])('"%s" is a 200 lb burst rating',text=>{
    const spec=parseSpec(`12 x 10 x 8" boxes ${text}`);
    expect(spec.burst).toBe(200);
    expect(spec.measures).toEqual([]);
  });

  it('reads a bare "200#" as a burst rating on a box line, and "50#" as paper weight elsewhere',()=>{
    expect(parseSpec('12x10x8 corrugated boxes 200#').burst).toBe(200);
    expect(parseSpec('50# kraft paper roll 36"').burst).toBeNull();
    expect(measures('50# kraft paper roll 36"')).toEqual([['lb',50],['in',36]]);
  });

  it('reads mil and gauge',()=>{
    expect(parseSpec('Poly Bags 4 x 6" 2 Mil').mil).toBe(2);
    expect(parseSpec('bags 1.5 mil').mil).toBe(1.5);
    expect(parseSpec('Tape 2.0 MIL').mil).toBe(2);
    expect(parseSpec('Stretch film 18" x 1500\' 80 gauge').gauge).toBe(80);
    expect(parseSpec('Stretch film 80 ga').gauge).toBe(80);
  });

  it('reads the wall',()=>{
    expect(parseSpec('single wall boxes').choices.wall).toBe('single');
    expect(parseSpec('double-wall boxes').choices.wall).toBe('double');
    expect(parseSpec('DW boxes').choices.wall).toBe('double');
    expect(parseSpec('Triple Wall Gaylord').choices.wall).toBe('triple');
    expect(parseSpec('Heavy Duty Boxes 24x18x18", BC Flute').choices.wall).toBe('double');
  });
});

describe('parseSpec: colour, material, closure and kind',()=>{
  it('reads colours, with brown and natural as kraft',()=>{
    expect(parseSpec('Kraft bubble mailers #2').colors).toEqual(['kraft']);
    expect(parseSpec('brown corrugated boxes').colors).toEqual(['kraft']);
    expect(parseSpec('white corrugated mailers').colors).toEqual(['white']);
    expect(parseSpec('clear tape').colors).toEqual(['clear']);
    expect(parseSpec('tan carton sealing tape').colors).toEqual(['tan']);
    expect(parseSpec('#2 Colored Bubble Mailers 8.5x11.25", Matte Black').colors).toEqual(['matte black']);
  });

  it('reads materials, with kraft as paper unless the line says corrugated',()=>{
    expect(parseSpec('Poly Bags 4 x 6"').materials).toEqual(['poly']);
    expect(parseSpec('plastic bags').materials).toEqual(['poly']);
    expect(parseSpec('Kraft bubble mailers').materials).toEqual(['paper']);
    expect(parseSpec('kraft corrugated boxes').materials).toEqual(['corrugated']);
    expect(parseSpec('12x10x8 RSC 32ECT kraft').materials).toEqual([]);
    expect(parseSpec('Kraft folding cartons 4 x 4 x 4"').materials).toEqual([]);
    expect(parseSpec('cardboard boxes').materials).toEqual(['corrugated']);
    expect(parseSpec('foam rolls').materials).toEqual(['foam']);
  });

  it('reads closures, adhesives, print methods and film types as exclusive choices',()=>{
    expect(parseSpec('Reclosable poly bags').choices.closure).toBe('reclosable');
    expect(parseSpec('zip lock bags').choices.closure).toBe('reclosable');
    expect(parseSpec('ziplock bags').choices.closure).toBe('reclosable');
    expect(parseSpec('open top poly bags').choices.closure).toBe('open');
    expect(parseSpec('self-seal bubble pouches').choices.closure).toBe('self-seal');
    expect(parseSpec('hot melt tape').choices.adhesive).toBe('hot melt');
    expect(parseSpec('acrylic tape').choices.adhesive).toBe('acrylic');
    expect(parseSpec('direct thermal labels').choices.print).toBe('direct thermal');
    expect(parseSpec('thermal transfer labels').choices.print).toBe('thermal transfer');
    expect(parseSpec('cast stretch film').choices.film).toBe('cast');
    expect(parseSpec('New Heat Treated Pallets').choices.condition).toBe('new');
    expect(parseSpec('Used Pallets').choices.condition).toBe('used');
    expect(parseSpec('Reconditioned pallets').choices.condition).toBe('used');
    expect(parseSpec('#1 Recycled Heat Treated Pallet').choices.condition).toBe('recycled');
    expect(parseSpec('machine stretch film').choices.length).toBe('machine');
    expect(parseSpec('Black Poly Strapping Hand 1/2" 600 lb').choices.length).toBe('hand');
    expect(parseSpec('stretch film, machine grade').choices.length).toBe('machine');
    expect(parseSpec('Seal Safe Hand Tape Dispensers 3"').choices.length).toBeUndefined();
  });

  it('reads the paper grade: newsprint, tissue, crinkle, or kraft for kraft paper',()=>{
    expect(parseSpec('Newsprint Sheets 24 x 36" 50 lb').choices.paper).toBe('newsprint');
    expect(parseSpec('Kraft Tissue Paper 20 x 30"').choices.paper).toBe('tissue');
    expect(parseSpec('Kraft Paper Sheets 24 x 36"').choices.paper).toBe('kraft');
    expect(parseSpec('Kraft bubble mailers #2').choices.paper).toBe('kraft');
    expect(parseSpec('Kraft corrugated boxes').choices.paper).toBeUndefined();
    expect(parseSpec('Packing paper 24 x 36"').choices.paper).toBeUndefined();
  });

  it('reads the features that make a different kind of item, and does not mistake thermal labels for insulated mailers',()=>{
    expect(parseSpec('Thermal Mailers 8x11"').features).toContain('insulated');
    expect(parseSpec('direct thermal labels').features).not.toContain('insulated');
    expect(parseSpec('Glamour Bubble Mailers').features).toEqual(expect.arrayContaining(['glamour','bubble']));
    expect(parseSpec('Corrugated Bin Boxes').features).toContain('bin');
    expect(parseSpec('Clear Face Document Envelopes').features).toContain('clear face');
    expect(parseSpec('Clear Face Document Envelopes').colors).toEqual([]);
  });

  it('reads a mailer size number, keeping #0, #00 and #000 apart',()=>{
    expect(parseSpec('#2 kraft bubble mailers').number).toBe('2');
    expect(parseSpec('#000 poly bubble mailers').number).toBe('000');
    expect(parseSpec('#00 poly bubble mailers').number).toBe('00');
  });
});

describe('parseSpec: stated pack quantities',()=>{
  it.each([
    ['25/bundle',{outer:25}],
    ['25 / bdl',{outer:25}],
    ['1000/case',{outer:1000}],
    ['1,000/cs',{outer:1000}],
    ['500/cs',{outer:500}],
    ['case of 500',{outer:500}],
    ['500 per case',{outer:500}],
    ['500 bags/case',{outer:500}],
    ['36 rolls/case',{outer:36}],
    ['bundle of 25',{outer:25}],
    ['500 labels/roll',{roll:500}],
  ])('"%s"',(text,expected)=>{
    expect(parseSpec(`poly bags 4 x 6" ${text}`).pack).toEqual(expected);
  });

  it('reads no pack when the line states none, and never reads a pack count as a size',()=>{
    expect(parseSpec('poly bags 4 x 6"').pack).toEqual({});
    expect(measures('poly bags 4 x 6" 1000/case')).toEqual([]);
  });
});

describe('itemPack: what a catalog row is sold in',()=>{
  it.each([
    [{pack:'Case of 1,000',caseQty:1},{outer:1000}],
    [{pack:'Case of 500',caseQty:1},{outer:500}],
    [{pack:'Each',caseQty:25},{outer:25}],
    [{pack:'Each',caseQty:1},{outer:1}],
    [{pack:'Roll',caseQty:1},{outer:1}],
    [{pack:'Coil',caseQty:1},{outer:1}],
    [{pack:'Roll of 250',caseQty:1},{roll:250}],
    [{pack:'Case',caseQty:1},{}],
    [{pack:null,caseQty:null},{}],
  ])('%j -> %j',(fields,expected)=>{
    expect(itemPack(row('Something',fields))).toEqual(expected);
  });

  it('takes a count the description states over a bare "Case"',()=>{
    expect(itemPack(row('Wardrobe Box Combo Pack, 3/Case',{pack:'Case',caseQty:1}))).toEqual({outer:3});
  });
});

describe('packLabel: the pack as the judge and the rep see it',()=>{
  it('names the bundle count of an item sold "Each" by the bundle, and passes other packs through',()=>{
    expect(packLabel({description:'Corrugated Boxes 12x10x8"',pack:'Each',caseQty:25})).toBe('Bundle of 25');
    expect(packLabel({description:'Gaylord',pack:'Each',caseQty:1})).toBe('Each');
    expect(packLabel({description:'Bags',pack:'Case of 1,000',caseQty:1})).toBe('Case of 1,000');
    expect(packLabel({description:'Mailers',pack:null,caseQty:null})).toBeNull();
  });
});

describe('parseItemSpec: catalog rows',()=>{
  it('ignores the pricing tier and the bundle weight of kraft paper',()=>{
    const box=parseItemSpec(row('Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing',{pack:'Each',caseQty:25,keywords:'bulk boxes cardboard boxes corrugated boxes rsc boxes shipping boxes wholesale boxes'}));
    expect(box.words).not.toContain('pricing');
    expect(box.words).not.toContain('bundle');
    expect(box.ect).toBe(32);
    expect(box.choices.wall).toBe('single');
    const paper=parseItemSpec(row('Kraft Paper Sheets, 24x36" 30 lb., 50 lb./Bundle',{pack:'Case of 833',caseQty:1}));
    expect(paper.measures.map(m=>[m.unit,m.value])).toEqual([['lb',30]]);
  });

  it('implies kraft for plain corrugated, and takes a colour from the keywords only when they name one',()=>{
    const box=parseItemSpec(row('Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing',{keywords:'cardboard boxes corrugated boxes'}));
    expect(box.colors).toEqual(['kraft']);
    expect(box.statedColors).toEqual([]);
    const white=parseItemSpec(row('White Corrugated Boxes 10x8x6", 32 ECT single wall, bundle pricing'));
    expect(white.colors).toEqual(['white']);
    expect(white.statedColors).toEqual(['white']);
    const bag=parseItemSpec(row('Reclosable Poly Bags, 4x6" 2 MIL',{keywords:'clear poly bags plastic bags poly bags reclosable bags resealable bags zip lock bags'}));
    expect(bag.colors).toEqual(['clear']);
    expect(bag.statedColors).toEqual([]);
    const tissue=parseItemSpec(row('Tissue Paper Sheets, 20x30", White',{keywords:'kraft tissue paper white tissue paper wrapping paper'}));
    expect(tissue.colors).toEqual(['white']);
  });

  it('names the product and reads its words from the description and keywords',()=>{
    const mailer=parseItemSpec(row('#2 Kraft Bubble Mailers 8.5x12"',{keywords:'brown bubble mailers kraft bubble mailers natural bubble mailers paper bubble mailers'}));
    expect(mailer.number).toBe('2');
    expect(mailer.name).toBe('kraft bubble mailers');
    expect(mailer.words).toEqual(expect.arrayContaining(['bubble','mailer','paper']));
  });
});

describe('productGroup',()=>{
  it('puts the bundle and pallet pricing tiers of one box in one group',()=>{
    const bundle={sku:'12108-BDL',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing'};
    const pallet={sku:'12108-PLT',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, pallet pricing'};
    const other={sku:'12106-BDL',description:'Corrugated Boxes 12x10x6", 32 ECT single wall, bundle pricing'};
    expect(productGroup(bundle)).toBe(productGroup(pallet));
    expect(productGroup(bundle)).not.toBe(productGroup(other));
    expect(productGroup({sku:'HD1212DW-BDL',description:'Heavy Duty Boxes 12x12x12", bundle pricing, BC Flute'})).toBe(productGroup({sku:'HD1212DW-PLT',description:'Heavy Duty Boxes 12x12x12", pallet pricing, BC Flute'}));
  });

  it('keeps the tiers in one group even when they are counted differently (the gaylord lid bundles 10, its pallet tier 25)',()=>{
    expect(productGroup({sku:'GAYLORDLID-BDL',description:'Gaylord Lid 48x40", bundle pricing',pack:'Each',caseQty:10}))
      .toBe(productGroup({sku:'GAYLORDLID-PLT',description:'Gaylord Lid 48x40", pallet pricing',pack:'Each',caseQty:25}));
    expect(productGroup({sku:'IQRT80',description:'Expandable Foam Bags, 22x27"'})).not.toBe(productGroup({sku:'IQRT80B',description:'Expandable Foam Bags (Bulk Pack), 22x27"'}));
  });
});

describe('round 3: every number classified, tuples by label, negation, kept tokens, closures, units',()=>{
  const tuple=(text:string)=>parseSpec(text).dims?.map(d=>d.value);
  it.each(['10 pk','10-pack','10 pack','pk of 10','10/pk','10 per pack','10 ct','10 count','qty 10/case','10 pcs'])('"%s" is a pack of 10',text=>{
    expect(parseSpec(`Corrugated Boxes 12 x 10 x 8" ${text}`).pack).toEqual({outer:10});
  });

  it('keeps a number it cannot classify as a stray, never as a size',()=>{
    const spec=parseSpec('Corrugated Boxes 12 x 10 x 8" 10');
    expect(spec.strays.map(s=>s.value)).toEqual([10]);
    expect(spec.measures).toEqual([]);
  });

  it.each([
    ['12*8*10 boxes',[12,8,10]],
    ['12 * 8 * 10 boxes',[12,8,10]],
    ['12-8-10 boxes',[12,8,10]],
    ['12 in. L x 8 in. W x 10 in. H boxes',[12,8,10]],
    ['10" W x 12" L x 8" H boxes',[12,10,8]],
    ['12" long x 10" wide x 8" high boxes',[12,10,8]],
    ['L 12 x W 10 x D 8 boxes',[12,10,8]],
    ['8 D x 10 W x 12 L boxes',[12,10,8]],
  ])('"%s" -> %j',(text,expected)=>{
    expect(tuple(text)).toEqual(expected);
  });

  it('does not read a mixed number or a two-part hyphen as a tuple',()=>{
    expect(tuple('12-1/4 x 9-1/4 x 9" mailers')).toEqual([12.25,9.25,9]);
    expect(parseSpec('bags 4-6').dims).toBeNull();
  });

  it('reads negations as negated things, not as the thing',()=>{
    expect(parseSpec('Poly Bags 4 x 6" 2 Mil, No Zipper')).toMatchObject({negated:{choices:{closure:'reclosable'}},choices:{}});
    expect(parseSpec('Poly Bags w/o Zipper').negated.choices.closure).toBe('reclosable');
    expect(parseSpec('Poly Bags without zipper').negated.choices.closure).toBe('reclosable');
    expect(parseSpec('Kraft Mailers No Bubble')).toMatchObject({negated:{features:['bubble']},features:[]});
    expect(parseSpec('Bags 10 x 12" 1.5 Mil, No Suffocation Warning')).toMatchObject({negated:{features:['warning']},features:[]});
    expect(parseSpec('Boxes non-printed').negated.words).toEqual(['printed']);
    expect(parseSpec('Gloves latex-free').negated.words).toEqual(['latex']);
    expect(parseSpec('Boxes not printed').negated.words).toEqual(['printed']);
    expect(parseSpec('no zipper bags').words).toContain('bag');
    expect(parseSpec('No. 2 kraft bubble mailers').number).toBe('2');
  });

  it('keeps single letters: flute letters are a choice, anything else is a word',()=>{
    expect(parseSpec('Heavy Duty Boxes 24 x 18 x 12" B Flute').choices.flute).toBe('b');
    expect(parseSpec('Heavy Duty Boxes 24x18x12", C Flute').choices.flute).toBe('c');
    expect(parseSpec('Heavy Duty Boxes 24x18x18", BC Flute').choices).toMatchObject({flute:'bc',wall:'double'});
    expect(parseSpec('Corrugated boxes q').words).toContain('q');
  });

  it('keeps closures apart: slider, press-to-close, self-seal, tuck, string and button',()=>{
    expect(parseSpec('Slider Bags 4 x 6"').choices.closure).toBe('slider');
    expect(parseSpec('slider zipper bags').choices.closure).toBe('slider');
    expect(parseSpec('press to close bags').choices.closure).toBe('reclosable');
    expect(parseSpec('peel and seal mailers').choices.closure).toBe('self-seal');
    expect(parseSpec('tuck top mailers').choices.closure).toBe('tuck');
    expect(parseSpec('string and button envelopes').choices.closure).toBe('string-button');
  });

  it('gives a unitless catalog number inches only where the category implies it (tape, storage)',()=>{
    const strap=parseItemSpec({sku:'PS1231',description:'Black Poly Strapping, Hand Length, 0.5 600 lbs',category:'tape'});
    expect(strap.measures.map(m=>[m.unit,m.value])).toEqual([['lb',600],['in',0.5]]);
    const other=parseItemSpec({sku:'X1',description:'Widget 0.5',category:'bags'});
    expect(other.measures.map(m=>[m.unit,m.value])).toEqual([[null,0.5]]);
  });
});
