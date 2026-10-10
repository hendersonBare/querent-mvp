import {NextResponse} from 'next/server';
import {moveQuotes} from '@/server/rep/reassign';
import {declineQuote,sendQuote} from '@/server/quotes/service';
import {createQuote} from '@/server/repository';
export const runtime='nodejs';export const dynamic='force-dynamic';

// Test-only hook (task D3, e2e/team-dashboard.spec.ts): after POST /api/test/reset, adds quotes for
// Mara (Canyon Ridge) and Nora (Uinta) made in the last few days through the real quote services,
// so the Team dashboard has two reps to compare: a send and a decline each (Mara's customer picks
// Other with a note, Nora's "Price too high"), an overdue draft of Mara's, an aging draft of Nora's,
// and one of Mara's moved to Eli. Times are relative to the server's clock. Like the reset, it
// exists only when the server runs with QUERENT_E2E_RESET=1. F1 replaces this with the demo seed.

const OTHER_NOTE='Found the same gloves at the hardware store down the road.';
const HOUR=3_600_000;

export async function POST(){
  if(process.env.QUERENT_E2E_RESET!=='1')return NextResponse.json({detail:'Not found.'},{status:404});
  const now=Date.now(),ago=(hours:number)=>new Date(now-hours*HOUR).toISOString();
  const make=(customerId:string,hours:number)=>createQuote({customerId,fulfillment:'will_call',branchId:'slc',at:ago(hours),
    lines:[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:82,priceBasis:'custom'}]});
  const other=make('canyon-ridge',72);
  await sendQuote(other.id,{repId:'mara',now:ago(70)});
  declineQuote('canyon-ridge',other.id,{revision:1,reason:'other',note:OTHER_NOTE,now:ago(48)});
  make('canyon-ridge',30);
  const price=make('uinta-facility',60);
  await sendQuote(price.id,{repId:'nora',now:ago(58)});
  declineQuote('uinta-facility',price.id,{revision:1,reason:'price_too_high',now:ago(30)});
  make('uinta-facility',5);
  const moved=make('canyon-ridge',20);
  moveQuotes('brandi',[moved.id],{id:'eli',name:'Eli Porter'},{now:ago(19)});
  return NextResponse.json({declined_other:other.quote_number,declined_price:price.quote_number,other_note:OTHER_NOTE,moved:moved.quote_number});
}
