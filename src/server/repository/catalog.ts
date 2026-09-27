import 'server-only';
import type {Branch,BranchStock,CatalogItem,CostedItem,ItemStock,ProductCategory} from '@/domain';
import {all,inOrder,list,one} from './sql';

const BRANCH='SELECT id,code,name,address,city,state,zip,lat,lng,will_call_phone,will_call_hours FROM branches';
const ITEM_COLUMNS='i.id,i.sku,i.description,i.category_id,c.name category_name,i.pack,i.case_qty,i.list_price,i.keywords';
const ITEM=`SELECT ${ITEM_COLUMNS} FROM items i JOIN product_categories c ON c.id=i.category_id`;
const COSTED_ITEM=`SELECT ${ITEM_COLUMNS},i.cost FROM items i JOIN product_categories c ON c.id=i.category_id`;
const BY_ID_OR_SKU=' WHERE i.id=? OR upper(i.sku)=upper(?)';
const ITEM_ORDER=' ORDER BY c.sort_order,i.sku';

/** Branches in seed order (SLC, Ogden, Provo). */
export function branches(){return all<Branch>(`${BRANCH} ORDER BY rowid`);}
export function branch(id:string){return one<Branch>(`${BRANCH} WHERE id=?`,id);}
export function productCategories(){return all<ProductCategory>('SELECT id,name,sort_order FROM product_categories ORDER BY sort_order');}

/** The whole catalog without cost, e.g. for SKU matching (task 1.4). */
export function catalogItems(){return all<CatalogItem>(ITEM+ITEM_ORDER);}
/** One item by id or SKU (SKU match ignores case). */
export function catalogItem(idOrSku:string){return one<CatalogItem>(ITEM+BY_ID_OR_SKU,idOrSku,idOrSku);}

/** Internal: the catalog with unit cost (rep Items view, pricing). */
export function costedItems(){return all<CostedItem>(COSTED_ITEM+ITEM_ORDER);}
export function costedItem(idOrSku:string){return one<CostedItem>(COSTED_ITEM+BY_ID_OR_SKU,idOrSku,idOrSku);}

/**
 * Items whose SKU, description, search keywords or category contain every word of `query`. Words
 * are lower-cased, a plural "s" is dropped, and LIKE wildcards are literal. The rep's Add item
 * search (task 3.3) uses it. Unranked, and internal: the search_items chat tool scores
 * catalogItems() with src/server/matching instead.
 */
export function searchItems(query:string,{limit=10}:{limit?:number}={}){
  const words=query.toLowerCase().split(/[\s,;]+/).map(w=>w.replace(/^[^\w/%]+|[^\w/%]+$/g,'')).filter(Boolean)
    .map(w=>w.length>3&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w);
  if(!words.length)return [];
  const text="lower(i.sku||' '||i.description||' '||i.keywords||' '||c.name)";
  const where=words.map(()=>`${text} LIKE ? ESCAPE '\\'`).join(' AND ');
  const patterns=words.map(w=>`%${w.replace(/[\\%_]/g,m=>`\\${m}`)}%`);
  const rows=Number.isFinite(limit)?Math.min(50,Math.max(1,Math.floor(limit))):10;
  return all<CatalogItem>(`${ITEM} WHERE ${where}${ITEM_ORDER} LIMIT ?`,...patterns,rows);
}

/** Stock at every branch for each item, in the order asked. Unknown items are skipped. */
export function stockForItems(itemIds:readonly string[]):ItemStock[]{
  if(!itemIds.length)return [];
  const rows=all<BranchStock&{item_id:string;sku:string}>(`SELECT s.item_id,i.sku,s.branch_id,b.code branch_code,s.available,s.on_order,s.next_receipt_on
    FROM branch_stock s JOIN items i ON i.id=s.item_id JOIN branches b ON b.id=s.branch_id
    WHERE s.item_id IN (SELECT value FROM json_each(?)) ORDER BY b.rowid`,list(itemIds));
  const byItem=new Map<string,ItemStock>();
  for(const {item_id,sku,...stock} of rows){
    const entry=byItem.get(item_id)??{item_id,sku,total_available:0,branches:[]};
    entry.branches.push(stock);entry.total_available+=stock.available;
    byItem.set(item_id,entry);
  }
  return inOrder(itemIds,[...byItem.values()],s=>s.item_id);
}
