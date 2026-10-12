import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// The customer's notification bell (plan U10; decision 41; new-ui-implementation-prompt Part 1 §10,
// Appendix C, Appendix H): notifications derived from quote activity (sent, revised after changes
// were requested, expired) and order status (shipped), newest first, one per quote (its latest
// news), with a read state per customer.

const SAMPLE='q-24817';
const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal|basis/i;
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];
const usd=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
const minutesAgo=(now:string,m:number)=>new Date(Date.parse(now)-m*60_000).toISOString();
const ALL={limit:500};

const load=async()=>({...(await import('./notifications')),...(await import('@/server/quotes/service')),...(await import('@/server/repository')),...(await import('@/server/repository/test-db'))});

/** Brandi sends the sample quote `minutes` ago. */
async function sendSample(now:string,minutes=1){
  const {resetSample,sendQuote,quote}=await load();
  resetSample();
  await sendQuote(SAMPLE,{repId:'brandi',now:minutesAgo(now,minutes)});
  return quote(SAMPLE)!;
}

describe('customerNotifications',()=>{
  it('a sent quote creates one: ready to review, with the total and who sent it when, unread, newest first',async()=>{
    const {customerNotifications,quoteRevision}=await load();
    const now=new Date().toISOString();
    await sendSample(now);
    const total=quoteRevision(SAMPLE,1)!.total;
    const {items,unread}=customerNotifications('wasatch',{now});
    expect(items[0]).toEqual({id:'quote:q-24817:rev:1',kind:'quote_ready',title:'Quote Q-24817 is ready to review',body:`${usd(total)}. Brandi sent it today.`,
      at:minutesAgo(now,1),day_only:false,read:false,quote:{id:SAMPLE,quote_number:'Q-24817'}});
    expect(unread).toBe(items.filter(n=>!n.read).length);
    expect(unread).toBeGreaterThan(0);
    const at=items.map(n=>n.at);
    expect(at).toEqual([...at].sort().reverse());
  });

  it('says yesterday, or the day, for an older send',async()=>{
    const {customerNotifications}=await load();
    const now='2026-09-23T18:00:00.000Z';
    await sendSample(now,60*24);
    expect(customerNotifications('wasatch',{now,...ALL}).items.find(n=>n.quote?.id===SAMPLE)!.body).toMatch(/\. Brandi sent it yesterday\.$/);
    await sendSample(now,60*24*5);
    expect(customerNotifications('wasatch',{now,...ALL}).items.find(n=>n.quote?.id===SAMPLE)!.body).toMatch(/\. Brandi sent it on Sep 18\.$/);
  });

  it('a quote revised after Dana asked for changes creates one: Brandi updated it, revision 2, replacing the first',async()=>{
    const {customerNotifications,requestChanges,sendQuote}=await load();
    const now=new Date().toISOString();
    await sendSample(now,30);
    requestChanges('wasatch',SAMPLE,{revision:1,note:'Make it 12 boxes',now:minutesAgo(now,20)});
    await sendQuote(SAMPLE,{repId:'brandi',now:minutesAgo(now,2)});
    const mine=customerNotifications('wasatch',{now,...ALL}).items.filter(n=>n.quote?.id===SAMPLE);
    expect(mine).toEqual([{id:'quote:q-24817:rev:2',kind:'quote_updated',title:'Brandi updated Q-24817',body:'The changes you asked for are in. Revision 2.',
      at:minutesAgo(now,2),day_only:false,read:false,quote:{id:SAMPLE,quote_number:'Q-24817'}}]);
  });

  it('an expired quote creates one, from the moment valid-until passed, replacing its ready notice',async()=>{
    const {customerNotifications,quote}=await load();
    const now='2026-09-23T18:00:00.000Z';
    await sendSample(now,60*24*20);
    const validUntil=quote(SAMPLE)!.valid_until!;
    const mine=customerNotifications('wasatch',{now,...ALL}).items.filter(n=>n.quote?.id===SAMPLE);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({id:'quote:q-24817:expired',kind:'quote_expired',title:'Quote Q-24817 expired',read:false,day_only:false});
    expect(mine[0].body).toMatch(/^It was valid until [A-Z][a-z]{2} \d{1,2}\.$/);
    expect(mine[0].at).toBe(new Date(Date.parse(`${validUntil}T00:00:00.000Z`)+86_400_000).toISOString());
  });

  it('a shipped order creates one, with how and from where, and the quote it came from',async()=>{
    const {customerNotifications,setOrderStatusFixture}=await load();
    const now='2026-09-23T18:00:00.000Z';
    // SO-51222 (from Q-24814, delivery from Provo) closed in the seed: shipping it adds a notice.
    expect(customerNotifications('wasatch',{now,...ALL}).items.some(n=>n.id==='order:so-51222:shipped')).toBe(false);
    await setOrderStatusFixture('so-51222','shipped','2026-09-22');
    try{
      expect(customerNotifications('wasatch',{now,...ALL}).items.find(n=>n.id==='order:so-51222:shipped')).toEqual({id:'order:so-51222:shipped',kind:'order_shipped',
        title:'Order SO-51222 has shipped',body:'Delivery, Provo. From quote Q-24814.',at:'2026-09-22T00:00:00.000Z',day_only:true,read:false,quote:null});
      await setOrderStatusFixture('so-51222','shipped','2026-09-22',{fulfillment:'will_call',quoteId:null});
      expect(customerNotifications('wasatch',{now,...ALL}).items.find(n=>n.id==='order:so-51222:shipped')!.body).toBe('Will call, Provo.');
    }finally{
      await setOrderStatusFixture('so-51222','closed','2026-08-27',{fulfillment:'delivery',quoteId:'q-24814'});
    }
    // A closed order is not news.
    expect(customerNotifications('wasatch',{now,...ALL}).items.some(n=>n.id==='order:so-51222:shipped')).toBe(false);
  });

  it('shows the newest ten by default, and unread counts only those',async()=>{
    const {customerNotifications,NOTIFICATION_LIMIT}=await load();
    const now='2026-09-23T18:00:00.000Z';
    expect(NOTIFICATION_LIMIT).toBe(10);
    const all=customerNotifications('wasatch',{now,...ALL}).items;
    expect(all.length).toBeGreaterThan(NOTIFICATION_LIMIT);
    const shown=customerNotifications('wasatch',{now});
    expect(shown.items).toEqual(all.slice(0,NOTIFICATION_LIMIT));
    expect(shown.unread).toBe(shown.items.filter(n=>!n.read).length);
    // One per quote: its latest news.
    const quotes=all.flatMap(n=>n.quote?[n.quote.id]:[]);
    expect(new Set(quotes).size).toBe(quotes.length);
  });

  it('counts a quote Dana answered or opened after the news as read',async()=>{
    const {customerNotifications,acceptQuote,markCustomerViewed}=await load();
    const now=new Date().toISOString();
    const notice=()=>customerNotifications('wasatch',{now,...ALL}).items.find(n=>n.quote?.id===SAMPLE)!;
    await sendSample(now,10);
    expect(notice().read).toBe(false);
    markCustomerViewed('wasatch',SAMPLE,minutesAgo(now,5));
    expect(notice().read).toBe(true);
    await sendSample(now,10);
    expect(notice().read).toBe(false);
    const day=new Date(Date.now()+3*86_400_000);
    while([0,6].includes(day.getUTCDay()))day.setUTCDate(day.getUTCDate()+1);
    acceptQuote('wasatch',SAMPLE,{revision:1,fulfillmentTime:`${day.toISOString().slice(0,10)}T16:00:00.000Z`,customerPo:'7781',now:minutesAgo(now,3)});
    expect(notice().read).toBe(true);
  });

  it('never carries internal fields, and lists nothing for a customer with no news or no account',async()=>{
    const {customerNotifications}=await load();
    const now='2026-09-23T18:00:00.000Z';
    expect(keys(customerNotifications('wasatch',{now,...ALL})).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    expect(customerNotifications('great-basin',{now})).toEqual({unread:0,items:[]});
    expect(customerNotifications('nobody',{now})).toEqual({unread:0,items:[]});
  });
});

describe('markNotificationsRead',()=>{
  it('marks the named ones read for this customer only, and the unread count follows',async()=>{
    const {customerNotifications,markNotificationsRead}=await load();
    const now=new Date().toISOString();
    await sendSample(now);
    const before=customerNotifications('wasatch',{now});
    const target=before.items.find(n=>!n.read)!;
    const after=markNotificationsRead('wasatch',{ids:[target.id]},{now});
    expect(after.items.find(n=>n.id===target.id)!.read).toBe(true);
    expect(after.unread).toBe(before.unread-1);
    expect(customerNotifications('wasatch',{now}).unread).toBe(before.unread-1);
    // Read once is read: marking it again changes nothing.
    expect(markNotificationsRead('wasatch',{ids:[target.id]},{now}).unread).toBe(before.unread-1);
  });

  it('ignores ids that are not this customer\'s notifications',async()=>{
    const {customerNotifications,markNotificationsRead,notificationReads}=await load();
    const now='2026-09-23T18:00:00.000Z';
    const before=customerNotifications('wasatch',{now}).unread;
    expect(markNotificationsRead('wasatch',{ids:['quote:q-99999:rev:1','order:nope:shipped','<script>']},{now}).unread).toBe(before);
    expect(notificationReads('wasatch').filter(id=>id.includes('99999')||id.includes('nope')||id.includes('<'))).toEqual([]);
    // Great Basin has no notifications: marking Wasatch's ids for it stores nothing.
    const wasatch=customerNotifications('wasatch',{now}).items.map(n=>n.id);
    markNotificationsRead('great-basin',{ids:wasatch},{now});
    expect(notificationReads('great-basin')).toEqual([]);
  });

  it('Mark all read marks every notification shown',async()=>{
    const {customerNotifications,markNotificationsRead}=await load();
    const now=new Date().toISOString();
    await sendSample(now);
    expect(customerNotifications('wasatch',{now}).unread).toBeGreaterThan(0);
    const after=markNotificationsRead('wasatch',{all:true},{now});
    expect(after.unread).toBe(0);
    expect(after.items.every(n=>n.read)).toBe(true);
    // A new revision is news again.
    const {requestChanges,sendQuote}=await load();
    requestChanges('wasatch',SAMPLE,{revision:1,note:'Make it 12 boxes',now:minutesAgo(now,0.5)});
    await sendQuote(SAMPLE,{repId:'brandi',now});
    expect(customerNotifications('wasatch',{now}).unread).toBe(1);
  });
});
