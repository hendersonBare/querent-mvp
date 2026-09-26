import {priceOptions,suggestPrice,type PricedLine,type PricingInput} from './engine';
import {explainPrice} from './explain';

// The pricing engine (spec §5.1): pure, so both the server and the quote screen can use it.
// Server code that needs the facts from the database uses './service' (priceLines).
export * from './engine';
export * from './explain';

/** Everything the quote screen shows for one line: the price-basis dropdown, Querent's pick and "Why this price?". */
export function priceLine(input:PricingInput):PricedLine{
  const suggestion=suggestPrice(input);
  return {options:priceOptions(input,suggestion),suggestion,explanation:explainPrice(input,suggestion)};
}
