import {describe,expect,it} from 'vitest';
import {STRICTNESS_LEVELS,type StrictnessLevel} from '@/features/settings/strictness';
import {CASES,NO_MATCH_WHYS,withoutSupplierSku} from './cases';
import {HELDOUT_BARE_SIZES} from './heldout';
import {decide} from '@/server/matching/decide';
import {parseItemSpec} from '@/server/matching/packaging';
import {NON_DEFINING_WORDS} from '@/server/matching/score-packaging';
import {retrieve} from '@/server/matching/retrieve';
import {matchConfig} from '@/features/settings/strictness';
import {CATALOG,JUDGES,RECORDED_BY,RECORDING,judgeCandidates,judgeVerdict,retrieveAt,runCase,runEval} from './run';

// The false-positive gate (BOXT task B3, product rule 1: prefer false negatives over false
// positives). Every hand-written line runs through the real scorer (retrieve), the judge and
// decide() against the real BOXT catalog, at each strictness level, with the recorded judge and with
// a judge that always agrees with the scorer. A must-not-match line that matches fails the build.

const atOrStricterThan=(level:StrictnessLevel)=>STRICTNESS_LEVELS.slice(0,STRICTNESS_LEVELS.indexOf(level)+1);
const skus=new Set(CATALOG.map(row=>row.sku));
const mustMatch=CASES.filter(c=>c.expect!=='no_match');
const mustNot=CASES.filter(c=>c.expect==='no_match');

describe('the evaluation set',()=>{
  it('has at least 40 lines: 12 or more must-match, 25 or more must-not-match, every reason covered',()=>{
    expect(CASES.length).toBeGreaterThanOrEqual(40);
    expect(mustMatch.length).toBeGreaterThanOrEqual(12);
    expect(mustNot.length).toBeGreaterThanOrEqual(25);
    expect(new Set(mustNot.map(c=>c.why))).toEqual(new Set(NO_MATCH_WHYS));
  });

  it('has unique ids, a reason and a level on every must-not-match line, and a note on every line',()=>{
    expect(new Set(CASES.map(c=>c.id)).size).toBe(CASES.length);
    for(const c of mustNot){
      expect(NO_MATCH_WHYS,c.id).toContain(c.why);
      expect(STRICTNESS_LEVELS,c.id).toContain(c.level);
    }
    for(const c of CASES)expect(c.note.length,c.id).toBeGreaterThan(5);
  });

  it('expects only SKUs the catalog has',()=>{
    expect(mustMatch.map(c=>(c.expect as {sku:string}).sku).filter(sku=>!skus.has(sku))).toEqual([]);
  });

  it('passes the matcher the line without the supplier SKU, as the parser would',()=>{
    for(const c of CASES){
      expect(c.description,c.id).toBe(withoutSupplierSku(c.original));
      expect(c.description,c.id).not.toMatch(/^S-\d/);
    }
    expect(withoutSupplierSku('S-4128 12 x 10 x 8" Corrugated Boxes')).toBe('12 x 10 x 8" Corrugated Boxes');
    expect(withoutSupplierSku('12 x 10 x 8" Corrugated Boxes')).toBe('12 x 10 x 8" Corrugated Boxes');
  });

  it('says how the verdicts were recorded: by hand, or by the live judge (npm run eval:record)',()=>{
    expect(['hand-written','live']).toContain(RECORDED_BY);
  });

  it('gives the judge what the pipeline gives it (B4\'s JudgeCandidate), and validates its answer with B4\'s guard',()=>{
    const c=CASES.find(x=>x.id==='m01-box-12x10x8')!;
    const r=retrieve(c.description,CATALOG,matchConfig('strict'));
    expect(judgeCandidates(r)[0]).toEqual({sku:'12108-BDL',description:'Corrugated Boxes 12x10x8", 32 ECT single wall, bundle pricing',pack:'Bundle of 25',category:'boxes'});
    expect(judgeVerdict(c,r,'recorded')).toEqual({sku:'12108-BDL',reason:RECORDING[c.id].reason});
    expect(judgeVerdict({...c,id:'m02-box-12x10x6'},r,'recorded')).toEqual({sku:null,reason:'not_in_candidates'});
  });

  it('has a recorded verdict for every line and no other, naming only catalog SKUs',()=>{
    expect(Object.keys(RECORDING).sort()).toEqual(CASES.map(c=>c.id).sort());
    for(const [id,verdict] of Object.entries(RECORDING)){
      if(verdict.sku!==null)expect(skus.has(verdict.sku),id).toBe(true);
      expect(verdict.reason.length,id).toBeGreaterThan(5);
    }
  });
});

describe('the catalog facts the scorer relies on',()=>{
  it('never lets a non-defining description word tell two catalog items apart (each is on every item of its kind)',()=>{
    const specs=CATALOG.map(row=>parseItemSpec(row));
    for(const word of NON_DEFINING_WORDS){
      const withWord=specs.filter(s=>s.descWords.includes(word));
      expect(withWord.length,word).toBeGreaterThanOrEqual(2);
      // A line that says everything else an item with the word says must not also describe an item
      // without it: no item of the same product (head noun) without the word has description words all
      // within another's (minus the word).
      const clash=specs.filter(other=>!other.descWords.includes(word)&&other.descWords.length&&
        withWord.some(s=>other.head===s.head&&other.descWords.every(w=>w!==word&&s.descWords.includes(w))));
      expect([...new Set(clash.map(s=>s.name))],word).toEqual([]);
    }
  });
});

describe('the catalog facts the material implications rely on',()=>{
  it('no item with an ECT, burst rating, flute or wall states a material other than corrugated; none with a mil or gauge one other than poly',()=>{
    const specs=CATALOG.map(row=>({row,spec:parseItemSpec(row)}));
    const board=specs.filter(({spec})=>spec.ect!==null||spec.burst!==null||spec.choices.flute||spec.choices.wall);
    const film=specs.filter(({spec})=>spec.mil!==null||spec.gauge!==null);
    expect(board.length).toBeGreaterThan(100);
    expect(film.length).toBeGreaterThan(100);
    expect(board.filter(({spec})=>spec.materials.some(m=>m!=='corrugated')).map(({row})=>row.sku)).toEqual([]);
    expect(film.filter(({spec})=>spec.materials.some(m=>m!=='poly')).map(({row})=>row.sku)).toEqual([]);
  });
});

describe('no false positives',()=>{
  it.each(JUDGES)('no must-not-match line matches at Strict with the %s judge',judge=>{
    const matched=mustNot.map(c=>runCase(c,'strict',judge)).filter(r=>r.outcome==='matched');
    expect(matched.map(r=>`${r.id} -> ${r.sku}`)).toEqual([]);
  });

  it.each(JUDGES)('no must-not-match line matches at its declared level (or any stricter one) with the %s judge',judge=>{
    const matched=mustNot.flatMap(c=>atOrStricterThan(c.level!).map(level=>runCase(c,level,judge))).filter(r=>r.outcome==='matched');
    expect(matched.map(r=>`${r.id} @ ${r.level} -> ${r.sku}`)).toEqual([]);
  });

  it('no held-out bare size (round 2\'s 710) matches at any level, even with a judge that always agrees',()=>{
    expect(HELDOUT_BARE_SIZES.length).toBe(710);
    for(const level of STRICTNESS_LEVELS){
      const matched=HELDOUT_BARE_SIZES.filter(line=>{const r=retrieveAt(line,level);return decide(r,{sku:r.top?.item.sku??null}).outcome==='matched';});
      expect(matched,level).toEqual([]);
    }
  });

  it('holds every held-out and B3b must-not-match line at Strict, and says why (total accounting or score/lead)',()=>{
    const lines=mustNot.filter(c=>c.tags?.length);
    expect(lines.length).toBeGreaterThanOrEqual(150);
    for(const c of lines){
      const r=retrieveAt(c.description,'strict');
      expect(r.clears,c.id).toBe(false);
      if(r.top&&!r.eligibility.strictEligible)expect(r.eligibility.blockers.length,c.id).toBeGreaterThan(0);
    }
  });

  it.each(JUDGES)('no must-match line gets a wrong item at Strict with the %s judge',judge=>{
    const wrong=mustMatch.map(c=>runCase(c,'strict',judge)).filter(r=>r.outcome==='matched'&&!r.correct);
    expect(wrong.map(r=>`${r.id} -> ${r.sku}`)).toEqual([]);
  });
});

describe('recall',()=>{
  it('keeps Strict recall with the recorded judge at the calibrated level (src/eval/README.md)',()=>{
    const {metrics}=runEval('strict','recorded');
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBeGreaterThanOrEqual(0.9);
  });

  it('never matches less at a looser level',()=>{
    for(const judge of JUDGES){
      const [s,b,l]=STRICTNESS_LEVELS.map(level=>runEval(level,judge).metrics.matched);
      expect(b,judge).toBeGreaterThanOrEqual(s);
      expect(l,judge).toBeGreaterThanOrEqual(b);
    }
  });
});
