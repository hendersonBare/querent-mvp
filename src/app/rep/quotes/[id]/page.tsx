import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {QuoteDetailView} from '@/components/rep/quote-detail/QuoteDetailView';
import {repQuoteDetail} from '@/server/rep/quote-detail';
import {signedInRepId} from '@/server/rep/session';

type Params=Promise<{id:string}>;

export async function generateMetadata({params}:{params:Params}):Promise<Metadata>{
  return {title:(await params).id};
}

/**
 * One quote, by number (/rep/quotes/Q-24817) or id: the quote detail (spec §4, task 3.3). The
 * page checks the rep session itself (the layout's check doesn't stop a segment rendering), and
 * another rep's quote is not found, as it isn't in this rep's list. Once on screen, the page
 * marks the quote read for the rep (POST /api/rep/quotes/<id>/read). Loading the page touches the
 * quote for its rep (last_rep_touch_at, v3 spec §3); the Quotes list never prefetches it.
 */
export default async function QuotePage({params}:{params:Params}){
  const repId=await signedInRepId();
  const detail=await repQuoteDetail(repId,(await params).id,{touch:true});
  if(!detail)notFound();
  return <QuoteDetailView key={detail.quote.id} initial={detail}/>;
}
