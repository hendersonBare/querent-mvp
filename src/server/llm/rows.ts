import {z} from 'zod';
import type {ParsedRow,ParseResult} from './types';

// Shared by the live and scripted parsers: the caps, the user-facing messages, and the validation of
// rows (from Claude's tool input or a PDF fixture) into clean ParsedRows.

export const MAX_ROWS=200;
export const MAX_PDF_BYTES=4*1024*1024;

export const PARSE_ERROR='Could not read that list. Try pasting it as text.';
export const SERVICE_ERROR='The list reader is not available right now. Try again in a minute, or paste the list as text.';
export const TOO_MANY_ROWS_ERROR=`This list has more than ${MAX_ROWS} lines. Split it into smaller lists of up to ${MAX_ROWS} lines each.`;
export const PDF_TOO_LARGE_ERROR='That PDF is larger than 4 MB. Upload a smaller file, or paste the list as text.';

const rowSchema=z.object({
  rawText:z.string(),
  description:z.string(),
  quantity:z.number().nullish(),
  unit:z.string().nullish(),
  suppliersSku:z.string().nullish(),
  quantityUnclear:z.boolean().optional(),
});
export const rowsSchema=z.object({rows:z.array(rowSchema)});

const blankToNull=(value:string|null|undefined)=>value?.trim()||null;

/** One validated row, tidied: trimmed strings, null for blanks, and an unclear quantity unless it is a positive number. */
function tidy(row:z.infer<typeof rowSchema>):ParsedRow|null{
  const rawText=row.rawText.trim(),description=row.description.trim();
  if(!rawText&&!description)return null;
  const quantity=typeof row.quantity==='number'&&Number.isFinite(row.quantity)&&row.quantity>0?row.quantity:null;
  return {
    rawText:rawText||description,
    description:description||rawText,
    quantity,
    unit:blankToNull(row.unit)?.toLowerCase()??null,
    suppliersSku:blankToNull(row.suppliersSku),
    quantityUnclear:quantity===null||row.quantityUnclear===true,
  };
}

/** Validates `{rows:[…]}` into a ParseResult: malformed → PARSE_ERROR, more than MAX_ROWS → TOO_MANY_ROWS_ERROR. */
export function rowsResult(input:unknown):ParseResult{
  const parsed=rowsSchema.safeParse(input);
  if(!parsed.success)return {ok:false,error:PARSE_ERROR};
  const rows=parsed.data.rows.map(tidy).filter((row):row is ParsedRow=>row!==null);
  if(rows.length>MAX_ROWS)return {ok:false,error:TOO_MANY_ROWS_ERROR};
  return {ok:true,rows};
}
