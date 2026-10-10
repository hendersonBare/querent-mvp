import {describe,expect,it} from 'vitest';
import {fromCents,roundCents,roundDollars,toCents} from './money';

// Shared money helper (spec conventions "Money", decision 7, test plan §12).

// The three helpers T1 replaces, copied verbatim so the table below proves what changed and what did not.
const snapshotCents=(n:number)=>Math.round(Number((n*100).toPrecision(12)))/100; // quotes/snapshot.ts cents
const freightRound2=(n:number)=>Math.round(Number((n*100).toPrecision(12)))/100; // freight/engine.ts round2
const repositoryRound2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;      // repository/sql.ts round2

describe('toCents',()=>{
  it.each([[0,0],[1.005,101],[1.015,102],[31.95,3195],[0.1+0.2,30],[2.675,268],[0.0825,8],[1000.005,100001],[-1.005,-101],[-31.95,-3195]])('%s dollars is %s cents',(dollars,cents)=>{
    expect(toCents(dollars)).toBe(cents);
  });
  it('never returns negative zero',()=>{expect(Object.is(toCents(-0.001),0)).toBe(true);});
});

describe('roundCents',()=>{
  it.each([[4212.857,4213],[4212.5,4213],[4212.4999,4212],[0.5,1],[-0.5,-1],[-2.5,-3],[-2.4,-2],[100.49999999999999,101],[0,0]])('rounds %s cents to %s (half away from zero)',(fractional,cents)=>{
    expect(roundCents(fractional)).toBe(cents);
  });
  it('never returns negative zero',()=>{expect(Object.is(roundCents(-0.4),0)).toBe(true);});
});

describe('fromCents',()=>{
  it.each([[3195,31.95],[101,1.01],[0,0],[-250,-2.5]])('%s cents is %s dollars',(cents,dollars)=>{expect(fromCents(cents)).toBe(dollars);});
});

describe('roundDollars, the one rounding function behind snapshot, freight and repository',()=>{
  // Values the app actually rounds: line totals (qty x unit price), sums of line totals, freight formulas, SQL sums.
  const SAME=[0,0.005,0.015,0.125,1.005,1.015,2.675,31.95,0.1+0.2,10*31.95,6*18.75,12*3.15,7*0.0825,250*0.0825,1122.4,1109.5,
    45+2.5*13.37,12.5+1.85*9.996,1234.5650000000001,0.30000000000000004,4212.857/100,-0.25,-12.34,-1.006,-31.954];
  it.each(SAME)('%s rounds the same as all three old helpers',n=>{
    expect(roundDollars(n)).toBe(snapshotCents(n));
    expect(roundDollars(n)).toBe(freightRound2(n));
    expect(roundDollars(n)).toBe(repositoryRound2(n));
  });

  // Documented differences. roundDollars uses the snapshot/freight toPrecision(12) noise cleanup, not the
  // repository's +EPSILON (EPSILON is below one ulp from $2 up, so it fails to rescue many half cents there),
  // and rounds a negative exact half cent away from zero instead of up.
  it.each([
    [2.135,2.14,2.14,2.13],              // EPSILON is too small to rescue these half cents
    [4.015,4.02,4.02,4.01],
    [10.075,10.08,10.08,10.07],
    [-1.005,-1.01,-1,-1],                 // negative half cent: away from zero
    [-0.125,-0.13,-0.12,-0.12],
  ])('%s rounds to %s (snapshot and freight gave %s, repository %s)',(n,now,toPrecision,epsilon)=>{
    expect(roundDollars(n)).toBe(now);
    expect(snapshotCents(n)).toBe(toPrecision);
    expect(freightRound2(n)).toBe(toPrecision);
    expect(repositoryRound2(n)).toBe(epsilon);
  });

  it('is fromCents(toCents(n)) and passes NaN through',()=>{
    for(const n of SAME)expect(roundDollars(n)).toBe(fromCents(toCents(n)));
    expect(roundDollars(Number.NaN)).toBeNaN();
  });
});
