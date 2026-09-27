import 'server-only';
import type {Quote,QuoteRevision} from '@/domain';
import {accountSummary,branches,quoteRevision,rep,supplier} from '@/server/repository';
import type {QuoteFreight} from '@/server/freight/engine';
import {freightForQuote} from '@/server/freight/quote';
import {STATUS_LABELS,canEditDraft} from '@/server/quotes/lifecycle';
import {repQuote} from '@/server/rep/quotes';
import {fromDraft} from './draft';
import {customerPdfModel,fromSnapshot,pdfContext,type CustomerPdfModel,type PdfContext,type PdfQuote} from './model';
import {QUOTE_NOT_FOUND} from './http';
import type {PdfRevision} from './request';

// The rep's side of GET /api/quotes/:id/pdf?variant=customer (task 4.1): the customer PDF of any
// sent revision, or a preview of the unsent draft (rev=draft, for the 3.7 send dialog). It reads
// the internal quote, but the PDF only ever gets fromSnapshot / fromDraft copies, which hold
// customer fields only. Customers are served by src/app/api/quotes/[id]/pdf/customer.ts instead.
// The internal worksheet (./internal, task 4.2) starts from the same revision or draft.
//
// Whose quotes: the signed-in rep's own (repQuote, the rule of the Quotes list and the quote
// page, task 3.2). Another rep's quote is the same 404 as an unknown one, in both variants.

export type RepPdfSource=
  |{ok:true;quote:Quote;source:PdfQuote;
    /** The draft's freight (rev=draft), or null for a sent revision, whose freight is frozen. */
    freight:QuoteFreight|null;
    /** The stored revision, or null for the draft. */
    revision:QuoteRevision|null}
  |{ok:false;status:404|409;detail:string};

/**
 * One of `repId`'s quotes and what its PDF prints: rev n, the latest sent (rev null), or the
 * draft. Another rep's quote reads as not found, like an unknown one.
 */
export async function repPdfSource(repId:string,quoteIdOrNumber:string,rev:PdfRevision,now:string):Promise<RepPdfSource>{
  const q=repQuote(repId,quoteIdOrNumber);
  if(!q)return {ok:false,status:404,detail:QUOTE_NOT_FOUND};
  if(rev==='draft'){
    if(!canEditDraft(q.status))return {ok:false,status:409,detail:`${q.quote_number} has no draft to preview: it is ${STATUS_LABELS[q.status].toLowerCase()}. Open rev ${q.revision} instead.`};
    const freight=await freightForQuote(q);
    return {ok:true,quote:q,source:fromDraft(q,freight,now),freight,revision:null};
  }
  const stored=quoteRevision(q.id,rev??q.revision);
  if(!stored)return {ok:false,status:404,detail:rev===null?`${q.quote_number} hasn't been sent yet. Preview the draft with rev=draft.`:`${q.quote_number} has no rev ${rev}.`};
  return {ok:true,quote:q,source:fromSnapshot(stored.snapshot,stored.sent_at),freight:null,revision:stored};
}

/** The live letterhead, rep and terms around the quote (used where the source has nothing frozen). */
export function repPdfContext(q:Quote,source:PdfQuote):PdfContext{
  return pdfContext(source.branch,{supplier:supplier(),branches:branches(),rep:rep(q.rep_id)??null,terms:accountSummary(q.customer_id)?.terms??null});
}

export type RepPdf={ok:true;model:CustomerPdfModel}|{ok:false;status:404|409;detail:string};

/** The customer PDF of one of `repId`'s quotes: rev n, the latest sent (rev null), or the draft. */
export async function repCustomerPdf(repId:string,quoteIdOrNumber:string,rev:PdfRevision,now=new Date().toISOString()):Promise<RepPdf>{
  const loaded=await repPdfSource(repId,quoteIdOrNumber,rev,now);
  if(!loaded.ok)return loaded;
  return {ok:true,model:customerPdfModel(loaded.source,repPdfContext(loaded.quote,loaded.source))};
}
