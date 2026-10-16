// The seam for supplier SKUs (docs/boxt/plan.md "Matching contract": typed-SKU matching is off).
//
// A customer's list often carries the other supplier's item number (Uline "S-4128"). The parser keeps it
// (ParsedRow.suppliersSku) and the pipeline asks this map about it, but today matching is description
// only: nullSkuMap knows no SKU, so every line is matched by its description through the scorer and the
// judge, as the product rules require.
//
// A future Uline → BOXT cross-reference table plugs in here (an implementation whose lookup reads that
// table). What a mapped SKU should then do to a line's outcome is out of scope today and needs its own
// product decision: a mapping must not bypass "Matched only if the scorer clears AND the judge agrees",
// so the pipeline does not use a looked-up SKU for the outcome.

export interface SupplierSkuMap {
  /** The BOXT SKU for another supplier's SKU, or null when there is no mapping. */
  lookup(suppliersSku:string):Promise<string|null>;
}

/** Today's map: no supplier SKU maps to a BOXT SKU. */
export const nullSkuMap:SupplierSkuMap={lookup:async()=>null};
