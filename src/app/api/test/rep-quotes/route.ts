import {NextResponse} from 'next/server';
import {duplicateQuote,requestChanges,sendQuote} from '@/server/quotes/service';
import {createQuote} from '@/server/repository';
export const runtime='nodejs';export const dynamic='force-dynamic';

// Test-only hook (task 3.2, e2e/rep-quotes.spec.ts): after POST /api/test/reset, adds the quote
// states the rep's Quotes list shows but the seed doesn't have, through the real quote services.
// Times are relative to the server's clock, so the quotes are as fresh (or as overdue) on any day.
// Like the reset, it exists only when the server runs with QUERENT_E2E_RESET=1.
// TODO(R-6): guard /api/test/* more strictly before deployment (an env flag alone keeps them off by default, nothing more).

const CHANGE_NOTE='Can you make the gloves 6 cases, and hold it for pickup at SLC instead?';
const DAY=86_400_000;

export async function POST(){
  if(process.env.QUERENT_E2E_RESET!=='1')return NextResponse.json({detail:'Not found.'},{status:404});
  const now=Date.now(),daysAgo=(days:number)=>new Date(now-days*DAY).toISOString();
  // Dana asked for changes to a quote Brandi sent two days ago (a copy of Q-24816).
  const changes=duplicateQuote('Q-24816',{repId:'brandi',now:daysAgo(3)});
  await sendQuote(changes.id,{repId:'brandi',now:daysAgo(2)});
  requestChanges('wasatch',changes.id,{revision:1,note:CHANGE_NOTE,now:daysAgo(1)});
  // Sent yesterday, waiting on Dana (a copy of Q-24815).
  const sent=duplicateQuote('Q-24815',{repId:'brandi',now:daysAgo(2)});
  await sendQuote(sent.id,{repId:'brandi',now:daysAgo(1)});
  // Sent 20 days ago and valid for 14: overdue, stored as sent until the list's lazy expiry.
  const overdue=duplicateQuote('Q-24814',{repId:'brandi',now:daysAgo(21)});
  await sendQuote(overdue.id,{repId:'brandi',now:daysAgo(20)});
  // Mara's customer asked for a quote: never in Brandi's list.
  const otherRep=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',at:daysAgo(1),
    lines:[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:82,priceBasis:'custom'}]});
  return NextResponse.json({changes_requested:changes.quote_number,sent:sent.quote_number,overdue:overdue.quote_number,other_rep:otherRep.quote_number});
}
