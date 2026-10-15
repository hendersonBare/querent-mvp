import {describe,expect,it} from 'vitest';
import type {NewQuote} from '@/domain';
import {createQuote,markQuoteRead,quote,saveQuoteTransition} from '@/server/repository';
import {acceptQuote,declineQuote,requestChanges,sendQuote} from '@/server/quotes/service';
import {useSeededDatabase} from '@/server/repository/test-db';
import {askedLine,repBadges} from './badges';
import {updateNotificationPrefs} from './notification-prefs';
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
      line:'Requested Sep 23, not sent yet.',at:T0});
    expect(caution.filter(c=>c.tag==='Overdue')).toHaveLength(attention);
    const tags=caution.map(c=>c.tag);
    expect(tags).toEqual([...tags].sort((a,b)=>(a==='Overdue'?0:1)-(b==='Overdue'?0:1)));
    markQuoteRead(q.id,'rep');
    // Still needs attention after it is read: aging is not the unread flag.
    expect(repBadges('brandi',{now:TWO_DAYS}).caution.find(c=>c.id===q.id)).toMatchObject({tag:'Overdue',kind:'quote_overdue',line:'Requested Sep 23, not sent yet.'});
  });

  // C_QOB3's rows: "Dana Ortiz asked to move pickup to Ogden.", "Draft has 1 line below the margin
  // floor.", "Sent Oct 6, no reply yet." Each caution row's line follows the pattern for its status.
  const lineOf=(rep:string,id:string,now:string)=>repBadges(rep,{now}).caution.find(c=>c.id===id)?.line;

  it('words a draft with lines below the margin floor as C_QOB3 does: "Draft has 1 line below the margin floor."',()=>{
    const low={itemId:'HCS-12-13-2G8',qty:10,unitPrice:1,priceBasis:'custom' as const};
    const one=request({lines:[low]}),two=request({lines:[low,{...low,itemId:'ANC-12-414-W'}]});
    expect(lineOf('brandi',one.id,FIVE_H)).toBe('Draft has 1 line below the margin floor.');
    expect(lineOf('brandi',two.id,FIVE_H)).toBe('Draft has 2 lines below the margin floor.');
    markQuoteRead(one.id,'rep');markQuoteRead(two.id,'rep');
  });

  it('words a change request as C_QOB3 does: "<contact> asked to <the change, one short line>."',async()=>{
    const q=request();
    await sendQuote(q.id,{repId:'brandi',now:SENT});
    requestChanges('wasatch',q.id,{revision:1,note:'Can you move pickup to Ogden?\nThanks, Dana',now:LATER});
    expect(lineOf('brandi',q.id,'2026-09-24T20:00:00.000Z')).toBe('Dana Ortiz asked to move pickup to Ogden.');
    markQuoteRead(q.id,'rep');
  });

  it('words a sent quote with no reply as C_QOB3 does: "Sent <Mon D>, no reply yet.", also when it is about to expire',async()=>{
    const q=request();
    await sendQuote(q.id,{repId:'brandi',now:SENT});
    expect(lineOf('brandi',q.id,'2026-09-27T17:00:00.000Z')).toBe('Sent Sep 23, no reply yet.');
    // Valid until Oct 7: red on its last day by the expiry rule.
    expect(lineOf('brandi',q.id,'2026-10-07T12:00:00.000Z')).toBe('Sent Sep 23, no reply yet.');
  });

  it('words the seeded aging quotes from their real data',()=>{
    const now=new Date().toISOString();
    const rows=repBadges('brandi',{manager:true,now}).caution;
    expect(rows.find(c=>c.quote_number==='Q-24790')?.line).toBe('Dana Ortiz asked to hold the anchors for pickup…');
    const sent=quote('q-24789')!.sent_at!;
    const day=new Date(sent).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
    expect(rows.find(c=>c.quote_number==='Q-24789')?.line).toBe(`Sent ${day}, no reply yet.`);
  });
});

describe('askedLine: a change request as one short line (C_QOB3 "Dana Ortiz asked to move pickup to Ogden.")',()=>{
  it('drops the polite opening and the closing mark, and keeps the first line and sentence',()=>{
    expect(askedLine('Dana Ortiz','Can you move pickup to Ogden?')).toBe('Dana Ortiz asked to move pickup to Ogden.');
    expect(askedLine('Dana Ortiz','Make it 12 boxes. Same price as last time.')).toBe('Dana Ortiz asked to make it 12 boxes.');
    expect(askedLine('Dana Ortiz','Please swap the straps.\nThanks')).toBe('Dana Ortiz asked to swap the straps.');
    expect(askedLine('Dana Ortiz','Could you please add 2 boxes of flap discs')).toBe('Dana Ortiz asked to add 2 boxes of flap discs.');
    expect(askedLine('Dana Ortiz','We need to push delivery to Friday!')).toBe('Dana Ortiz asked to push delivery to Friday.');
  });

  it('trims a long request to one line: at the last comma that fits, else at a word, with an ellipsis',()=>{
    expect(askedLine('Kim','Can you split this into two deliveries, half now and half next month?')).toBe('Kim asked to split this into two deliveries.');
    expect(askedLine('Dana Ortiz','Please swap the 4 in straps for 2 in ones with flat hooks.')).toBe('Dana Ortiz asked to swap the 4 in straps for 2…');
    expect(askedLine('Dana Ortiz','Please swap the 4 in straps for 2 in ones with flat hooks.').length).toBeLessThanOrEqual(48);
  });

  it('keeps the frame\'s "asked" when the note is not a request it can follow with "to" (no frame), and when it is empty',()=>{
    expect(askedLine('Dana Ortiz','The size is wrong.')).toBe('Dana Ortiz asked for changes: the size is wrong.');
    expect(askedLine('Dana Ortiz','  ')).toBe('Dana Ortiz asked for changes.');
    expect(askedLine('Dana Ortiz','Can you send it to PO 7781?')).toBe('Dana Ortiz asked to send it to PO 7781.');
  });
});

describe('repBadges: the caution holds the Needs attention quotes',()=>{
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
    expect(bell).toEqual([{id:'q-24817',quote_number:'Q-24817',kind:'quote_requested',label:'Q-24817 requested by Dana Ortiz',tag:null,line:null,at:'2026-09-23T16:14:00.000Z'}]);

    const changes=request(),accepted=request(),declined=request();
    for(const q of [changes,accepted,declined])await sendQuote(q.id,{repId:'brandi',now:SENT});
    requestChanges('wasatch',changes.id,{revision:1,note:'Make it 12 boxes.',now:LATER});
    acceptQuote('wasatch',accepted.id,{revision:1,fulfillmentTime:'2026-09-25',customerPo:'7781',now:'2026-09-24T16:00:00.000Z'});
    declineQuote('wasatch',declined.id,{revision:1,reason:'price_too_high',now:'2026-09-24T17:00:00.000Z'});
    const after=repBadges('brandi',{now:'2026-09-24T18:00:00.000Z'}).bell;
    expect(after.map(b=>[b.kind,b.label,b.at])).toEqual([
      ['quote_declined',`${declined.quote_number} declined by Dana Ortiz`,'2026-09-24T17:00:00.000Z'],
      ['quote_accepted',`${accepted.quote_number} accepted by Wasatch Mechanical Contractors`,'2026-09-24T16:00:00.000Z'],
      ['change_requested',`Dana Ortiz replied on ${changes.quote_number}`,LATER],
      ['quote_requested','Q-24817 requested by Dana Ortiz','2026-09-23T16:14:00.000Z'],
    ]);
    expect(after).toHaveLength(repBadges('brandi',{now:'2026-09-24T18:00:00.000Z'}).quotes);
    for(const q of [changes,accepted,declined])markQuoteRead(q.id,'rep');
    expect(repBadges('brandi',{now:'2026-09-24T18:00:00.000Z'}).bell.map(b=>b.id)).toEqual(['q-24817']);
  });

  it('names whom C_QOB4 names: the contact who replied, the customer who accepted, by its full name (decision 59); the contact for events it does not sample (decision 58)',async()=>{
    const accepted=request();
    await sendQuote(accepted.id,{repId:'brandi',now:SENT});
    acceptQuote('wasatch',accepted.id,{revision:1,fulfillmentTime:'2026-09-25',customerPo:'7781',now:LATER});
    expect(repBadges('brandi',{now:LATER}).bell.find(b=>b.id===accepted.id)?.label).toBe(`${accepted.quote_number} accepted by Wasatch Mechanical Contractors`);
    markQuoteRead(accepted.id,'rep');
  });

  it('names the customer by its full name when the quote has no contact (decision 59), in the bell and the caution',async()=>{
    const q=request({contactId:null});
    await sendQuote(q.id,{repId:'brandi',now:SENT});
    requestChanges('wasatch',q.id,{revision:1,note:'Can you move pickup to Ogden?',now:LATER});
    const {bell,caution}=repBadges('brandi',{now:'2026-09-24T20:00:00.000Z'});
    expect(bell.find(b=>b.id===q.id)?.label).toBe(`Wasatch Mechanical Contractors replied on ${q.quote_number}`);
    expect(caution.find(c=>c.id===q.id)?.line).toBe('Wasatch Mechanical Contractors asked to move…');
    markQuoteRead(q.id,'rep');
  });

  it('prints an expired row\'s date only, the day it expired, as C_QOB4 does ("Q-24815 expired", "Sep 18")',async()=>{
    const {quote:sent}=await sendQuote(request().id,{repId:'brandi',now:SENT});
    // A sent quote is read; flag it unread as a stand-in for an expiry the rep has not seen.
    saveQuoteTransition(sent.id,{from:'sent',to:'sent',unreadForRep:true,at:SENT});
    const row=repBadges('brandi',{now:AFTER_EXPIRY}).bell.find(b=>b.id===sent.id);
    // Valid until Oct 7, so it expired as Oct 8 began.
    expect(row).toMatchObject({kind:'quote_expired',label:`${sent.quote_number} expired`,line:'Oct 8',at:AFTER_EXPIRY});
    markQuoteRead(sent.id,'rep');
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

// Settings > Notifications (plan U9; C_RS4) fills the seam: each switch drops the rows it names.
describe('repBadges: the rep\'s notification preferences (plan U9)',()=>{
  const FIVE_H='2026-09-23T21:00:00.000Z',TWO_DAYS='2026-09-25T16:00:00.000Z';

  it('applies the stored switches by default: the bell drops a new request when Customer chat needs a rep is off',()=>{
    const before=repBadges('mara',{now:T0});
    expect(before.bell.map(b=>b.kind)).toEqual(['quote_requested']);
    updateNotificationPrefs('mara',{customer_chat_needs_rep:false});
    expect(repBadges('mara',{now:T0}).bell).toEqual([]);
    expect(repBadges('mara',{now:T0}).quotes).toBe(before.quotes);
    updateNotificationPrefs('mara',{customer_chat_needs_rep:true});
    expect(repBadges('mara',{now:T0}).bell).toEqual(before.bell);
  });

  it('a caution row goes when any switch it falls under is off: Quote overdue or Quote aging by its tag, Below margin floor or Change requested by its line',async()=>{
    const low={itemId:'HCS-12-13-2G8',qty:10,unitPrice:1,priceBasis:'custom' as const};
    const below=request({lines:[low]}),plain=request(),changes=request();
    await sendQuote(changes.id,{repId:'brandi',now:SENT});
    requestChanges('wasatch',changes.id,{revision:1,note:'Can you move pickup to Ogden?',now:LATER});
    const at='2026-09-24T20:00:00.000Z';
    const ids=(now:string)=>repBadges('brandi',{now}).caution.map(c=>c.id);
    expect(ids(at)).toEqual(expect.arrayContaining([below.id,plain.id,changes.id]));
    updateNotificationPrefs('brandi',{below_margin_floor:false});
    expect(ids(at)).not.toContain(below.id);
    expect(ids(at)).toEqual(expect.arrayContaining([plain.id,changes.id]));
    updateNotificationPrefs('brandi',{below_margin_floor:true,change_requested:false});
    expect(ids(at)).not.toContain(changes.id);
    // The bell's "replied on" row is the same change request.
    expect(repBadges('brandi',{now:at}).bell.map(b=>b.id)).not.toContain(changes.id);
    updateNotificationPrefs('brandi',{change_requested:true});
    expect(repBadges('brandi',{now:at}).bell.map(b=>b.id)).toContain(changes.id);
    // Five hours in, a new draft is Aging; two days in, Overdue.
    updateNotificationPrefs('brandi',{quote_aging:false});
    expect(ids(FIVE_H)).not.toContain(plain.id);
    expect(ids(TWO_DAYS)).toContain(plain.id);
    updateNotificationPrefs('brandi',{quote_aging:true,quote_overdue:false});
    const overdueOff=repBadges('brandi',{now:TWO_DAYS});
    expect(overdueOff.caution.map(c=>c.id)).not.toContain(plain.id);
    expect(overdueOff.caution.every(c=>c.tag==='Aging')).toBe(true);
    // The header's count of red items follows the list it opens.
    expect(overdueOff.attention).toBe(0);
    updateNotificationPrefs('brandi',{quote_overdue:true});
    expect(repBadges('brandi',{now:TWO_DAYS}).attention).toBeGreaterThan(0);
    for(const q of [below,plain,changes])markQuoteRead(q.id,'rep');
  });

  it('drops accepted, declined and expired bell rows by their own switches',async()=>{
    const accepted=request(),declined=request(),expired=request();
    for(const q of [accepted,declined,expired])await sendQuote(q.id,{repId:'brandi',now:SENT});
    acceptQuote('wasatch',accepted.id,{revision:1,fulfillmentTime:'2026-09-25',customerPo:'7781',now:LATER});
    declineQuote('wasatch',declined.id,{revision:1,reason:'price_too_high',now:LATER});
    // A stand-in for an expiry the rep has not seen (as above).
    saveQuoteTransition(expired.id,{from:'sent',to:'sent',unreadForRep:true,at:SENT});
    const ours=[accepted.id,declined.id,expired.id];
    const kinds=()=>repBadges('brandi',{now:AFTER_EXPIRY}).bell.filter(b=>ours.includes(b.id)).map(b=>b.kind).sort();
    expect(kinds()).toEqual(['quote_accepted','quote_declined','quote_expired']);
    updateNotificationPrefs('brandi',{quote_accepted:false,quote_expired:false});
    expect(kinds()).toEqual(['quote_declined']);
    updateNotificationPrefs('brandi',{quote_accepted:true,quote_expired:true,quote_declined:false});
    expect(kinds()).toEqual(['quote_accepted','quote_expired']);
    updateNotificationPrefs('brandi',{quote_declined:true});
    for(const q of [accepted,declined,expired])markQuoteRead(q.id,'rep');
  });
});
