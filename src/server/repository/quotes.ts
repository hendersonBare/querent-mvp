import 'server-only';
import {isUuid,writeFailure} from './errors';
import {
  RepositoryError,isMatchStrictness,type Database,type Db,type Json,type MatchedBy,type NearMiss,type Quote,type QuoteInput,
  type QuoteLine,type QuoteLineInput,type QuoteSummary,type QuoteUpdate,type WriteResult,
} from './types';

// Quotes and their lines. Reads come from the quote_summaries view (line count, unmatched count,
// total) and quote_lines; writes go through the create_quote / update_quote functions, which save a
// quote and all its lines in one transaction and validate them (see supabase/migrations/*_quote_rpcs.sql).
// The example quote is read-only: writes to it come back as {ok:false, error:'example'}.

type SummaryRow=Database['public']['Views']['quote_summaries']['Row'];
type LineRow=Database['public']['Tables']['quote_lines']['Row'];
const PAGE=1000;

function toSummary(row:SummaryRow):QuoteSummary{
  return {
    id:row.id!,customerName:row.customer_name??'',reference:row.reference??'',isExample:row.is_example??false,
    matchStrictness:isMatchStrictness(row.match_strictness)?row.match_strictness:'strict',
    createdBy:row.created_by,createdByEmail:row.created_by_email,createdAt:row.created_at!,updatedAt:row.updated_at!,
    lineCount:row.line_count??0,unmatchedCount:row.unmatched_count??0,total:Number(row.total??0),
  };
}

function toNearMisses(value:Json):NearMiss[]{
  if(!Array.isArray(value))return [];
  return value.flatMap(entry=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry))return [];
    const e=entry as Record<string,Json|undefined>;
    if(typeof e.sku!=='string'||typeof e.description!=='string')return [];
    return [{sku:e.sku,description:e.description,pack:typeof e.pack==='string'?e.pack:null,
      listPrice:typeof e.listPrice==='number'?e.listPrice:null,score:typeof e.score==='number'?e.score:null}];
  });
}

function toLine(row:LineRow):QuoteLine{
  return {
    id:row.id,position:row.position,originalText:row.original_text,unmatched:row.unmatched,sku:row.sku,
    matchedBy:row.matched_by==='auto'||row.matched_by==='rep'?row.matched_by as MatchedBy:null,
    description:row.description,pack:row.pack,listPrice:row.list_price,quantity:row.quantity,unit:row.unit,
    quantityUnclear:row.quantity_unclear,unitPrice:row.unit_price,matchScore:row.match_score,
    nearMisses:toNearMisses(row.near_misses),createdAt:row.created_at,updatedAt:row.updated_at,
  };
}

/** The payload line for create_quote / update_quote (snake_case; unknown keys are refused there). */
function toPayloadLine(line:QuoteLineInput){
  return {
    original_text:line.originalText,unmatched:line.unmatched,sku:line.sku,matched_by:line.matchedBy,
    description:line.description,pack:line.pack,list_price:line.listPrice,quantity:line.quantity,unit:line.unit,
    quantity_unclear:line.quantityUnclear,unit_price:line.unitPrice,match_score:line.matchScore,
    near_misses:line.nearMisses.map(n=>({sku:n.sku,description:n.description,pack:n.pack,listPrice:n.listPrice,score:n.score})),
  };
}

/** Every quote the caller can read, newest first, with its line count, unmatched count and total. */
export async function listQuotes(db:Db):Promise<QuoteSummary[]>{
  const rows:QuoteSummary[]=[];
  let total:number|null=null;
  for(;;){
    const {data,error,count}=await db.from('quote_summaries').select('*',{count:total===null?'exact':undefined})
      .order('created_at',{ascending:false}).order('id',{ascending:true}).range(rows.length,rows.length+PAGE-1);
    if(error)throw new RepositoryError('listQuotes',error.code,error.message);
    if(total===null)total=count??null;
    rows.push(...data.map(toSummary));
    // PostgREST caps each response (max_rows); page until the count is reached or a page comes back empty.
    if(data.length===0||(total!==null&&rows.length>=total))return rows;
  }
}

/** One quote with its lines (ordered by position), or null when there is no such quote. */
export async function getQuote(db:Db,id:string):Promise<Quote|null>{
  if(!isUuid(id))return null;
  const [summary,lines]=await Promise.all([
    db.from('quote_summaries').select('*').eq('id',id).maybeSingle(),
    db.from('quote_lines').select('*').eq('quote_id',id).order('position',{ascending:true}),
  ]);
  if(summary.error)throw new RepositoryError('getQuote',summary.error.code,summary.error.message);
  if(lines.error)throw new RepositoryError('getQuote',lines.error.code,lines.error.message);
  if(!summary.data)return null;
  return {...toSummary(summary.data),lines:lines.data.map(toLine)};
}

/** Saves a new quote and its lines atomically. */
export async function createQuote(db:Db,input:QuoteInput):Promise<WriteResult<{id:string}>>{
  const payload={
    customer_name:input.customerName,reference:input.reference,
    ...(input.matchStrictness?{match_strictness:input.matchStrictness}:{}),
    lines:input.lines.map(toPayloadLine),
  };
  const {data,error}=await db.rpc('create_quote',{payload});
  if(error)return writeFailure(error);
  return {ok:true,id:data};
}

/** Changes the header fields given; `lines`, when given, replaces every line. Atomic. */
export async function updateQuote(db:Db,id:string,update:QuoteUpdate):Promise<WriteResult<{id:string}>>{
  if(!isUuid(id))return {ok:false,error:'not_found',message:'Quote not found.'};
  const payload={
    ...(update.customerName!==undefined?{customer_name:update.customerName}:{}),
    ...(update.reference!==undefined?{reference:update.reference}:{}),
    ...(update.lines!==undefined?{lines:update.lines.map(toPayloadLine)}:{}),
  };
  const {error}=await db.rpc('update_quote',{quote_id:id,payload});
  if(error)return writeFailure(error);
  return {ok:true,id};
}

/** Deletes a quote and its lines. The example quote is refused with error 'example'. */
export async function deleteQuote(db:Db,id:string):Promise<WriteResult>{
  if(!isUuid(id))return {ok:false,error:'not_found',message:'Quote not found.'};
  const {data,error}=await db.from('quotes').delete().eq('id',id).select('id');
  if(error)return writeFailure(error);
  if(data.length>0)return {ok:true};
  // Nothing deleted: RLS hides the example quote from deletes, or there is no such quote.
  const found=await db.from('quotes').select('is_example').eq('id',id).maybeSingle();
  if(found.error)return writeFailure(found.error);
  if(found.data?.is_example)return writeFailure({code:'42501',message:'',hint:'example_quote'});
  return {ok:false,error:'not_found',message:'Quote not found.'};
}
