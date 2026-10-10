import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {QuoteDetailView} from '@/components/rep/quote-detail/QuoteDetailView';
import {repQuoteDetail} from '@/server/rep/quote-detail';
import {signedInRep} from '@/server/rep/session';
import {reps} from '@/server/repository';

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
 *
 * The manager (task D2) may open any rep's quote: read-only, untouched and not repriced, with
 * Reassign; on any quote she gets the active reps to reassign it to. After a move the page remounts
 * (its key includes the quote's rep), so the editor starts from what the new owner sees.
 */
export default async function QuotePage({params}:{params:Params}){
  const {repId,manager}=await signedInRep();
  const detail=await repQuoteDetail(repId,(await params).id,{touch:true,manager});
  if(!detail)notFound();
  const reassign=manager?{me:repId,targets:reps({activeOnly:true}).map(({id,name})=>({id,name}))}:undefined;
  return <QuoteDetailView key={`${detail.quote.id}:${detail.quote.rep_id}`} initial={detail} reassign={reassign}/>;
}
