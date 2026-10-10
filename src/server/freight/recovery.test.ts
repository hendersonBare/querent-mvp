import {describe,expect,it} from 'vitest';
import {allocateRecovery,carriesRecovery,customerUnitPrice,recoveryGoodsCents,type RecoveryLine} from './recovery';

// Margin-weighted allocation within a quote (spec §4.5, decision 33; OA-5, OA-6, OA-16, OA-24;
// test plan §12 "Allocation").

const line=(line_no:number,qty:number,unitPriceCents:number|null,unitCostCents:number,basis:RecoveryLine['basis']='custom'):RecoveryLine=>({line_no,qty,unitPriceCents,unitCostCents,basis});
const allocate=(rateBp:number,lines:RecoveryLine[],lineCapBp=800)=>allocateRecovery({rateBp,lineCapBp,lines});
/** The decision-log quote: 20,000¢ of goods, so 500 bp is its $10.00 target. */
const BOLTS=line(1,1,2000,1900,'list'),DRILL=line(2,1,18000,15000,'customer');

describe('allocateRecovery',()=>{
  it('reproduces the decision-log example: target $10.00 -> bolts +$0.32, drill +$9.68 (remainder to the drill)',()=>{
    // goods 20,000¢ at 500 bp = 1,000¢. Margins 100¢ and 3,000¢: floor(32.26)=32, floor(967.74)=967, remainder 1¢ to the drill.
    expect(allocate(500,[BOLTS,DRILL])).toEqual([{line_no:1,freight_recovery:32},{line_no:2,freight_recovery:968}]);
  });

  it('divides a line\'s share by qty and rounds per unit: 10 boxes of bolts at $2.00 recover 3¢ a box (30¢), the customer sees $2.03',()=>{
    const result=allocate(500,[line(1,10,200,190,'list'),DRILL]);
    expect(result).toEqual([{line_no:1,freight_recovery:3},{line_no:2,freight_recovery:968}]);
    expect(customerUnitPrice(2,result[0].freight_recovery)).toBe(2.03);
  });

  it('gives nothing when every eligible line has zero or negative margin',()=>{
    expect(allocate(500,[line(1,1,2000,2000),line(2,3,1500,1600)])).toEqual([{line_no:1,freight_recovery:0},{line_no:2,freight_recovery:0}]);
  });

  it('gives zero- and negative-margin lines nothing while the others share the whole target',()=>{
    // goods 2,000 + 2,000 + 10,000 = 14,000¢ at 500 bp = 700¢, all of it on line 3 (the only positive margin).
    expect(allocate(500,[line(1,1,2000,2000),line(2,1,2000,2500),line(3,1,10000,5000)])).toEqual([
      {line_no:1,freight_recovery:0},{line_no:2,freight_recovery:0},{line_no:3,freight_recovery:700}]);
  });

  it('exempts contract lines: no share, and their value does not raise the target (OA-16)',()=>{
    // The contract line would add 100,000¢ of goods; without it the target is 500 bp of 20,000¢ = 1,000¢.
    expect(allocate(500,[BOLTS,line(2,10,10000,2000,'contract'),line(3,1,18000,15000,'customer')])).toEqual([
      {line_no:1,freight_recovery:32},{line_no:2,freight_recovery:0},{line_no:3,freight_recovery:968}]);
  });

  it('skips unpriced and zero-qty lines',()=>{
    // Only line 3 counts: 500 bp of 18,000¢ = 900¢.
    expect(allocate(500,[line(1,1,null,1900),line(2,0,2000,1000),line(3,1,18000,15000)])).toEqual([
      {line_no:1,freight_recovery:0},{line_no:2,freight_recovery:0},{line_no:3,freight_recovery:900}]);
  });

  it('caps each line at line_cap of its unit price and drops the excess (spec example: a $5.00 item at 1000 bp -> +$0.40)',()=>{
    expect(allocate(1000,[line(1,1,500,100)])).toEqual([{line_no:1,freight_recovery:40}]);
    // The cap on one line is not handed to another (OA-5): the bolts are capped at 160¢, the drill keeps its own share.
    expect(allocate(5000,[line(1,1,2000,1000),line(2,1,18000,17000)])).toEqual([{line_no:1,freight_recovery:160},{line_no:2,freight_recovery:1440}]);
  });

  it('gives the rounding remainder to the highest-margin line, and a tie to the lowest line_no (OA-24)',()=>{
    // goods 3,010,000¢ at 1 bp = 301¢; margins 500,000 / 500,000 / 510,000: floors 99 + 99 + 101 = 299, remainder 2¢ to line 6.
    expect(allocate(1,[line(5,1,1_000_000,500_000),line(4,1,1_000_000,500_000),line(6,1,1_010_000,500_000)])).toEqual([
      {line_no:5,freight_recovery:99},{line_no:4,freight_recovery:99},{line_no:6,freight_recovery:103}]);
    // goods 2,030,000¢ at 1 bp = 203¢ split over equal margins: floors 101 + 101, remainder 1¢ to line 2 (lowest line_no, not first in order).
    expect(allocate(1,[line(7,1,1_015_000,500_000),line(2,1,1_015_000,500_000)])).toEqual([{line_no:7,freight_recovery:101},{line_no:2,freight_recovery:102}]);
  });

  it('gives nothing on an empty quote or at rate 0',()=>{
    expect(allocate(500,[])).toEqual([]);
    expect(allocate(0,[BOLTS,DRILL])).toEqual([{line_no:1,freight_recovery:0},{line_no:2,freight_recovery:0}]);
  });

  it('throws on a rate or cap it cannot use',()=>{
    expect(()=>allocate(-1,[BOLTS])).toThrow(RangeError);
    expect(()=>allocate(1.5,[BOLTS])).toThrow(RangeError);
    expect(()=>allocate(500,[BOLTS],-5)).toThrow(RangeError);
  });
});

describe('recoveryGoodsCents',()=>{
  it('sums non-contract priced lines with qty above 0',()=>{
    expect(recoveryGoodsCents([BOLTS,DRILL,line(3,10,10000,1,'contract'),line(4,2,null,1),line(5,0,999,1)])).toBe(20000);
  });
});

describe('carriesRecovery (spec §4.5)',()=>{
  const base={enabled:true,fulfillment:'delivery' as const,overridden:false,subtotal:1500,freeThreshold:1500,callForFreight:false};
  it('holds only when every condition does',()=>{
    expect(carriesRecovery(base)).toBe(true);
    expect(carriesRecovery({...base,enabled:false})).toBe(false);
    expect(carriesRecovery({...base,fulfillment:'will_call'})).toBe(false);
    expect(carriesRecovery({...base,overridden:true})).toBe(false);
    expect(carriesRecovery({...base,subtotal:1499.99})).toBe(false);
    expect(carriesRecovery({...base,callForFreight:true})).toBe(false);
  });
});

describe('customerUnitPrice',()=>{
  it('is the unit price plus the recovery, and exactly the unit price with none',()=>{
    expect(customerUnitPrice(180,968)).toBe(189.68);
    expect(customerUnitPrice(31.5,95)).toBe(32.45);
    expect(customerUnitPrice(0.0825,0)).toBe(0.0825);
    expect(customerUnitPrice(0.1,20)).toBe(0.3);
  });
});
