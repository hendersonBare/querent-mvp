import {describe,expect,it} from 'vitest';
import type {NewQuote} from '@/domain';
import {createQuote,markQuoteRead,quote} from '@/server/repository';
import {acceptQuote,requestChanges,sendQuote} from '@/server/quotes/service';
import {useSeededDatabase} from '@/server/repository/test-db';
import {repBadges} from './badges';

// The rep portal's Quotes badge (task 3.1) against the seed pinned to the mockup's day.
useSeededDatabase();

const T0='2026-09-23T16:00:00.000Z',SENT='2026-09-23T17:00:00.000Z',LATER='2026-09-24T15:00:00.000Z';
/** Valid 14 days from Sep 23 is Oct 7; the first instant after that day. */
const AFTER_EXPIRY='2026-10-08T00:00:00.000Z';

/** A priced Wasatch will-call quote, as the item pop-up's Request quote creates it. */
const request=(input:Partial<NewQuote>={})=>createQuote({customerId:'wasatch',contactId:'dana',fulfillment:'will_call',branchId:'slc',at:T0,
  lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'last_paid'}],...input});

describe('repBadges: the Quotes unread badge',()=>{
  it('counts the seeded sample quote Q-24817 for Brandi, and nothing for reps without unread quotes',()=>{
    expect(repBadges('brandi',{now:T0})).toEqual({quotes:1,attention:0});
    // Nora has no quotes; Mara's and Eli's demo books (task F1) each hold a new draft they haven't opened.
    expect(repBadges('nora',{now:T0})).toEqual({quotes:0,attention:0});
    expect(repBadges('mara',{now:T0}).quotes).toBe(1);
  });

  it('goes up when a customer requests a quote and down when the rep opens it',()=>{
    const q=request();
    expect(repBadges('brandi',{now:T0}).quotes).toBe(2);
    markQuoteRead(q.id,'rep');
    expect(repBadges('brandi',{now:T0}).quotes).toBe(1);
  });

  it('clears on send, and comes back when the customer requests changes or accepts',async()=>{
    const changes=request(),accepted=request();
    expect(repBadges('brandi',{now:T0}).quotes).toBe(3);
    await sendQuote(changes.id,{repId:'brandi',now:SENT});
    await sendQuote(accepted.id,{repId:'brandi',now:SENT});
    expect(repBadges('brandi',{now:SENT}).quotes).toBe(1);
    requestChanges('wasatch',changes.id,{revision:1,note:'Make it 12 boxes.',now:LATER});
    acceptQuote('wasatch',accepted.id,{revision:1,fulfillmentTime:'2026-09-25',customerPo:'7781',now:LATER});
    expect(repBadges('brandi',{now:LATER}).quotes).toBe(3);
    markQuoteRead(changes.id,'rep');markQuoteRead(accepted.id,'rep');
  });

  it('stores lazy expiry first, so counts read effective statuses',async()=>{
    const {quote:sent}=await sendQuote(request().id,{repId:'brandi',now:SENT});
    expect(repBadges('brandi',{now:LATER}).quotes).toBe(1);
    expect(quote(sent.id)?.status).toBe('sent');
    expect(repBadges('brandi',{now:AFTER_EXPIRY}).quotes).toBe(1);
    expect(quote(sent.id)?.status).toBe('expired');
  });
});
