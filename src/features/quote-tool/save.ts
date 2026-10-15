import 'server-only';
import type {NextRequest} from 'next/server';
import {z} from 'zod';
import type {ApiSession} from '@/features/auth/server';
import {packLabel} from '@/server/matching';
import {createQuote,getCatalogItems,logActivity} from '@/server/repository';
import {MATCH_STRICTNESS_LEVELS,type CatalogItem,type NearMiss,type QuoteLineInput} from '@/server/repository/types';
import {QUOTE_LIMITS,quantitySchema,quoteTextSchema,unitPriceSchema} from '@/features/quotes/limits';

// POST /api/quotes (create; the review dialog's Save quote). The body is validated with zod; matched
// lines name a SKU that must exist in the catalog, which is read again here: the item's description,
// pack and list price always come from the catalog, never from the client. Unmatched lines keep the
// customer's text, the quantity (if any) and a snapshot of the near-misses the rep saw. The quote and its
// lines are saved atomically (createQuote); one quote_create activity row records the counts.
// Answers 201 {id}, 400 {error} for invalid input, 401 without a session.

const MAX_BODY_BYTES=1024*1024;
const NO_STORE={'cache-control':'no-store'};
const fail=(status:number,error:string)=>Response.json({error},{status,headers:NO_STORE});

const originalText=z.string().trim().min(1,'Each line needs its original text.').max(2000,'A line\'s original text can be up to 2000 characters.');
// Quantities, prices and text lengths use the quotes module's shared limits (src/features/quotes/limits.ts).
const quantity=quantitySchema;
const unit=z.string().trim().max(40).nullish();
const sku=z.string().trim().min(1,'Each matched line needs an item.').max(64);

const matchedLine=z.object({
  unmatched:z.literal(false),
  sku,
  matchedBy:z.enum(['auto','rep']),
  originalText,
  quantity,
  unit,
  quantityUnclear:z.boolean().optional(),
  unitPrice:unitPriceSchema,
  matchScore:z.number().finite().min(0).max(1).nullish(),
});

const unmatchedLine=z.object({
  unmatched:z.literal(true),
  originalText,
  quantity:quantity.nullable(),
  unit,
  quantityUnclear:z.boolean().optional(),
  nearMisses:z.array(z.object({sku,score:z.number().finite().min(0).max(1).nullable()})).max(10).optional(),
});

export const saveQuoteSchema=z.object({
  customerName:z.string().trim().pipe(quoteTextSchema).optional(),
  reference:z.string().trim().pipe(quoteTextSchema).optional(),
  matchStrictness:z.enum(MATCH_STRICTNESS_LEVELS).optional(),
  lines:z.array(z.discriminatedUnion('unmatched',[matchedLine,unmatchedLine]))
    .min(1,'A quote needs at least one line.').max(QUOTE_LIMITS.linesMax,`A quote can have up to ${QUOTE_LIMITS.linesMax} lines.`),
});

type SaveBody=z.infer<typeof saveQuoteSchema>;

/** The first problem in words, with its line number when it is about a line. */
function firstIssue(error:z.ZodError):string{
  const issue=error.issues[0];
  const line=issue.path[0]==='lines'&&typeof issue.path[1]==='number'?`Line ${issue.path[1]+1}: `:'';
  const message=issue.code==='invalid_type'||issue.code==='invalid_union'||issue.code==='invalid_value'?'a field is missing or has the wrong type.':issue.message;
  return `${line}${message}`;
}

const nearMissOf=(item:CatalogItem,score:number|null):NearMiss=>({sku:item.sku,description:item.description,pack:packLabel(item),listPrice:item.listPrice,score});

/** The lines as the repository saves them, or the 400 message for a SKU that is not in the catalog. */
function toLines(lines:SaveBody['lines'],catalog:Map<string,CatalogItem>):QuoteLineInput[]|string{
  const out:QuoteLineInput[]=[];
  for(const [i,line] of lines.entries()){
    if(!line.unmatched){
      const item=catalog.get(line.sku);
      if(!item)return `Line ${i+1}: item ${line.sku} is not in the catalog.`;
      out.push({
        originalText:line.originalText,unmatched:false,sku:item.sku,matchedBy:line.matchedBy,
        description:item.description,pack:packLabel(item),listPrice:item.listPrice,
        quantity:line.quantity,unit:line.unit??null,quantityUnclear:line.quantityUnclear??false,unitPrice:line.unitPrice,
        matchScore:line.matchScore??null,nearMisses:[],
      });
    }else{
      out.push({
        originalText:line.originalText,unmatched:true,sku:null,matchedBy:null,description:null,pack:null,listPrice:null,
        quantity:line.quantity,unit:line.unit??null,quantityUnclear:line.quantityUnclear??line.quantity===null,unitPrice:null,matchScore:null,
        nearMisses:(line.nearMisses??[]).flatMap(n=>{const item=catalog.get(n.sku);return item?[nearMissOf(item,n.score)]:[];}),
      });
    }
  }
  return out;
}

export async function handleCreateQuote(request:NextRequest,{db}:ApiSession):Promise<Response>{
  const length=Number(request.headers.get('content-length')??'');
  if(Number.isFinite(length)&&length>MAX_BODY_BYTES)return fail(413,'This quote is too large to save.');
  let raw:unknown;
  try{raw=await request.json();}catch{return fail(400,'Send the quote as JSON.');}
  const parsed=saveQuoteSchema.safeParse(raw);
  if(!parsed.success)return fail(400,firstIssue(parsed.error));
  const body=parsed.data;

  const skus=body.lines.flatMap(l=>l.unmatched?(l.nearMisses??[]).map(n=>n.sku):[l.sku]);
  let catalog:Map<string,CatalogItem>;
  try{catalog=new Map((await getCatalogItems(db,skus)).map(item=>[item.sku,item]));}catch{
    return fail(500,'The catalog could not be read. Try again.');
  }
  const lines=toLines(body.lines,catalog);
  if(typeof lines==='string')return fail(400,lines);

  const result=await createQuote(db,{customerName:body.customerName??'',reference:body.reference??'',matchStrictness:body.matchStrictness,lines});
  if(!result.ok){
    if(result.error==='invalid')return fail(400,'The quote could not be saved: check the quantities and prices.');
    if(result.error==='unauthorized')return fail(403,'Not allowed.');
    return fail(500,'The quote could not be saved. Try again.');
  }
  const matched=lines.filter(l=>!l.unmatched);
  await logActivity(db,'quote_create',{
    lines:lines.length,matched:matched.length,unmatched:lines.length-matched.length,
    autoMatched:matched.filter(l=>l.matchedBy==='auto').length,repMatched:matched.filter(l=>l.matchedBy==='rep').length,
    level:body.matchStrictness??null,
  });
  return Response.json({id:result.id},{status:201,headers:NO_STORE});
}
