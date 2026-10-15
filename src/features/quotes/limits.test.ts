import {describe,expect,it} from 'vitest';
import {LIMIT_COPY,QUOTE_LIMITS,priceProblem,quantityProblem,quantitySchema,unitPriceSchema} from './limits';

// The line limits the database enforces (quote_lines.quantity numeric(14,3), unit_price numeric(12,4);
// the create_quote / update_quote checks), in one module the API and the forms share (B5 reuses it).

describe('QUOTE_LIMITS',()=>{
  it('match the columns: quantity 3 decimals below 10^11, price 4 decimals below 10^8',()=>{
    expect(QUOTE_LIMITS).toMatchObject({quantityDecimals:3,quantityBelow:100_000_000_000,priceDecimals:4,priceBelow:100_000_000,textMax:200,linesMax:200});
  });
});

describe('quantityProblem',()=>{
  it.each([1,2.5,0.001,1.234,1500,99_999_999_999.999])('accepts %s',n=>{
    expect(quantityProblem(n)).toBeNull();
  });
  it.each([
    [0,LIMIT_COPY.quantityPositive],
    [-1,LIMIT_COPY.quantityPositive],
    [1.2345,LIMIT_COPY.quantityDecimals],
    [0.0001,LIMIT_COPY.quantityMinimum],
    [0.0004,LIMIT_COPY.quantityMinimum],
    [100_000_000_000,LIMIT_COPY.quantityTooLarge],
    [Number.NaN,LIMIT_COPY.quantityPositive],
    [Number.POSITIVE_INFINITY,LIMIT_COPY.quantityTooLarge],
  ])('refuses %s: %s',(n,message)=>{
    expect(quantityProblem(n)).toBe(message);
  });
});

describe('priceProblem',()=>{
  it.each([0,0.375,0.1234,1.05,99_999_999.9999])('accepts %s',n=>{
    expect(priceProblem(n)).toBeNull();
  });
  it.each([
    [-0.01,LIMIT_COPY.priceNegative],
    [1.23456,LIMIT_COPY.priceDecimals],
    [100_000_000,LIMIT_COPY.priceTooLarge],
  ])('refuses %s: %s',(n,message)=>{
    expect(priceProblem(n)).toBe(message);
  });
});

describe('the zod schemas',()=>{
  it('use the same rules and messages',()=>{
    expect(quantitySchema.safeParse(1.234).success).toBe(true);
    const tooPrecise=quantitySchema.safeParse(1.2345);
    expect(tooPrecise.success).toBe(false);
    expect(tooPrecise.error?.issues[0].message).toBe(LIMIT_COPY.quantityDecimals);
    expect(quantitySchema.safeParse(0.0001).error?.issues[0].message).toBe(LIMIT_COPY.quantityMinimum);
    expect(quantitySchema.safeParse('2').success).toBe(false);
    expect(unitPriceSchema.safeParse(0.1234).success).toBe(true);
    expect(unitPriceSchema.safeParse(0.12345).error?.issues[0].message).toBe(LIMIT_COPY.priceDecimals);
  });
});
