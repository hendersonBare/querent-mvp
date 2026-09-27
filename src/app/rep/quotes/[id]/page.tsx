import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {QuotePlaceholder} from '@/components/rep/quotes/QuotePlaceholder';
import {effectiveStatus} from '@/server/quotes';
import {repQuote} from '@/server/rep/quotes';
import {signedInRepId} from '@/server/rep/session';

type Params=Promise<{id:string}>;

export async function generateMetadata({params}:{params:Params}):Promise<Metadata>{
  return {title:(await params).id};
}

/**
 * One quote, by number (/rep/quotes/Q-24817) or id. Task 3.3 builds the quote detail here; until
 * then it shows the header and marks the quote read (spec §4: opening a quote clears its unread
 * flag). Another rep's quote is not found, as it isn't in this rep's list.
 */
export default async function QuotePage({params}:{params:Params}){
  const repId=await signedInRepId();
  const q=repQuote(repId,(await params).id);
  if(!q)notFound();
  const now=new Date().toISOString();
  return <QuotePlaceholder asOf={now} quote={{id:q.id,quote_number:q.quote_number,revision:q.revision,status:effectiveStatus(q,now),customer_name:q.customer_name,
    contact_name:q.contact_name,requested_at:q.requested_at,is_sample:q.is_sample}}/>;
}
