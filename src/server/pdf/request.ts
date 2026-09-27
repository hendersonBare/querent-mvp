// Query parameters of GET /api/quotes/:id/pdf (task 4.1). Pure.

/** A sent revision number, 'draft' (the rep's preview of the unsent draft), or null for the latest sent revision. */
export type PdfRevision=number|'draft'|null;

/**
 * The customer quote (task 4.1) and the rep's internal worksheet (task 4.2), which adds cost,
 * margin, floors and Querent's reasoning. The route serves `internal` to reps only.
 */
export const PDF_VARIANTS=['customer','internal'] as const;
export type PdfVariant=typeof PDF_VARIANTS[number];
/** The only variant a customer may get; every other one is rep-only. */
export const CUSTOMER_VARIANT:PdfVariant='customer';

export type PdfQuery={ok:true;variant:PdfVariant;rev:PdfRevision}|{ok:false;detail:string};

/** `variant` defaults to the customer quote; `rev` to the latest sent revision. */
export function parsePdfQuery(params:URLSearchParams):PdfQuery{
  const variant=params.get('variant')||PDF_VARIANTS[0];
  if(!(PDF_VARIANTS as readonly string[]).includes(variant))return {ok:false,detail:`Unknown PDF variant "${variant}". Use variant=${PDF_VARIANTS.join(' or ')}.`};
  const rev=parseRevision(params.get('rev'));
  return rev.ok?{ok:true,variant:variant as PdfVariant,rev:rev.rev}:rev;
}

/**
 * A `rev` query value: a sent revision number, 'draft', or null (absent or empty) for the latest
 * sent revision. Shared with the Line items CSV (task 4.3), which exports the same revisions.
 */
export function parseRevision(rev:string|null):{ok:true;rev:PdfRevision}|{ok:false;detail:string}{
  if(rev===null||rev==='')return {ok:true,rev:null};
  if(rev==='draft')return {ok:true,rev:'draft'};
  if(!/^[1-9]\d{0,5}$/.test(rev))return {ok:false,detail:'rev must be a sent revision number (1, 2, …) or draft.'};
  return {ok:true,rev:Number(rev)};
}
