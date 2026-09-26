import {beforeAll,describe,expect,it} from 'vitest';
import type {CatalogItem,PurchasedItem} from '@/domain';
import {useSeededDatabase} from '../repository/test-db';
import {CONFIDENCE,NO_MATCH_QUESTION,isConfident,matchLine,resolveUsual,scoreItems,shortlist} from './index';

// Task 1.4's acceptance table: Dana's phrasings against the seeded catalog (62 SKUs with the
// deliberate near-duplicates) and Wasatch's real order history. Clear requests must be confident;
// a line that leaves a near-duplicate open (Grade 5 vs 8, 1-1/2 vs 2 in, Type 1 vs 27, 27 vs 30 ft)
// must not be, and must ask the question that settles it.

useSeededDatabase();

let catalog:CatalogItem[]=[];
let history:PurchasedItem[]=[];
beforeAll(async()=>{
  const {catalogItems,purchasedItems}=await import('../repository/customer');
  catalog=catalogItems();
  history=purchasedItems('wasatch');
});
const match=(line:string)=>matchLine(line,catalog,{purchases:history});
const top=(line:string)=>{const m=match(line);return m.confident?m.candidates[0].item.sku:`not confident: ${m.question}`;};

describe('clear requests are confident',()=>{
  it.each([
    // Bolts: size, thread, grade and length in the ways a customer types them.
    ['½-13 grade 8 hex cap screws 2 in','HCS-12-13-2G8'],
    ['1/2-13 x 2 grade 8 hex bolts','HCS-12-13-2G8'],
    ['hcs 1/2-13 x 2 gr 8','HCS-12-13-2G8'],
    ['hex cap screw 1/2-13 x 2 in grade 5','HCS-12-13-2G5'],
    ['1-1/2 in grade 8 hex bolts','HCS-12-13-112G8'],
    ['1½" gr8 hex bolts 1/2-13','HCS-12-13-112G8'],
    ['5/8-11 x 3 grade 8 bolts','HCS-58-11-3G8'],
    ['3/8-16 x 1 hex bolts','HCS-38-16-1G5'],
    // Dana always buys the 2 in: history fills in the one size she left out (mockup and golden script).
    ['1/2 in grade 8 hex bolts','HCS-12-13-2G8'],
    ['10 boxes of the 1/2 in grade 8 hex bolts','HCS-12-13-2G8'],
    ['1/2-13 grade 8 hex nuts','HN-12-13-G8'],
    ['1/2 in grade 8 flat washers','FW-12-G8'],
    ['wedge anchors 1/2','ANC-12-414-W'],
    ['tek screws','TEK-12-1-HWH'],
    // Abrasives.
    ['the usual cut-off wheels','CW-45-045-T1'],
    ['type 27 cut-off wheels 4.5 x .045','CW-45-045-T27'],
    ['4-1/2 in type 1 cutoff discs','CW-45-045-T1'],
    ['cut-off wheels type 1','CW-45-045-T1'],
    ['6 in cut-off wheels','CW-6-045-T1'],
    ['60 grit flap discs','FD-45-60Z'],
    // Safety.
    ['the usual gloves','GLV-N8-L-1000'],
    ['large black nitrile gloves 8 mil','GLV-N8-L-1000'],
    ['8 mil black nitrile gloves','GLV-N8-L-1000'],
    ['medium nitrile gloves 8 mil','GLV-N8-M-1000'],
    ['GLV-N8-M-1000','GLV-N8-M-1000'],
    ['clear safety glasses','SG-CLR-AF'],
    ['the usual safety glasses','SG-CLR-AF'],
    ['N95 masks','RESP-N95-20'],
    ['ear plugs','EP-FOAM-200'],
    ['hard hats','HH-T1-WHT'],
    // Straps and tape.
    ['27 ft ratchet straps','RS-2-27-JH'],
    ['2 in ratchet straps, 27 ft with J-hooks','RS-2-27-JH'],
    ['2 in x 30 ft ratchet straps','RS-2-30-FH'],
    ['4 in ratchet straps','RS-4-30-FH'],
    ['edge protectors','EDG-2-4PK'],
    ['ratchet strap edge protectors','EDG-2-4PK'],
    ['black duct tape','DT-2-60-BK'],
    ['3 in duct tape','DT-3-60'],
  ])('"%s" -> %s',(line,sku)=>{
    expect(top(line)).toBe(sku);
  });
});

describe('near-duplicates are not confident, and get the question that settles them',()=>{
  it.each([
    // Type 1 vs 27: never filled in from history, however often Dana buys Type 1.
    ['cut-off wheels','Type 1 or Type 27 cut-off wheels?'],
    ['6 boxes of cut-off wheels','Type 1 or Type 27 cut-off wheels?'],
    ['cut-off wheels 4.5','Type 1 or Type 27 cut-off wheels?'],
    ['4.5 cut-off wheel .045','Type 1 or Type 27 cut-off wheels?'],
    ['cut-off wheels type 27','.045 in or .090 in cut-off wheels?'],
    // Grade 5 vs 8.
    ['1/2-13 x 2 hex bolts','Grade 5 or Grade 8 hex cap screws?'],
    ['1/2 in hex bolts','Grade 5 or Grade 8 hex cap screws?'],
    ['hex bolts','Grade 5 or Grade 8 hex cap screws?'],
    ['hex nuts','Grade 5 or Grade 8 hex nuts?'],
    // 27 ft vs 30 ft, and 2 in vs 4 in wide.
    ['2 in ratchet straps','27 ft or 30 ft ratchet straps?'],
    ['30ft ratchet straps','2 in or 4 in ratchet straps?'],
    ['ratchet straps','1-1/2 in, 2 in or 4 in ratchet straps?'],
    ['the usual ratchet straps','1-1/2 in, 2 in or 4 in ratchet straps?'],
    // Other specs.
    ['gloves','Nitrile disposable gloves or cut-resistant gloves?'],
    ['nitrile gloves','6 mil or 8 mil nitrile disposable gloves?'],
    ['safety glasses','Clear or smoke safety glasses?'],
    ['flap discs','40 grit, 60 grit or 80 grit flap discs?'],
    ['duct tape','2 in or 3 in duct tape?'],
    // Words Herrick doesn't carry, and nothing at all.
    ['stainless hex bolts','Grade 5 or Grade 8 hex cap screws?'],
    ['xyzzy',NO_MATCH_QUESTION],
  ])('"%s" asks "%s"',(line,question)=>{
    expect(top(line)).toBe(`not confident: ${question}`);
  });

  it('keeps both halves of a near-duplicate on the shortlist',()=>{
    expect(match('cut-off wheels').candidates.map(c=>c.item.sku)).toEqual(expect.arrayContaining(['CW-45-045-T1','CW-45-045-T27']));
    expect(match('1/2-13 x 2 hex bolts').candidates.map(c=>c.item.sku).slice(0,2).sort()).toEqual(['HCS-12-13-2G5','HCS-12-13-2G8']);
    expect(match('2 in ratchet straps').candidates.map(c=>c.item.sku).slice(0,2)).toEqual(['RS-2-27-JH','RS-2-30-FH']);
  });
});

describe("Dana's mockup request, line by line (Q-24817)",()=>{
  // "Do you have the 1/2 in grade 8 hex bolts in stock? Need 10 boxes plus the usual cut-off wheels and
  // gloves. Also need 2 in ratchet straps, maybe 12." Querent asks about the straps only; Dana answers
  // "27 ft with J-hooks." The seeded quote has exactly these four SKUs.
  it('matches bolts, wheels and gloves, asks about the straps, then matches them',()=>{
    expect(['the 1/2 in grade 8 hex bolts','the usual cut-off wheels','the usual gloves'].map(top)).toEqual(['HCS-12-13-2G8','CW-45-045-T1','GLV-N8-L-1000']);
    expect(top('2 in ratchet straps, maybe 12')).toBe('not confident: 27 ft or 30 ft ratchet straps?');
    expect(top('2 in ratchet straps 27 ft with J-hooks')).toBe('RS-2-27-JH');
  });

  it('resolves "the usual" from order history, with the last qty',()=>{
    expect(resolveUsual('the usual gloves',catalog,history)).toMatchObject({item:{sku:'GLV-N8-L-1000'},order_count:4,last_qty:4});
    expect(resolveUsual('the usual cut-off wheels',catalog,history)).toMatchObject({item:{sku:'CW-45-045-T1'},order_count:5,last_qty:4});
    expect(resolveUsual('the usual ratchet straps',catalog,history)).toBeUndefined();
  });

  it('asks about the cut-off wheels without "the usual", as the scripted conversation does',()=>{
    expect(top('6 boxes of cut-off wheels')).toBe('not confident: Type 1 or Type 27 cut-off wheels?');
  });
});

describe('the tuned rule',()=>{
  it('is still the spec\'s starting rule: every table row passes with top >= 0.75 and a 0.15 lead',()=>{
    expect(CONFIDENCE).toEqual({minScore:0.75,minLead:0.15});
  });

  it('never calls a line confident without history when history is what decided it',()=>{
    for(const line of ['1/2 in grade 8 hex bolts','the usual gloves','the usual cut-off wheels','8 mil black nitrile gloves']){
      expect(isConfident(scoreItems(line,catalog,{purchases:history}))).toBe(true);
      expect(isConfident(scoreItems(line,catalog))).toBe(false);
    }
  });

  it('shortlists the contenders and a few runners-up, never the weak tail',()=>{
    const scored=scoreItems('2 in ratchet straps',catalog,{purchases:history});
    expect(scored.length).toBeGreaterThan(3);
    expect(shortlist(scored).map(c=>[c.item.sku,c.score])).toEqual([['RS-2-27-JH',1],['RS-2-30-FH',1],['EDG-2-4PK',0.6]]);
    expect(shortlist(scored,1).map(c=>c.item.sku)).toEqual(['RS-2-27-JH']);
    // A weak best match keeps its near rivals, so the question has something to point at.
    expect(shortlist([{item:'a',score:0.3},{item:'b',score:0.2},{item:'c',score:0.1}]).map(c=>c.item)).toEqual(['a','b']);
  });
});
