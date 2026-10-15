import 'server-only';
import type {NextRequest} from 'next/server';
import type {ApiSession} from '@/features/auth/server';
import {getCatalog} from '@/server/catalog';
import {packLabel,scorePackaging} from '@/server/matching';
import type {ScoredItem} from './types';

// GET /api/catalog/search?q= (the review dialog's Swap search): the 10 catalog items the scorer rates
// highest for the query, best first: {items:[{sku, description, pack (label), category, listPrice, score}]}.
// The query is matched like a customer's line and is not logged.

export const MIN_QUERY=2;
export const MAX_QUERY=200;
export const SEARCH_LIMIT=10;

const NO_STORE={'cache-control':'no-store'};

export async function handleCatalogSearch(request:NextRequest,{db}:ApiSession):Promise<Response>{
  const q=(request.nextUrl.searchParams.get('q')??'').trim();
  if(q.length<MIN_QUERY||q.length>MAX_QUERY)return Response.json({error:`Type ${MIN_QUERY} to ${MAX_QUERY} characters to search.`},{status:400,headers:NO_STORE});
  let catalog;
  try{catalog=await getCatalog(db);}catch{
    return Response.json({error:'The catalog could not be loaded. Try again.'},{status:500,headers:NO_STORE});
  }
  const items:ScoredItem[]=scorePackaging(q,catalog).filter(c=>c.score>0).slice(0,SEARCH_LIMIT).map(({item,score})=>({
    sku:item.sku,description:item.description,pack:packLabel(item),category:item.category,listPrice:item.listPrice,score,
  }));
  return Response.json({items},{headers:NO_STORE});
}
