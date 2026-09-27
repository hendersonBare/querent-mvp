import 'server-only';
import {accountSummary,branches,quote,quoteByNumber,quoteRevision,rep,supplier} from '@/server/repository';
import {freightForQuote} from '@/server/freight/quote';
import {STATUS_LABELS,canEditDraft} from '@/server/quotes/lifecycle';
import {fromDraft} from './draft';
import {customerPdfModel,fromSnapshot,pdfContext,type CustomerPdfModel,type PdfQuote} from './model';
import {QUOTE_NOT_FOUND} from './http';
import type {PdfRevision} from './request';

// The rep's side of GET /api/quotes/:id/pdf?variant=customer (task 4.1): the customer PDF of any
// sent revision, or a preview of the unsent draft (rev=draft, for the 3.7 send dialog). It reads
// the internal quote, but the PDF only ever gets fromSnapshot / fromDraft copies, which hold
// customer fields only. Customers are served by src/app/api/quotes/[id]/pdf/customer.ts instead.

export type RepPdf={ok:true;model:CustomerPdfModel}|{ok:false;status:404|409;detail:string};

/** The customer PDF the rep asked for: rev n, the latest sent (rev null), or the draft. */
export async function repCustomerPdf(quoteIdOrNumber:string,rev:PdfRevision,now=new Date().toISOString()):Promise<RepPdf>{
  const q=quote(quoteIdOrNumber)??quoteByNumber(quoteIdOrNumber);
  if(!q)return {ok:false,status:404,detail:QUOTE_NOT_FOUND};
  let source:PdfQuote;
  if(rev==='draft'){
    if(!canEditDraft(q.status))return {ok:false,status:409,detail:`${q.quote_number} has no draft to preview: it is ${STATUS_LABELS[q.status].toLowerCase()}. Open rev ${q.revision} instead.`};
    source=fromDraft(q,await freightForQuote(q),now);
  }else{
    const stored=quoteRevision(q.id,rev??q.revision);
    if(!stored)return {ok:false,status:404,detail:rev===null?`${q.quote_number} hasn't been sent yet. Preview the draft with rev=draft.`:`${q.quote_number} has no rev ${rev}.`};
    source=fromSnapshot(stored.snapshot,stored.sent_at);
  }
  const quoteRep=rep(q.rep_id)??null;
  return {ok:true,model:customerPdfModel(source,pdfContext(source.branch,{supplier:supplier(),branches:branches(),rep:quoteRep,terms:accountSummary(q.customer_id)?.terms??null}))};
}
