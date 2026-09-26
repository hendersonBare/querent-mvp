// Catalog, branches and stock (spec §2). Customer-safe types carry no cost; CostedItem is internal.

/** A Herrick branch: the pickup location and the freight origin (spec §5.3). */
export interface Branch {id:string;code:string;name:string;address:string;city:string;state:string;zip:string;lat:number;lng:number;will_call_phone:string;will_call_hours:string}

export interface ProductCategory {id:string;name:string;sort_order:number}

/**
 * A catalog item as a customer may see it. Prices and qty are per `pack` ("Box of 50").
 * `case_qty` is packs per full case; a quoted qty below it is a broken case (spec §5.1).
 */
export interface CatalogItem {id:string;sku:string;description:string;category_id:string;category_name:string;pack:string;case_qty:number;list_price:number;keywords:string}

/** Internal only (rep portal, pricing engine): the item with its unit cost. */
export interface CostedItem extends CatalogItem {cost:number}

export interface BranchStock {branch_id:string;branch_code:string;available:number;on_order:number;next_receipt_on:string|null}

/** Stock for one item across every branch, in branch order (SLC, Ogden, Provo). */
export interface ItemStock {item_id:string;sku:string;total_available:number;branches:BranchStock[]}
