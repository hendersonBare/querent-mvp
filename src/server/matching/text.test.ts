import {describe,expect,it} from 'vitest';
import {normalize,parseItem,parseQuery,saysUsual,stem} from './text';

const attrs=(text:string)=>Object.fromEntries(parseQuery(text).attrs.map(a=>[a.key,a.value]));
const measures=(text:string)=>parseQuery(text).measures.map(m=>[m.unit,m.value]);
const words=(text:string)=>parseQuery(text).words;

const item=(sku:string,description:string,keywords='')=>({sku,description,keywords});

describe('normalize',()=>{
  it('spells out unicode fractions, keeping mixed numbers together',()=>{
    expect(normalize('½-13 Grade 8')).toBe('1/2-13 grade 8');
    expect(normalize('1½ in and 4 ½"')).toBe('1-1/2 in and 4-1/2"');
    expect(normalize('⅜-16 x ¾')).toBe('3/8-16 x 3/4');
  });

  it('unifies spellings that mean the same thing',()=>{
    expect(normalize('Cut Off wheels, cut-off discs, CUTOFF disks')).toBe('cutoff wheels, cutoff discs, cutoff discs');
    expect(normalize('hi-vis vest, high visibility vest')).toBe('hivis vest, hivis vest');
    expect(normalize('tie-downs')).toBe('tiedown');
    expect(normalize('4×6, 2”, 27’')).toBe('4 x 6, 2", 27\'');
  });
});

describe('stem',()=>{
  it.each([['gloves','glove'],['glasses','glass'],['boxes','box'],['brushes','brush'],['straps','strap'],['supplies','supply'],['plus','plus'],['gas','gas'],['class','class']])('%s -> %s',(word,stemmed)=>{
    expect(stem(word)).toBe(stemmed);
  });
});

describe('parseQuery: attributes',()=>{
  it('reads thread, grade and length the way a customer types them',()=>{
    expect(attrs('½-13 grade 8 hex cap screws 2 in')).toEqual({thread:'1/2-13',grade:'8'});
    expect(measures('½-13 grade 8 hex cap screws 2 in')).toEqual([['in',2]]);
    expect(words('½-13 grade 8 hex cap screws 2 in')).toEqual(['hex','cap','screw']);
  });

  it.each(['grade 8','Grade-8','gr8','gr. 8','G8'])('"%s" is Grade 8',text=>{
    expect(attrs(`${text} bolts`)).toEqual({grade:'8'});
  });

  it.each(['type 27','Type-27','T27','t-27'])('"%s" is Type 27',text=>{
    expect(attrs(`${text} cut-off wheels`)).toEqual({type:'27'});
  });

  it('reads type in roman numerals I to V',()=>{
    expect(attrs('type i wheels').type).toBe('1');
    expect(attrs('type iv wheels').type).toBe('4');
  });

  it('reads glove sizes without mistaking extra large for large',()=>{
    expect(attrs('large gloves').size).toBe('L');
    expect(attrs('extra large gloves').size).toBe('XL');
    expect(attrs('x-large gloves').size).toBe('XL');
    expect(attrs('XL gloves').size).toBe('XL');
    expect(attrs('gloves size m').size).toBe('M');
    expect(attrs('medium gloves').size).toBe('M');
  });

  it('reads hooks, grit, mil, class, gauge, finish and color',()=>{
    expect(attrs('ratchet straps with J-hooks')).toEqual({hook:'j'});
    expect(attrs('j hooks')).toEqual({hook:'j'});
    expect(attrs('flat hook straps')).toEqual({hook:'flat'});
    expect(attrs('60 grit flap discs')).toEqual({grit:'60'});
    expect(attrs('8 mil black nitrile gloves')).toEqual({mil:'8',color:'black'});
    expect(attrs('ANSI class 2 vest')).toEqual({class:'2'});
    expect(attrs('#12 tek screws')).toEqual({gauge:'12'});
    expect(attrs('yellow zinc hex bolts')).toEqual({finish:'yellow zinc'});
    expect(attrs('zinc plated nuts')).toEqual({finish:'zinc'});
    expect(attrs('clear safety glasses')).toEqual({color:'clear'});
  });

  it('does not read a size or grade out of ordinary words',()=>{
    expect(attrs('gloves for the shop')).toEqual({});
    expect(attrs('hook and loop sanding discs')).toEqual({});
    expect(attrs('N95 masks')).toEqual({});
    expect(words('N95 masks')).toEqual(['n95','mask']);
  });
});

describe('parseQuery: measures',()=>{
  it.each([
    ['30ft ratchet straps',[['ft',30]]],
    ['30 ft ratchet straps',[['ft',30]]],
    ['30 feet ratchet straps',[['ft',30]]],
    ['30-foot ratchet straps',[['ft',30]]],
    ["27' ratchet straps",[['ft',27]]],
    ['2" ratchet straps',[['in',2]]],
    ['2 inch ratchet straps',[['in',2]]],
    ['2-in ratchet straps',[['in',2]]],
    ['1-1/2 in bolts',[['in',1.5]]],
    ['1 1/2 in bolts',[['in',1.5]]],
    ['1½" bolts',[['in',1.5]]],
    ['4-1/2 cut-off wheels',[[null,4.5]]],
    ['0.045 wheels',[[null,0.045]]],
    ['3,333 lb straps',[['lb',3333]]],
  ])('"%s"',(text,expected)=>{
    expect(measures(text)).toEqual(expected);
  });

  it('shares a trailing unit across an "a x b x c" group',()=>{
    expect(measures('4.5 x .045 x 7/8 in wheels')).toEqual([['in',4.5],['in',0.045],['in',0.875]]);
    expect(measures('2 in x 27 ft strap')).toEqual([['in',2],['ft',27]]);
    expect(measures('cut-off wheels 4.5 x .045')).toEqual([[null,4.5],[null,0.045]]);
  });

  it('reads a 1/2 in bolt as a 1/2 in measure, and 1/2-13 as a thread, not a range',()=>{
    expect(measures('1/2 in grade 8 hex bolts')).toEqual([['in',0.5]]);
    expect(attrs('1/2-13 x 1-1/2 bolts')).toEqual({thread:'1/2-13'});
    expect(measures('1/2-13 x 1-1/2 bolts')).toEqual([[null,1.5]]);
    expect(attrs('3/8-1/2 in chain binder')).toEqual({});
    expect(measures('3/8-1/2 in chain binder')).toEqual([[null,0.375],['in',0.5]]);
  });
});

describe('parseQuery: quantities and filler',()=>{
  it('drops quantities so a count is never read as a size',()=>{
    expect(measures('10 boxes of 1/2 in grade 8 hex bolts')).toEqual([['in',0.5]]);
    expect(measures('need 2 in ratchet straps, maybe 12')).toEqual([['in',2]]);
    expect(measures('6 cut-off wheels')).toEqual([]);
    expect(measures('6 boxes of cut-off wheels')).toEqual([]);
    expect(measures('qty: 4 flap discs')).toEqual([]);
    expect(measures('12 ratchet straps 27 ft')).toEqual([['ft',27]]);
  });

  it('keeps a leading number that is a size',()=>{
    expect(measures('4.5 cut-off wheels')).toEqual([[null,4.5]]);
    expect(measures('2 in ratchet straps')).toEqual([['in',2]]);
    expect(measures('25 ft tape measure')).toEqual([['ft',25]]);
  });

  it('keeps words that describe the item and drops chat filler',()=>{
    expect(words('Please send the usual cut-off wheels for the shop')).toEqual(['cutoff','wheel','shop']);
    expect(words('stainless hex bolts')).toEqual(['stainless','hex','bolt']);
  });

  it('finds a typed SKU in any case or spacing and leaves the rest of the line alone',()=>{
    const skus=['HCS-12-13-2G8','CW-45-045-T1'];
    expect(parseQuery('hcs-12-13-2g8 please',skus)).toMatchObject({skus:['HCS-12-13-2G8'],attrs:[],measures:[],words:[]});
    expect(parseQuery('CW45045T1 wheels',skus)).toMatchObject({skus:['CW-45-045-T1'],words:['wheel']});
    expect(parseQuery('grade 8 bolts',skus).skus).toEqual([]);
  });
});

describe('saysUsual',()=>{
  it.each(['the usual gloves','our usual cut-off wheels','same as last time','gloves, same as before','our regular gloves','the normal ones','like last time','gloves as always'])('"%s" asks for the usual',text=>{
    expect(saysUsual(text)).toBe(true);
    expect(parseQuery(text).usual).toBe(true);
  });

  it.each(['gloves','nitrile gloves','the same size','last paid'])('"%s" does not',text=>{
    expect(saysUsual(text)).toBe(false);
  });
});

describe('parseItem',()=>{
  it('names the product and its noun, and reads the attributes a question can ask about',()=>{
    const bolt=parseItem(item('HCS-12-13-112G8','Hex cap screw 1/2-13 x 1-1/2 in, Grade 8, yellow zinc','bolt hex bolt'));
    expect(bolt).toMatchObject({sku:'HCS-12-13-112G8',name:'hex cap screw',noun:'hex cap screws',head:'screw'});
    expect(bolt.attr('thread')).toBe('1/2-13');
    expect(bolt.attr('grade')).toBe('8');
    expect(bolt.attr('finish')).toBe('yellow zinc');
    expect(bolt.slots).toEqual([{key:'in#0',value:1.5,label:'1-1/2 in'}]);
    // The thread's 1/2 in diameter matches "1/2 in", but it is not a size slot.
    expect(bolt.measures).toContainEqual({unit:'in',value:0.5,label:'1/2 in',implied:true});
    expect([...bolt.keywords]).toEqual(['bolt','hex']);
  });

  it('gives every dimension of an "a x b x c" group its own slot',()=>{
    const wheel=parseItem(item('CW-45-045-T27','Cut-off wheel 4.5 x .045 x 7/8 in, Type 27','cutoff cut off disc depressed center'));
    expect(wheel).toMatchObject({name:'cut-off wheel',noun:'cut-off wheels',head:'wheel'});
    expect(wheel.attr('type')).toBe('27');
    expect(wheel.slots.map(s=>[s.key,s.label])).toEqual([['in#0','4.5 in'],['in#1','.045 in'],['in#2','7/8 in']]);
    expect(wheel.words.has('cutoff')&&wheel.words.has('disc')).toBe(true);
  });

  it('reads straps, gloves, tape and glasses',()=>{
    const strap=parseItem(item('RS-2-27-JH','Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks','tie down strap'));
    expect(strap.slots.map(s=>[s.key,s.label])).toEqual([['in#0','2 in'],['ft#0','27 ft'],['lb#0','3,333 lb']]);
    expect(strap.attr('hook')).toBe('j');
    expect(strap.label('hook')).toBe('J-hooks');
    const gloves=parseItem(item('GLV-N8-XL-1000','Nitrile disposable gloves, 8 mil, black, size XL','gloves nitrile extra large'));
    expect(gloves).toMatchObject({name:'nitrile disposable gloves',noun:'nitrile disposable gloves',head:'glove'});
    expect([gloves.attr('mil'),gloves.attr('color'),gloves.attr('size')]).toEqual(['8','black','XL']);
    const tape=parseItem(item('DT-2-60-BK','Duct tape 2 in x 60 yd, black','tape'));
    expect(tape.noun).toBe('duct tape');
    const glasses=parseItem(item('SG-SMK-AF','Safety glasses, smoke anti-fog','glasses eye protection tinted'));
    expect(glasses).toMatchObject({noun:'safety glasses',head:'glass'});
    expect(glasses.attr('color')).toBe('smoke');
  });

  it('uses the whole name when it has no dimensions',()=>{
    expect(parseItem(item('RESP-N95-20','N95 particulate respirator','mask dust mask'))).toMatchObject({name:'n95 particulate respirator',head:'respirator'});
    expect(parseItem(item('TEK-12-1-HWH','Self-drilling screw #12 x 1 in, hex washer head'))).toMatchObject({name:'self-drilling screw',head:'screw'});
  });
});
