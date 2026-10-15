import 'server-only';
import {RepositoryError,type CatalogItem,type Database,type Db} from './types';

// The BOXT catalog, read with the request's client (RLS: signed-in users read it; nobody writes it
// through the API). PostgREST returns at most `max_rows` (1,000 on Supabase) rows per request, so
// loadCatalog pages until it has every row.

type CatalogRow=Pick<Database['public']['Tables']['catalog_items']['Row'],'sku'|'description'|'category'|'pack'|'case_qty'|'list_price'|'keywords'>;
const COLUMNS='sku,description,category,pack,case_qty,list_price,keywords';
const PAGE=1000;
/** SKUs per `in (...)` request, which keeps the URL short. */
const SKU_CHUNK=200;

const toCatalogItem=(row:CatalogRow):CatalogItem=>({
  sku:row.sku,description:row.description,category:row.category,pack:row.pack,caseQty:row.case_qty,listPrice:row.list_price,keywords:row.keywords,
});

/** Every catalog row, in a stable order (by id). */
export async function loadCatalog(db:Db):Promise<CatalogItem[]>{
  const items:CatalogItem[]=[];
  let total:number|null=null;
  for(;;){
    const {data,error,count}=await db.from('catalog_items').select(COLUMNS,{count:total===null?'exact':undefined})
      .order('id',{ascending:true}).range(items.length,items.length+PAGE-1);
    if(error)throw new RepositoryError('loadCatalog',error.code,error.message);
    if(total===null)total=count??null;
    items.push(...(data as CatalogRow[]).map(toCatalogItem));
    // Stop on an empty page, or once the count is reached (a server cap below PAGE still pages through).
    if(data.length===0||(total!==null&&items.length>=total))return items;
  }
}

/** The catalog rows for `skus` that exist, in the order asked (duplicates once). */
export async function getCatalogItems(db:Db,skus:readonly string[]):Promise<CatalogItem[]>{
  const wanted=[...new Set(skus)];
  const found=new Map<string,CatalogItem>();
  for(let i=0;i<wanted.length;i+=SKU_CHUNK){
    const {data,error}=await db.from('catalog_items').select(COLUMNS).in('sku',wanted.slice(i,i+SKU_CHUNK));
    if(error)throw new RepositoryError('getCatalogItems',error.code,error.message);
    for(const row of data as CatalogRow[])found.set(row.sku,toCatalogItem(row));
  }
  return wanted.flatMap(sku=>found.has(sku)?[found.get(sku)!]:[]);
}
