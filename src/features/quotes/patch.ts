import {z} from 'zod';
import type {Quote,QuoteLineInput,QuoteUpdate} from '@/server/repository/types';
import {decimalPlaces} from './format';
import {QUOTE_COPY} from './copy';

// The body of PATCH /api/quotes/[id] (docs/boxt/plan.md B6), shared by the edit form and the route:
//
//   {customerName?, reference?, lines?:[{id, quantity?, unitPrice?}]}
//
// `lines`, when present, lists the lines to keep, by id and in order, with their new quantity and unit
// price; a line left out is removed. Nothing else about a line can be changed here: its item, SKU,
// matched_by, the customer's original text, the unmatched flag and the near-miss snapshot stay as
// stored. Unknown fields are refused rather than ignored, so a client never thinks it saved one.

/** The limits the database enforces (supabase/migrations/*_quote_rpcs.sql), checked here first. */
export const LIMITS={text:200,lines:200,quantityBelow:100_000_000_000,priceBelow:100_000_000,priceDecimals:4} as const;

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid=(value:string)=>UUID.test(value);

const quantity=z.number().finite().gt(0).lt(LIMITS.quantityBelow);
const unitPrice=z.number().finite().min(0).lt(LIMITS.priceBelow)
  .refine(n=>decimalPlaces(n)<=LIMITS.priceDecimals,{message:`at most ${LIMITS.priceDecimals} decimals`});

const linePatch=z.strictObject({
  id:z.string().regex(UUID),
  quantity:quantity.nullable().optional(),
  unitPrice:unitPrice.nullable().optional(),
});

export const quotePatchSchema=z.strictObject({
  customerName:z.string().max(LIMITS.text).optional(),
  reference:z.string().max(LIMITS.text).optional(),
  lines:z.array(linePatch).min(1).max(LIMITS.lines)
    .refine(lines=>new Set(lines.map(l=>l.id.toLowerCase())).size===lines.length,{message:'a line is listed twice'})
    .optional(),
});

export type QuotePatch=z.infer<typeof quotePatchSchema>;
export type LinePatch=z.infer<typeof linePatch>;

/** The body checked against the schema; the error names the field, never echoes the value. */
export function parsePatch(body:unknown):{ok:true;patch:QuotePatch}|{ok:false;error:string}{
  const result=quotePatchSchema.safeParse(body);
  if(result.success)return {ok:true,patch:result.data};
  const issue=result.error.issues[0];
  const where=issue?.path.length?issue.path.join('.'):'body';
  return {ok:false,error:`${QUOTE_COPY.invalidBody} (${where}: ${issue?.code==='unrecognized_keys'?'unknown field':issue?.message??'invalid'})`};
}

export type PatchResult={ok:true;update:QuoteUpdate;kept:number;removed:number}|{ok:false;error:string};

/** The repository update for `patch` on `quote`: the header fields given, and every kept line in full. */
export function applyPatch(quote:Quote,patch:QuotePatch):PatchResult{
  const update:QuoteUpdate={};
  if(patch.customerName!==undefined)update.customerName=patch.customerName.trim();
  if(patch.reference!==undefined)update.reference=patch.reference.trim();
  if(!patch.lines)return {ok:true,update,kept:quote.lines.length,removed:0};

  const stored=new Map(quote.lines.map(l=>[l.id.toLowerCase(),l]));
  const lines:QuoteLineInput[]=[];
  for(const change of patch.lines){
    const line=stored.get(change.id.toLowerCase());
    if(!line)return {ok:false,error:QUOTE_COPY.unknownLine};
    const {id:_id,position:_position,createdAt:_created,updatedAt:_updated,...kept}=line;
    const next:QuoteLineInput={
      ...kept,
      quantity:change.quantity!==undefined?change.quantity:line.quantity,
      unitPrice:change.unitPrice!==undefined?change.unitPrice:line.unitPrice,
    };
    if(line.unmatched&&change.unitPrice!==undefined&&change.unitPrice!==null)return {ok:false,error:QUOTE_COPY.unmatchedPrice};
    if(!line.unmatched&&(next.quantity===null||next.unitPrice===null))return {ok:false,error:QUOTE_COPY.matchedNeedsBoth};
    lines.push(next);
  }
  update.lines=lines;
  return {ok:true,update,kept:lines.length,removed:quote.lines.length-lines.length};
}
