import 'server-only';
import {NextResponse} from 'next/server';
import {renderCustomerQuotePdf} from './CustomerQuotePdf';
import type {CustomerPdfModel} from './model';

// Responses for GET /api/quotes/:id/pdf (tasks 4.1 and 4.2), shared by the customer and rep paths.

/**
 * The one answer for any quote a caller may not see: unknown, another customer's, not sent yet,
 * a revision that doesn't exist. It never says which, so ids can't be probed.
 */
export const QUOTE_NOT_FOUND='Quote not found.';

/** A JSON error with the same `detail` shape as the other API routes. */
export function pdfError(detail:string,status:number){
  return NextResponse.json({detail},{status,headers:{'cache-control':'no-store'}});
}

/** "Herrick quote Q-1 rev 1.pdf" for Content-Disposition: printable ASCII, no quotes or backslashes. */
const asciiName=(name:string)=>name.replace(/[^\x20-\x7e]/g,'').replace(/["\\]/g,'');

/**
 * A rendered PDF, inline so the preview modal can show it (a Download link adds its own
 * download attribute). Never cached: a draft preview changes as the rep edits, and the answer
 * depends on who is asking. Takes bytes, so this module never imports the internal worksheet.
 */
export function pdfFileResponse(bytes:Uint8Array,filename:string){
  return new Response(bytes as Uint8Array<ArrayBuffer>,{status:200,headers:{
    'content-type':'application/pdf',
    'content-disposition':`inline; filename="${asciiName(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    'content-length':String(bytes.byteLength),
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
  }});
}

/** The customer quote PDF as a response. */
export async function pdfResponse(model:CustomerPdfModel){
  return pdfFileResponse(await renderCustomerQuotePdf(model),model.filename);
}
