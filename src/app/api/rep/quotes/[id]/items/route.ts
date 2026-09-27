import {repJson,repRoute} from '@/server/rep/http';
import {searchRepQuoteItems} from '@/server/rep/quote-edits';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/quotes/<id or number>/items?q=<SKU or words>: Add item's search (task 3.3), up to 8
 * catalog items with the price adding one would start at and stock at the quote's branch.
 */
export const GET=repRoute<{params:Promise<{id:string}>}>(async(repId,request,{params})=>{
  const {id}=await params;
  const items=searchRepQuoteItems(repId,id,request.nextUrl.searchParams.get('q')??'');
  return items?repJson({items}):repJson({detail:`No quote ${id}.`},404);
});
