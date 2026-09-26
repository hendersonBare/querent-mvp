import {describe,expect,it} from 'vitest';
import type {CatalogItem} from '@/domain';
import {catalogItem,catalogItems,purchasedItems} from '@/server/repository/customer';
import {clarifyingQuestion,isConfident,scoreCatalog} from './scorer';
import {useSeededDatabase} from '../repository/test-db';

useSeededDatabase();

const catalog=()=>catalogItems();
const history=()=>purchasedItems('wasatch');

describe('catalog match scoring table',()=>{
  it.each([
    ['1/2-13 x 2 in grade 8 hex cap screws','HCS-12-13-2G8'],
    ['half inch grade 8 hex bolts','HCS-12-13-2G8'],
    ['black 8 mil nitrile gloves size large','GLV-N8-L-1000'],
    ['2 in x 27 ft ratchet straps with J-hooks','RS-2-27-JH'],
    ['silver duct tape 2 in x 60 yd','DT-2-60'],
    ['4.5 inch 60 grit flap wheels','FD-45-60Z'],
  ])('confidently matches %j to %s',(query,sku)=>{
    const candidates=scoreCatalog(query,catalog(),history());
    expect(candidates[0]).toMatchObject({sku});
    expect(isConfident(candidates)).toBe(true);
  });

  it('uses order history to resolve the mockup bolt wording without guessing a never-purchased length',()=>{
    const candidates=scoreCatalog('10 boxes of the 1/2 in grade 8 hex bolts',catalog(),history());
    expect(candidates.slice(0,2).map(c=>c.sku)).toEqual(['HCS-12-13-2G8','HCS-12-13-112G8']);
    expect(candidates[0].historyBoost).toBeGreaterThan(0);
    expect(isConfident(candidates)).toBe(true);
  });

  it('makes "the usual" a deterministic history boost, not a hard-coded SKU',()=>{
    const candidates=scoreCatalog('the usual cut-off wheels',catalog(),history());
    expect(candidates[0]).toMatchObject({sku:'CW-45-045-T1'});
    expect(candidates[0].historyBoost).toBe(0.18);
    expect(isConfident(candidates)).toBe(true);
  });

  it('ranks deterministically by score, then SKU',()=>{
    const first=scoreCatalog('4.5 x .045 cut off discs',catalog(),[]);
    const second=scoreCatalog('4.5 x .045 cut off discs',[...catalog()].reverse(),[]);
    expect(first.map(c=>[c.sku,c.score])).toEqual(second.map(c=>[c.sku,c.score]));
    expect(first.slice(0,2).map(c=>c.sku)).toEqual(['CW-45-045-T1','CW-45-045-T27']);
  });

  it('returns no candidates for an empty or request-only phrase',()=>{
    expect(scoreCatalog('   ',catalog(),history())).toEqual([]);
    expect(scoreCatalog('please quote ten boxes',catalog(),history())).toEqual([]);
  });
});

describe('confidence rule',()=>{
  const item=(sku:string):CatalogItem=>catalogItem(sku)!;
  const candidate=(sku:string,score:number)=>({...item(sku),score,lexicalScore:score,historyBoost:0});

  it('requires top >= .75 and a lead >= .15',()=>{
    expect(isConfident([candidate('CW-45-045-T1',.75),candidate('CW-45-045-T27',.60)])).toBe(true);
    expect(isConfident([candidate('CW-45-045-T1',.749),candidate('CW-45-045-T27',.40)])).toBe(false);
    expect(isConfident([candidate('CW-45-045-T1',.90),candidate('CW-45-045-T27',.751)])).toBe(false);
  });

  it('accepts one candidate only when its own score clears the floor',()=>{
    expect(isConfident([candidate('CW-45-045-T1',.75)])).toBe(true);
    expect(isConfident([candidate('CW-45-045-T1',.74)])).toBe(false);
    expect(isConfident([])).toBe(false);
  });
});

describe('clarifying questions',()=>{
  it.each([
    ['4.5 x .045 cut-off wheels',[],/Type 1 or Type 27 cut-off wheels\?/],
    ['1\/2-13 x 2 in hex cap screws',[],/Grade 5 or Grade 8 hex cap screws\?/],
    ['2 in ratchet straps',[],/27 ft or 30 ft/],
  ] as const)('asks about the distinguishing attribute for %j',(query,customerHistory,question)=>{
    const candidates=scoreCatalog(query,catalog(),customerHistory);
    expect(isConfident(candidates)).toBe(false);
    expect(clarifyingQuestion(candidates)).toMatch(question);
  });

  it('falls back to named choices when descriptions have no recognized differing attribute',()=>{
    const candidates=scoreCatalog('safety glasses',catalog(),[]);
    expect(clarifyingQuestion(candidates)).toContain('clear anti-fog');
    expect(clarifyingQuestion(candidates)).toContain('smoke anti-fog');
  });
});
