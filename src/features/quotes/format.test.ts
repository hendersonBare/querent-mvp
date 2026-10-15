import {describe,expect,it} from 'vitest';
import {decimalPlaces,formatDateTime,formatMoney,formatQuantity,formatScore,formatUnitPrice,lineTotal,quoteTotal} from './format';
import {line,quote} from './test-fixtures';

// Money on the quotes pages (docs/boxt/plan.md B6): totals and line totals as $1,234.56, rounded half
// up to cents exactly as the database's quote_summaries view rounds them (round(qty × unit_price, 2) on
// numeric, no float error); unit prices with up to 4 decimals when they need them.

describe('formatMoney',()=>{
  it.each([
    [0,'$0.00'],
    [1,'$1.00'],
    [0.5,'$0.50'],
    [1234.56,'$1,234.56'],
    [1234567.8,'$1,234,567.80'],
    [2.535,'$2.54'],
    [2.545,'$2.55'],
    [1.005,'$1.01'],
    [0.004,'$0.00'],
    [0.005,'$0.01'],
    [99.995,'$100.00'],
  ])('%s → %s',(amount,text)=>{
    expect(formatMoney(amount)).toBe(text);
  });
});

describe('formatUnitPrice',()=>{
  it.each([
    [0,'$0.00'],
    [0.8,'$0.80'],
    [1.05,'$1.05'],
    [0.375,'$0.375'],
    [31.495,'$31.495'],
    [0.1234,'$0.1234'],
    [1250,'$1,250.00'],
  ])('%s → %s',(price,text)=>{
    expect(formatUnitPrice(price)).toBe(text);
  });
});

describe('lineTotal and quoteTotal',()=>{
  it('multiply exactly and round half up to cents',()=>{
    // 3 × 0.845 is 2.5349999… in floating point; the database (numeric) says 2.54.
    expect(lineTotal(3,0.845)).toBe(2.54);
    expect(lineTotal(4,31.495)).toBe(125.98);
    expect(lineTotal(200,0.375)).toBe(75);
    expect(lineTotal(2.5,0.3333)).toBe(0.83);
    expect(lineTotal(7,0.0005)).toBe(0);
    expect(lineTotal(1,0.005)).toBe(0.01);
  });

  it('are null for a line missing its quantity or price',()=>{
    expect(lineTotal(null,1)).toBeNull();
    expect(lineTotal(3,null)).toBeNull();
  });

  it('sum the rounded totals of matched lines that have both, like the view',()=>{
    expect(quoteTotal(quote().lines)).toBe(1775.98);
    // 3 × 0.845 → 2.54 and 3 × 0.845 → 2.54: rounding per line, not on the sum (5.07).
    expect(quoteTotal([line({quantity:3,unitPrice:0.845}),line({quantity:3,unitPrice:0.845})])).toBe(5.08);
    expect(quoteTotal([line({unmatched:true,sku:null,matchedBy:null,quantity:2,unitPrice:5}),line({unitPrice:null})])).toBe(0);
  });
});

describe('decimalPlaces',()=>{
  it.each([[1,0],[1.5,1],[0.375,3],[0.1234,4],[1.23456,5],[1e-7,7],[100,0]])('%s has %s',(n,places)=>{
    expect(decimalPlaces(n)).toBe(places);
  });
});

describe('formatQuantity and formatScore',()=>{
  it('print quantities with grouping and their decimals',()=>{
    expect(formatQuantity(1500)).toBe('1,500');
    expect(formatQuantity(2.5)).toBe('2.5');
    expect(formatQuantity(4)).toBe('4');
  });

  it('print scores to two decimals',()=>{
    expect(formatScore(0.58)).toBe('0.58');
    expect(formatScore(0.5)).toBe('0.50');
    expect(formatScore(null)).toBe('None');
  });
});

describe('formatDateTime',()=>{
  it('prints the date and time in the given time zone',()=>{
    const text=formatDateTime('2026-10-15T14:05:00.000Z','UTC').replace(/\s/g,' ');
    expect(text).toBe('Oct 15, 2026, 2:05 PM');
    expect(formatDateTime('2026-10-15T14:05:00.000Z','America/Chicago').replace(/\s/g,' ')).toBe('Oct 15, 2026, 9:05 AM');
  });
});
