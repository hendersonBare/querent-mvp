// Shared money helper (decision 7, spec conventions "Money"). New money math is integer cents; this
// is the one rounding rule behind it. Pure, so client code may import it too.
//
// - roundCents(x): fractional cents to integer cents, half away from zero (4212.857 -> 4213,
//   -0.5 -> -1). x is first cleaned of float noise at 12 significant digits (100.49999999999999,
//   which is 1.005 * 100, counts as 100.5).
// - toCents(dollars) = roundCents(dollars * 100), so 1.005 -> 101. fromCents(c) = c / 100.
// - roundDollars(n) = fromCents(toCents(n)): a REAL dollar amount rounded to the cent. It replaced
//   quotes/snapshot.ts cents(), freight/engine.ts round2() and repository/sql.ts round2(). It keeps
//   the toPrecision(12) cleanup of the first two (the repository's +EPSILON misses half cents from
//   about $2 up: 4.015 -> 4.01), and differs from all three only on a negative exact half cent, which now
//   rounds away from zero (-0.125 -> -0.13, was -0.12). money.test.ts holds the table.

export function roundCents(fractionalCents:number){
  const clean=Number(fractionalCents.toPrecision(12));
  const cents=Math.sign(clean)*Math.round(Math.abs(clean));
  return cents===0?0:cents; // no -0; NaN passes through
}

export const toCents=(dollars:number)=>roundCents(dollars*100);
export const fromCents=(cents:number)=>cents/100;
export const roundDollars=(dollars:number)=>fromCents(toCents(dollars));
