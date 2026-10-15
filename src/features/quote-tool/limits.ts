// The number limits a saved quote line has (quote_lines: quantity numeric(14,3) > 0, unit_price
// numeric(12,4) >= 0), shared by the review dialog and POST /api/quotes so what the rep sees is what is
// saved. Line totals are round(quantity × unit price, 2) per line, as the quote_summaries view computes
// them (review.ts lineCents). B6 adds the same limits under src/features/quotes/; to be reconciled at merge.

export const QUANTITY_DECIMALS=3;
export const PRICE_DECIMALS=4;
export const MAX_QUANTITY=1e9;
export const MAX_UNIT_PRICE=1e7;

export const QUANTITY_HINT=`More than 0, up to ${QUANTITY_DECIMALS} decimals`;
export const PRICE_HINT=`0 or more, up to ${PRICE_DECIMALS} decimals`;
