import {BROKEN_CASE_UPLIFT_PERCENT,SCARCITY_STOCK_MULTIPLE,SCARCITY_UPLIFT_PERCENT,querentFoundGp,scarcityAt,suggestPrice,type PriceSuggestion,type PricingInput,type SuggestedLine} from './engine';

// "Why this price?" (spec §4, §5.1): Querent's note on a line names the fact behind its price and
// ends with "+$X GP vs customer price". Plain ASCII signs, so the text prints in any PDF font.

const USD=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const day=(date:string,options:Intl.DateTimeFormatOptions)=>new Date(`${date}T00:00:00.000Z`).toLocaleDateString('en-US',{...options,timeZone:'UTC'});

/** "$1,109.50" */
export const formatMoney=(amount:number)=>USD.format(amount);

/** "+$5.50 GP vs customer price." (negative on a contract below customer price: "-$17.70 ...") */
export function formatGp(gp:number){return `${gp<0?'-':'+'}${formatMoney(Math.abs(gp))} GP vs customer price.`;}

/** "Aug 12", or "Oct 28, 2025" when the date is not in the pricing day's year. */
export function lastPaidDate(date:string,on:string){
  return day(date,date.slice(0,4)===on.slice(0,4)?{month:'short',day:'numeric'}:{month:'short',day:'numeric',year:'numeric'});
}

/** Querent's "Why this price?" note for one line. */
export function explainPrice(input:PricingInput,suggestion:PriceSuggestion=suggestPrice(input)):string{
  const {sources,qty}=input;
  const {contract,last_paid}=sources;
  const cap=suggestion.capped?`, capped at list ${formatMoney(sources.list_price)}`:'';
  const customer=suggestion.customerPrice===null?'':formatMoney(suggestion.customerPrice);
  let why:string;
  switch(suggestion.reason){
    case 'contract':
      why=`Contract price under ${contract!.contract_number}, good through ${day(contract!.ends_on,{month:'short',day:'numeric',year:'numeric'})}. Contract prices are binding, so Querent doesn't raise them.`;break;
    case 'last_paid':
      why=`Last paid ${formatMoney(last_paid!.unit_price)} on ${lastPaidDate(last_paid!.order_date,input.on)}, above customer price ${customer}${cap}.`;break;
    case 'broken_case':
      why=`Broken-case quantity: ${qty} is less than a full case of ${sources.case_qty}, so customer price ${customer} + ${BROKEN_CASE_UPLIFT_PERCENT}%${cap}.`;break;
    case 'scarcity':{
      const {kind,branchCode,available}=suggestion.scarcity!;
      const fact=kind==='low_stock'?`${available} on hand, less than ${SCARCITY_STOCK_MULTIPLE} times the ${qty} requested`:`the only branch that can fill ${qty}`;
      why=`Scarce at ${branchCode}: ${fact}, so customer price ${customer} + ${SCARCITY_UPLIFT_PERCENT}%${cap}.`;break;
    }
    case 'customer':
      why=suggestion.capped?`Customer price ${customer} is above list, so Querent caps it at list ${formatMoney(sources.list_price)}.`
        :last_paid?`Customer price. Last paid ${formatMoney(last_paid.unit_price)} on ${lastPaidDate(last_paid.order_date,input.on)} was not higher.`
        :'Customer price. No active contract and no purchases in the last 12 months.';
      break;
    case 'no_customer_price':
      why=`No customer price on file, so Querent starts from list price ${formatMoney(sources.list_price)}.`;break;
    case 'no_price':
      return 'No contract, customer or list price on file. Price this line by hand.';
  }
  return suggestion.gpVsCustomer===null?why:`${why} ${formatGp(suggestion.gpVsCustomer)}`;
}

/**
 * The "?" tip next to Querent's price on a quote line: why it picked that price, one fact per
 * entry. First the fact that decided it (explainPrice without the GP figure), then every other
 * fact Querent checked and what it came to, then the GP it adds over customer price.
 */
export function priceReasons(input:PricingInput,suggestion:PriceSuggestion=suggestPrice(input)):string[]{
  if(suggestion.reason==='no_price')return [explainPrice(input,suggestion)];
  const {sources,qty}=input;
  const {contract,last_paid}=sources;
  const decided=explainPrice(input,{...suggestion,gpVsCustomer:null});
  const gp=suggestion.gpVsCustomer===null?[]:[`${formatGp(suggestion.gpVsCustomer).replace(/\.$/,'')} at a qty of ${qty}.`];
  if(suggestion.reason==='contract')return [decided,"Last paid, a broken case and scarcity don't change a contract price.",...gp];

  const customer=suggestion.customerPrice;
  const reasons=[decided];
  if(!contract)reasons.push('No active contract for this item.');
  if(suggestion.reason==='no_customer_price'){
    if(last_paid)reasons.push(`Last paid ${formatMoney(last_paid.unit_price)} on ${lastPaidDate(last_paid.order_date,input.on)} isn't used without a customer price.`);
    return [...reasons,...gp];
  }
  if(suggestion.reason!=='last_paid'&&suggestion.reason!=='customer')reasons.push(last_paid
    ?`Last paid ${formatMoney(last_paid.unit_price)} on ${lastPaidDate(last_paid.order_date,input.on)}${customer!==null&&last_paid.unit_price>customer?", below Querent's pick":', not above customer price'}.`
    :'No purchases of this item in the last 12 months.');
  if(suggestion.reason!=='broken_case')reasons.push(suggestion.brokenCase&&customer!==null
    ?`Broken case: ${qty} is under a full case of ${sources.case_qty} (customer price + ${BROKEN_CASE_UPLIFT_PERCENT}% would be ${formatMoney(Math.round(Math.round(customer*100)*(100+BROKEN_CASE_UPLIFT_PERCENT)/100)/100)}).`
    :sources.case_qty<=1?'Sold by the pack, so no broken-case uplift.':`Not a broken case: ${qty} covers a full case of ${sources.case_qty}.`);
  if(suggestion.reason!=='scarcity'){
    const scarce=input.scarcityEnabled?suggestion.scarcity:scarcityAt(input.stock,input.branchId,qty);
    reasons.push(!input.scarcityEnabled
      ?`Scarcity uplift is off in Settings${scarce?`, so low stock at ${scarce.branchCode} doesn't raise the price`:''}.`
      :scarce?`Scarce at ${scarce.branchCode}, but customer price + ${SCARCITY_UPLIFT_PERCENT}% was lower.`:`Enough stock to fill ${qty}: no scarcity uplift.`);
  }
  if(!suggestion.capped&&sources.list_price>0)reasons.push(`List price ${formatMoney(sources.list_price)} is the ceiling.`);
  return [...reasons,...gp];
}

/** "Querent found +$Y GP", shown next to "Suggested by Querent" (spec §5.1 rule 4). */
export function explainQuoteGp(lines:readonly SuggestedLine[]){return `Querent found +${formatMoney(querentFoundGp(lines))} GP`;}
