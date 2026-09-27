import 'server-only';
import {pdfError,pdfResponse,QUOTE_NOT_FOUND} from '@/server/pdf/http';
import {customerPdfModel,fromSnapshot,pdfContext} from '@/server/pdf/model';
import type {PdfRevision} from '@/server/pdf/request';
import {accountSummary,branches,customerQuoteRevision,supplier} from '@/server/repository/customer';

// The customer's side of GET /api/quotes/:id/pdf (task 4.1). Customer route: the customer-safe
// repository module only (repository/boundary.test.ts). The PDF is built from the frozen snapshot
// of a revision the rep sent, so it shows exactly what the customer was sent (spec §5.4).

/**
 * The PDF of one of the customer's own quotes: revision `rev`, or the latest sent. Anything else
 * (a draft, another customer's quote, an unknown id or revision) is the same 404.
 */
export async function customerQuotePdf(customerId:string,quoteIdOrNumber:string,rev:PdfRevision){
  if(rev==='draft')return pdfError(QUOTE_NOT_FOUND,404);
  const sent=customerQuoteRevision(customerId,quoteIdOrNumber,rev??undefined);
  if(!sent)return pdfError(QUOTE_NOT_FOUND,404);
  const source=fromSnapshot(sent.snapshot,sent.sent_at);
  const context=pdfContext(source.branch,{supplier:supplier(),branches:branches(),rep:sent.rep,terms:accountSummary(customerId)?.terms??null});
  return pdfResponse(customerPdfModel(source,context));
}
