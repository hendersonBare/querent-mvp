// Price facts per customer x item (spec §5.1). The rules that pick a price live in the pricing engine (task 1.1).

export interface ContractPrice {contract_id:string;contract_number:string;contract_name:string;unit_price:number;starts_on:string;ends_on:string}

/** The most recent price the customer paid for an item, from order history. */
export interface LastPaid {unit_price:number;qty:number;order_date:string;order_number:string}

/**
 * Prices a customer may see (the get_price tool): list, their price level, and an active contract.
 * customer_price is null when the customer has no price level (placeholder customers).
 */
export interface CustomerPrice {item_id:string;sku:string;list_price:number;customer_price:number|null;contract:ContractPrice|null}

/** Internal: every fact the pricing engine needs for one line. Never send this to a customer. */
export interface PriceSources extends CustomerPrice {cost:number;case_qty:number;category_id:string;last_paid:LastPaid|null}

/** A contract is active on day D when starts_on <= D <= ends_on. */
export interface Contract {id:string;customer_id:string;contract_number:string;name:string;starts_on:string;ends_on:string;active:boolean;lines:{item_id:string;sku:string;description:string;unit_price:number}[]}
