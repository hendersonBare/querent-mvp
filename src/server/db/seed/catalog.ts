import BOXT_CATALOG from './boxt-catalog.json';

// BOXT Packaging's catalog: every SKU on boxtpackaging.com with the site's wording, pack and price
// (list), snapshotted by scripts/fetch-boxt-catalog.ts. Cost, the pallet-tier customer price and
// stock aren't public, so they are demo values derived from the SKU (the same every reseed), and
// STORY pins them on the items the history and sample quote Q-24817 are built around.
// Prices and qty are per pack. `customer` is the 3PL's price-level price.

export const CATEGORIES=[
  {id:'boxes',name:'Boxes'},
  {id:'mailers',name:'Mailers'},
  {id:'tape',name:'Tape & Strapping'},
  {id:'bags',name:'Bags'},
  {id:'stretch-wrap',name:'Stretch Wrap'},
  {id:'cushioning',name:'Bubble, Foam & Cushioning'},
  {id:'paper',name:'Paper & Kraft'},
  {id:'labels',name:'Labels'},
  {id:'storage',name:'Storage & Fulfillment'},
] as const;
export type CategoryId=typeof CATEGORIES[number]['id'];

export interface CatalogItem{sku:string;description:string;category:CategoryId;pack:string;caseQty:number;cost:number;list:number;customer:number;
  /** Available at each branch, in BRANCHES order. */
  stock:number[];keywords:string}

interface SnapshotRow{sku:string;description:string;category:string;pack:string;caseQty:number;list:number;keywords:string}

/** [cost, customer price, stock at Spanish Fork] for the items the demo's story is built on. */
const STORY:Record<string,[cost:number,customer:number,stock:number]>={
  'T902170':[34.60,46.95,86],    // 2 in acrylic tape: last paid $48.75 lifts the Q-24817 price
  'SF188CAST':[52.40,74.50,64],  // cast hand wrap: contract $69.95
  'THL576':[132.00,164.50,38],   // 4x6 fanfold labels: last paid $172.00, under Landon's 25% floor
  'B833':[16.85,23.40,7],        // #2 poly bubble mailers: 7 on hand for 12 asked, PO due in 3 days
  'B855SS':[21.40,29.95,22],     // #2 kraft bubble mailers: the other "#2 bubble mailer"
  '1296-BDL':[0.69,0.86,4200],   // 12x9x6 boxes: the 3PL's everyday RSC, bought with the tape
};

const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
/** FNV-1a of the SKU and a salt, as a fraction in [0, 1): stable demo values per item. */
function unit(sku:string,salt:string){
  let h=0x811c9dc5;
  for(const ch of `${salt}:${sku}`){h^=ch.charCodeAt(0);h=Math.imul(h,0x01000193)>>>0;}
  return h/2**32;
}

function costed(row:SnapshotRow):CatalogItem{
  const story=STORY[row.sku];
  const cost=story?.[0]??round2(row.list*(0.62+0.12*unit(row.sku,'cost')));
  const customer=story?.[1]??round2(row.list*(0.88+0.06*unit(row.sku,'customer')));
  // Boxes sell by the box (hundreds on hand); everything else by the case, roll or coil.
  const each=row.pack==='Each'&&row.caseQty>1;
  const out=unit(row.sku,'out')<0.03;
  const stock=story?.[2]??(out?0:each?Math.round((150+2850*unit(row.sku,'stock'))/25)*25:4+Math.floor(76*unit(row.sku,'stock')));
  return {sku:row.sku,description:row.description,category:row.category as CategoryId,pack:row.pack,caseQty:row.caseQty,cost,list:row.list,customer:Math.max(customer,round2(cost+0.01)),stock:[stock],keywords:row.keywords};
}

export const CATALOG:CatalogItem[]=(BOXT_CATALOG as SnapshotRow[]).map(costed);

/** Inbound purchase orders, as [sku, branch id, qty, days after the anchor]. */
export const INBOUND:[string,string,number,number][]=[['B833','spanish-fork',24,3],['THL576','spanish-fork',20,5]];

const BY_SKU=new Map(CATALOG.map(i=>[i.sku,i]));
export function catalogItem(sku:string){const item=BY_SKU.get(sku);if(!item)throw new Error(`Unknown seed SKU ${sku}`);return item;}
