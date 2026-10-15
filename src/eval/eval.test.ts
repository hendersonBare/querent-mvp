import {describe,expect,it} from 'vitest';
import {STRICTNESS_LEVELS,type StrictnessLevel} from '@/features/settings/strictness';
import {CASES,NO_MATCH_WHYS,withoutSupplierSku} from './cases';
import {CATALOG,JUDGES,RECORDING,runCase,runEval} from './run';

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

  it('has a recorded verdict for every line and no other, naming only catalog SKUs',()=>{
    expect(Object.keys(RECORDING).sort()).toEqual(CASES.map(c=>c.id).sort());
    for(const [id,verdict] of Object.entries(RECORDING)){
      if(verdict.sku!==null)expect(skus.has(verdict.sku),id).toBe(true);
      expect(verdict.reason.length,id).toBeGreaterThan(5);
    }
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
