import type {NextRequest} from 'next/server';
import {pdfError,pdfFileResponse,pdfResponse} from '@/server/pdf/http';
import {internalWorksheet} from '@/server/pdf/internal';
import {renderInternalWorksheetPdf} from '@/server/pdf/InternalWorksheetPdf';
import {repCustomerPdf} from '@/server/pdf/rep';
import {CUSTOMER_VARIANT,parsePdfQuery} from '@/server/pdf/request';
import {principal} from '@/server/session';
import {customerQuotePdf} from './customer';
export const runtime='nodejs';export const dynamic='force-dynamic';

// GET /api/quotes/:id/pdf?variant=customer|internal&rev=n|draft (tasks 4.1 and 4.2, spec §6.7), by
// quote id or number. rev is a sent revision; without it, the latest one sent.
//
// Who sees what (the customer's path lives in ./customer.ts, on the customer-safe repository only):
// - the customer: the customer quote of their own quotes, and only revisions the rep sent. A draft
//   (e.g. Q-24817 in ready_for_review) has unreviewed prices, so it is 404 like any quote they
//   can't see. variant=internal is 403 before anything is looked up: the worksheet is rep-only.
// - the rep: any sent revision, or rev=draft to preview the unsent draft (the 3.7 send dialog), as
//   the customer quote or as the internal worksheet (cost, margin, floors, Querent's reasoning,
//   credit and internal notes). Like the customer quote, Brandi (supplier_admin) can open any quote.
// - no session: 401. Unknown ids, other customers' quotes and unsent revisions: 404.

export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  const user=principal(request);
  if(!user)return pdfError('Choose a demo workspace.',401);
  const query=parsePdfQuery(request.nextUrl.searchParams);
  if(!query.ok)return pdfError(query.detail,400);
  const {id}=await params;
  if(user.role==='customer_user'){
    if(query.variant!==CUSTOMER_VARIANT)return pdfError('Supplier access required.',403);
    if(!user.customer_id)return pdfError('Customer access required.',403);
    return customerQuotePdf(user.customer_id,id,query.rev);
  }
  // The rep check of /api/rep/badges (task 3.1).
  if(user.role!=='supplier_admin'||!user.rep_id)return pdfError('Supplier access required.',403);
  if(query.variant==='internal'){
    const worksheet=await internalWorksheet(id,query.rev);
    return worksheet.ok?pdfFileResponse(await renderInternalWorksheetPdf(worksheet.model),worksheet.model.filename):pdfError(worksheet.detail,worksheet.status);
  }
  const pdf=await repCustomerPdf(id,query.rev);
  return pdf.ok?pdfResponse(pdf.model):pdfError(pdf.detail,pdf.status);
}
