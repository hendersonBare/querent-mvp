import type {ItemStock,PriceBasis,PriceSources} from '@/domain';

// The pricing engine (spec §5.1, task 1.1). Pure functions over the facts the repository returns
// (priceSources, stockForItems, pricingSettings, floorFor): no I/O and no server-only imports, so
// the quote screen can re-run them live when the rep changes qty or branch. Money is handled in
// integer cents, so every price and GP figure is exact to the cent.

/** Scarcity uplift on the customer price, in percent (spec §5.1). */
export const SCARCITY_UPLIFT_PERCENT=5;
/** Scarcity applies when the quote branch has less than this multiple of the qty on hand. */
export const SCARCITY_STOCK_MULTIPLE=1.5;

/** Everything the engine needs to price one line. */
export interface PricingInput{
  /** Every price fact for this customer x item (repository `priceSources`). `last_paid` must already be limited to the last 12 months. */
  sources:PriceSources;
  qty:number;
  /** The quote's branch, which fills the line. */
  branchId:string;
  /** Stock for this item at every branch (repository `stockForItems`), or null if unknown. */
  stock:ItemStock|null;
  /** Settings > Pricing: scarcity uplift. Off by default. */
  scarcityEnabled:boolean;
  /** The quote rep's margin floor for the item's category, as a fraction (0.2 = 20%), or null if none is set. */
  floor:number|null;
  /** The pricing day (YYYY-MM-DD). The explanation adds the year to a last-paid date from another year. */
  on:string;
}

/**
 * Why Querent picked its price. `customer` / `last_paid` / `broken_case` / `scarcity` follow rule 2;
 * `no_customer_price` starts from list; `no_price` means nothing is on file and the rep prices the line.
 */
export type PriceReason='contract'|'customer'|'last_paid'|'broken_case'|'scarcity'|'no_customer_price'|'no_price';

/** Scarce stock at the quote branch (spec §5.1): less than 1.5x the qty on hand, or the only branch that can fill it. */
export interface Scarcity{kind:'low_stock'|'only_branch';branchCode:string;available:number}

export interface PriceSuggestion{
  /** Querent's pick, shown in bold in the price-basis dropdown. A scarcity price is `custom`. null when nothing is on file. */
  basis:PriceBasis|null;
  price:number|null;
  reason:PriceReason;
  /** The winning price was above list and was capped at list. `uncapped` is the price before the cap. */
  capped:boolean;uncapped:number|null;
  customerPrice:number|null;
  /** "+$X GP vs customer price": (price - customer price) x qty. Negative on a contract below customer price; null without both prices. */
  gpVsCustomer:number|null;
  /** Rule 3: the suggestion's margin, the floor it was checked against, and whether it is below. Never changes the pick. */
  margin:number|null;floor:number|null;belowFloor:boolean;
  /** Facts that applied (they may not have won). */
  brokenCase:boolean;scarcity:Scarcity|null;
}

/** One entry of the price-basis dropdown (Contract / Customer / List / Last paid / Custom). */
export interface PriceOption{
  basis:PriceBasis;label:string;
  /** null when the basis has no value for this line (and for Custom unless Querent suggested a custom price). */
  price:number|null;available:boolean;
  /** Context for the option: the contract number, or the last-paid date. */
  note:string|null;
  /** Querent's suggestion (bold). */
  suggested:boolean;
}

export interface PricedLine{options:PriceOption[];suggestion:PriceSuggestion;explanation:string}

/** The quote-line fields `querentFoundGp` reads (a QuoteLine has them all). */
export interface SuggestedLine{qty:number;suggested_price:number|null;suggested_basis:PriceBasis|null;customer_price:number|null}

export const BASIS_LABELS:Record<PriceBasis,string>={contract:'Contract',customer:'Customer',list:'List',last_paid:'Last paid',custom:'Custom'};

const cents=(amount:number)=>Math.round(amount*100);
const dollars=(amountCents:number)=>amountCents/100;
/** A price the engine can use: a positive, finite number. Zero or missing means "not on file". */
const usable=(price:number|null|undefined):price is number=>typeof price==='number'&&Number.isFinite(price)&&price>0;

/** margin = (price - cost) / price (spec §5.2), or null when there is no positive price. Task 1.2 owns the canonical floor check. */
export function marginOf(price:number|null,cost:number):number|null{
  if(!usable(price))return null;
  return (cents(price)-cents(cost))/cents(price);
}

/** (price - customer price) x qty, to the cent; null unless both prices are on file. */
export function gpVsCustomer(price:number|null,customerPrice:number|null,qty:number):number|null{
  if(!usable(price)||!usable(customerPrice)||!Number.isFinite(qty))return null;
  return dollars(Math.round((cents(price)-cents(customerPrice))*qty));
}

/** Scarce stock at the quote branch, or null. Unknown stock or a non-positive qty is never scarce. */
export function scarcityAt(stock:ItemStock|null,branchId:string,qty:number):Scarcity|null{
  if(!stock||!(qty>0))return null;
  const here=stock.branches.find(b=>b.branch_id===branchId);
  const available=here?.available??0,branchCode=here?.branch_code??branchId;
  if(available<SCARCITY_STOCK_MULTIPLE*qty)return {kind:'low_stock',branchCode,available};
  if(stock.branches.every(b=>b.branch_id===branchId||b.available<qty))return {kind:'only_branch',branchCode,available};
  return null;
}

interface Candidate{basis:PriceBasis;cents:number;reason:PriceReason}

/**
 * Querent's suggested price for one line (spec §5.1):
 * 1. An active contract wins. It is binding: no uplift and no cap.
 * 2. Otherwise start at the customer price and raise it only on a fact: last paid higher (last 12
 *    months), a broken case (qty below the case qty: list), or scarcity (setting on: customer + 5%).
 *    The highest wins (ties: last paid, broken case, scarcity, customer), capped at list.
 * 3. The floor never changes the pick; `belowFloor` drives the red warning.
 * With no customer price the suggestion is list; with no list either, there is none.
 */
export function suggestPrice(input:PricingInput):PriceSuggestion{
  const {sources,qty}=input;
  const list=usable(sources.list_price)?cents(sources.list_price):null;
  const customer=usable(sources.customer_price)?cents(sources.customer_price):null;
  const brokenCase=qty>0&&qty<sources.case_qty;
  const scarcity=input.scarcityEnabled?scarcityAt(input.stock,input.branchId,qty):null;

  const finish=(pick:Candidate|null,uncapped:number|null=null):PriceSuggestion=>{
    const price=pick?dollars(pick.cents):null,margin=marginOf(price,sources.cost);
    const floor=usable(input.floor)?input.floor:null;
    return {basis:pick?.basis??null,price,reason:pick?.reason??'no_price',capped:uncapped!==null,uncapped:uncapped===null?null:dollars(uncapped),
      customerPrice:customer===null?null:dollars(customer),gpVsCustomer:gpVsCustomer(price,sources.customer_price,qty),
      margin,floor,belowFloor:floor!==null&&margin!==null&&margin<floor,brokenCase,scarcity};
  };

  if(sources.contract&&usable(sources.contract.unit_price))return finish({basis:'contract',cents:cents(sources.contract.unit_price),reason:'contract'});
  if(customer===null)return finish(list===null?null:{basis:'list',cents:list,reason:'no_customer_price'});

  const candidates:Candidate[]=[];
  const lastPaid=sources.last_paid&&usable(sources.last_paid.unit_price)?cents(sources.last_paid.unit_price):null;
  if(lastPaid!==null&&lastPaid>customer)candidates.push({basis:'last_paid',cents:lastPaid,reason:'last_paid'});
  if(brokenCase&&list!==null)candidates.push({basis:'list',cents:list,reason:'broken_case'});
  if(scarcity)candidates.push({basis:'custom',cents:Math.round(customer*(100+SCARCITY_UPLIFT_PERCENT)/100),reason:'scarcity'});
  candidates.push({basis:'customer',cents:customer,reason:'customer'});
  const best=candidates.reduce((a,b)=>b.cents>a.cents?b:a);
  if(list!==null&&best.cents>list)return finish({basis:'list',cents:list,reason:best.reason},best.cents);
  return finish(best);
}

/**
 * The price-basis dropdown for one line: Contract, Customer, List, Last paid and Custom, each with
 * its value and whether it is available. Custom carries Querent's price when it suggested one (scarcity).
 */
export function priceOptions(input:PricingInput,suggestion:PriceSuggestion=suggestPrice(input)):PriceOption[]{
  const {contract,customer_price,list_price,last_paid}=input.sources;
  const values:Record<PriceBasis,{price:number|null;note:string|null}>={
    contract:{price:contract&&usable(contract.unit_price)?contract.unit_price:null,note:contract?.contract_number??null},
    customer:{price:usable(customer_price)?customer_price:null,note:null},
    list:{price:usable(list_price)?list_price:null,note:null},
    last_paid:{price:last_paid&&usable(last_paid.unit_price)?last_paid.unit_price:null,note:last_paid?.order_date??null},
    custom:{price:suggestion.basis==='custom'?suggestion.price:null,note:null},
  };
  return (Object.keys(BASIS_LABELS) as PriceBasis[]).map(basis=>({basis,label:BASIS_LABELS[basis],price:values[basis].price,
    available:basis==='custom'||values[basis].price!==null,note:values[basis].note,suggested:suggestion.basis===basis}));
}

/**
 * "Querent found +$Y GP" for a quote: the GP Querent's suggestions add over customer price at the
 * current qty. Only uplift counts: contract lines (binding, not Querent's choice) and lines at or
 * below customer price add nothing.
 */
export function querentFoundGp(lines:readonly SuggestedLine[]):number{
  return dollars(lines.reduce((total,line)=>{
    if(line.suggested_basis==='contract')return total;
    const gp=gpVsCustomer(line.suggested_price,line.customer_price,line.qty);
    return gp!==null&&gp>0?total+cents(gp):total;
  },0));
}
