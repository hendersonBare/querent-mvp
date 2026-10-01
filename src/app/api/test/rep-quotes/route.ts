import {NextResponse} from 'next/server';
import {duplicateQuote,requestChanges,sendQuote} from '@/server/quotes/service';
import {createQuote} from '@/server/repository';
export const runtime='nodejs';export const dynamic='force-dynamic';

// Test-only hook (task 3.2, e2e/rep-quotes.spec.ts): after POST /api/test/reset, adds the quote
// states the rep's Quotes list shows but the seed doesn't have, through the real quote services.
// Times are relative to the server's clock, so the quotes are as fresh (or as overdue) on any day.
// Like the reset, it exists only when the server runs with QUERENT_E2E_RESET=1.

const CHANGE_NOTE='Can you make the labels 8 cases, and hold it for pickup at Spanish Fork instead?';
const DAY=86_400_000;

export async function POST(){
  if(process.env.QUERENT_E2E_RESET!=='1')return NextResponse.json({detail:'Not found.'},{status:404});
  const now=Date.now(),daysAgo=(days:number)=>new Date(now-days*DAY).toISOString();
  // Megan asked for changes to a quote Landon sent two days ago (a copy of Q-24816).
  const changes=duplicateQuote('Q-24816',{repId:'landon',now:daysAgo(3)});
  await sendQuote(changes.id,{repId:'landon',now:daysAgo(2)});
  requestChanges('timpanogos',changes.id,{revision:1,note:CHANGE_NOTE,now:daysAgo(1)});
  // Sent yesterday, waiting on Megan (a copy of Q-24815).
  const sent=duplicateQuote('Q-24815',{repId:'landon',now:daysAgo(2)});
  await sendQuote(sent.id,{repId:'landon',now:daysAgo(1)});
  // Sent 20 days ago and valid for 14: overdue, stored as sent until the list's lazy expiry.
  const overdue=duplicateQuote('Q-24814',{repId:'landon',now:daysAgo(21)});
  await sendQuote(overdue.id,{repId:'landon',now:daysAgo(20)});
  // Eli's customer asked for a quote: never in Landon's list.
  const otherRep=createQuote({customerId:'provo-canyon',fulfillment:'will_call',branchId:'spanish-fork',at:daysAgo(1),
    lines:[{itemId:'B833',qty:2,unitPrice:25.5,priceBasis:'custom'}]});
  return NextResponse.json({changes_requested:changes.quote_number,sent:sent.quote_number,overdue:overdue.quote_number,other_rep:otherRep.quote_number});
}
