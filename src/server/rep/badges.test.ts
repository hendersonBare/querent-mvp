import {describe,expect,it} from 'vitest';
import type {NewQuote} from '@/domain';
import {createQuote,markQuoteRead,quote} from '@/server/repository';
import {acceptQuote,declineQuote,requestChanges,sendQuote} from '@/server/quotes/service';
import {useSeededDatabase} from '@/server/repository/test-db';
import {repBadges} from './badges';
import {repQuoteList} from './quotes';

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
    expect(repBadges('brandi',{now:T0})).toMatchObject({quotes:1,attention:0});
    // Nora has no quotes; Mara's and Eli's demo books (task F1) each hold a new draft they haven't opened.
    expect(repBadges('nora',{now:T0})).toMatchObject({quotes:0,attention:0,caution:[],bell:[]});
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

// The header dropdowns (plan U2; C_QOB3 caution, C_QOB4 bell): counts plus short summaries.
describe('repBadges: the caution dropdown (Needs attention, C_QOB3)',()=>{
  const FIVE_H='2026-09-23T21:00:00.000Z',TWO_DAYS='2026-09-25T16:00:00.000Z';

  it('lists the amber and red open quotes, red first, each with its number, Overdue or Aging, and one line',async()=>{
    const q=request();
    const {caution,attention}=repBadges('brandi',{now:FIVE_H});
    const mine=caution.find(c=>c.id===q.id);
    expect(mine).toEqual({id:q.id,quote_number:q.quote_number,kind:'quote_aging',label:q.quote_number,tag:'Aging',
      line:'Wasatch Mechanical Contractors, requested 5 hours ago.',at:T0});
    expect(caution.filter(c=>c.tag==='Overdue')).toHaveLength(attention);
    const tags=caution.map(c=>c.tag);
    expect(tags).toEqual([...tags].sort((a,b)=>(a==='Overdue'?0:1)-(b==='Overdue'?0:1)));
    markQuoteRead(q.id,'rep');
    // Still needs attention after it is read: aging is not the unread flag.
    expect(repBadges('brandi',{now:TWO_DAYS}).caution.find(c=>c.id===q.id)).toMatchObject({tag:'Overdue',kind:'quote_overdue',line:'Wasatch Mechanical Contractors, requested 2 days ago.'});
  });

  it('holds the same quotes as the Quotes list\'s Needs attention view: the rep\'s own, or every rep\'s for the manager (task U1)',async()=>{
    // The demo books' aging quotes are seeded relative to the reset time (task F1), so read them now.
    const now=new Date().toISOString();
    const ids=(rows:{id:string}[])=>rows.map(r=>r.id).sort();
    for(const [rep,manager] of [['brandi',true],['brandi',false],['mara',false],['eli',false]] as const){
      const list=await repQuoteList(rep,{attention:true,manager,now});
      expect(ids(repBadges(rep,{manager,now}).caution)).toEqual(ids(list.rows));
    }
    const managers=repBadges('brandi',{manager:true,now}).caution;
    expect(managers.length).toBeGreaterThan(repBadges('brandi',{now}).caution.length);
    expect(repBadges('mara',{now}).caution.length).toBeGreaterThan(0);
  });
});

describe('repBadges: the bell dropdown (Notifications, C_QOB4)',()=>{
  it('lists the reader\'s unread customer events, newest first, worded as C_QOB4 words them',async()=>{
    const {bell}=repBadges('brandi',{now:T0});
    expect(bell).toEqual([{id:'q-24817',quote_number:'Q-24817',kind:'quote_requested',label:'Q-24817 requested by Wasatch Mechanical Contractors',tag:null,line:null,at:'2026-09-23T16:14:00.000Z'}]);

    const changes=request(),accepted=request(),declined=request();
    for(const q of [changes,accepted,declined])await sendQuote(q.id,{repId:'brandi',now:SENT});
    requestChanges('wasatch',changes.id,{revision:1,note:'Make it 12 boxes.',now:LATER});
    acceptQuote('wasatch',accepted.id,{revision:1,fulfillmentTime:'2026-09-25',customerPo:'7781',now:'2026-09-24T16:00:00.000Z'});
    declineQuote('wasatch',declined.id,{revision:1,reason:'price_too_high',now:'2026-09-24T17:00:00.000Z'});
    const after=repBadges('brandi',{now:'2026-09-24T18:00:00.000Z'}).bell;
    expect(after.map(b=>[b.kind,b.label,b.at])).toEqual([
      ['quote_declined',`${declined.quote_number} declined by Wasatch Mechanical Contractors`,'2026-09-24T17:00:00.000Z'],
      ['quote_accepted',`${accepted.quote_number} accepted by Wasatch Mechanical Contractors`,'2026-09-24T16:00:00.000Z'],
      ['change_requested',`Dana Ortiz replied on ${changes.quote_number}`,LATER],
      ['quote_requested','Q-24817 requested by Wasatch Mechanical Contractors','2026-09-23T16:14:00.000Z'],
    ]);
    expect(after).toHaveLength(repBadges('brandi',{now:'2026-09-24T18:00:00.000Z'}).quotes);
    for(const q of [changes,accepted,declined])markQuoteRead(q.id,'rep');
    expect(repBadges('brandi',{now:'2026-09-24T18:00:00.000Z'}).bell.map(b=>b.id)).toEqual(['q-24817']);
  });

  it('is each reader\'s own, for the manager too (unread is the owner\'s flag)',()=>{
    const manager=repBadges('brandi',{manager:true,now:T0}).bell;
    const mara=repBadges('mara',{now:T0}).bell;
    expect(mara.length).toBe(1);
    expect(manager.map(b=>b.id)).not.toContain(mara[0]!.id);
    expect(manager).toEqual(repBadges('brandi',{now:T0}).bell);
  });

  it('takes the reader\'s notification preferences through one seam (plan U9 fills it)',()=>{
    const all=repBadges('brandi',{now:T0});
    const none=repBadges('brandi',{now:T0,notify:()=>false});
    expect(none.bell).toEqual([]);
    expect(none.caution).toEqual([]);
    expect(none.quotes).toBe(all.quotes);
    expect(repBadges('brandi',{now:T0,notify:kind=>kind!=='quote_requested'}).bell).toEqual([]);
  });
});
