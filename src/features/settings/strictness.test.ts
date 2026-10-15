import {describe,expect,it} from 'vitest';
import {DEFAULT_LEVEL,LEVELS,STRICTNESS_LEVELS,isStrictnessLevel,matchConfig} from './strictness';

describe('match strictness',()=>{
  it('has three levels, Strict first, and Strict is the default',()=>{
    expect(STRICTNESS_LEVELS).toEqual(['strict','balanced','lenient']);
    expect(Object.keys(LEVELS)).toEqual(['strict','balanced','lenient']);
    expect(DEFAULT_LEVEL).toBe('strict');
  });

  it('labels and describes each level in one sentence for the Settings page',()=>{
    expect(LEVELS.strict.label).toBe('Strict');
    expect(LEVELS.balanced.label).toBe('Balanced');
    expect(LEVELS.lenient.label).toBe('Lenient');
    for(const level of STRICTNESS_LEVELS){
      const {description}=LEVELS[level];
      expect(description,level).toMatch(/^[A-Z].*\.$/);
      expect(description.split(/\.\s/).length,level).toBe(1);
    }
  });

  it('gets looser from Strict to Lenient, never looser than a 0.5 score',()=>{
    const [s,b,l]=STRICTNESS_LEVELS.map(level=>LEVELS[level]);
    expect(s.minScore).toBeGreaterThanOrEqual(b.minScore);
    expect(b.minScore).toBeGreaterThanOrEqual(l.minScore);
    expect(s.minLead).toBeGreaterThanOrEqual(b.minLead);
    expect(b.minLead).toBeGreaterThanOrEqual(l.minLead);
    expect(s.minScore+s.minLead).toBeGreaterThan(b.minScore+b.minLead);
    expect(b.minScore+b.minLead).toBeGreaterThan(l.minScore+l.minLead);
    expect(l.minScore).toBeGreaterThanOrEqual(0.5);
    for(const level of STRICTNESS_LEVELS){
      expect(LEVELS[level].minScore).toBeLessThanOrEqual(1);
      expect(LEVELS[level].minLead).toBeGreaterThan(0);
    }
  });

  it('gives the matcher its rule, falling back to the default for an unknown level',()=>{
    expect(matchConfig('strict')).toEqual({minScore:LEVELS.strict.minScore,minLead:LEVELS.strict.minLead});
    expect(matchConfig('lenient')).toEqual({minScore:LEVELS.lenient.minScore,minLead:LEVELS.lenient.minLead});
    expect(matchConfig('nonsense' as never)).toEqual(matchConfig(DEFAULT_LEVEL));
  });

  it('recognizes stored values',()=>{
    expect(isStrictnessLevel('balanced')).toBe(true);
    expect(isStrictnessLevel('loose')).toBe(false);
    expect(isStrictnessLevel(null)).toBe(false);
  });
});
