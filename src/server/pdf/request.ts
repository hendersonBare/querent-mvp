// Query parameters of GET /api/quotes/:id/pdf (task 4.1). Pure.

/** A sent revision number, 'draft' (the rep's preview of the unsent draft), or null for the latest sent revision. */
export type PdfRevision=number|'draft'|null;

/** The PDF variants built so far. The internal worksheet (task 4.2) must stay rep-only when it is added. */
export const PDF_VARIANTS=['customer'] as const;
export type PdfVariant=typeof PDF_VARIANTS[number];

export type PdfQuery={ok:true;variant:PdfVariant;rev:PdfRevision}|{ok:false;detail:string};

/** `variant` defaults to the customer quote; `rev` to the latest sent revision. */
export function parsePdfQuery(params:URLSearchParams):PdfQuery{
  const variant=params.get('variant')||PDF_VARIANTS[0];
  if(!(PDF_VARIANTS as readonly string[]).includes(variant))return {ok:false,detail:`Unknown PDF variant "${variant}". Use variant=${PDF_VARIANTS.join(' or ')}.`};
  const rev=params.get('rev');
  if(rev===null||rev==='')return {ok:true,variant:variant as PdfVariant,rev:null};
  if(rev==='draft')return {ok:true,variant:variant as PdfVariant,rev:'draft'};
  if(!/^[1-9]\d{0,5}$/.test(rev))return {ok:false,detail:'rev must be a sent revision number (1, 2, …) or draft.'};
  return {ok:true,variant:variant as PdfVariant,rev:Number(rev)};
}
