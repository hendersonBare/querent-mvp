import {beforeAll,describe,expect,it} from 'vitest';
import {clearDemoBook,useSeededDatabase} from '@/server/repository/test-db';

// The leaderboard's cohort end to end over the seeded database (v3 spec §5, §7; decisions 23–25;
// tasks D3, U6): quotes made and moved through the real services, read back live through the
// repository, as GET /api/rep/analytics serves them. Moved here in U11 from the D3 Team dashboard's
// service test when its routes (GET /api/rep/team/metrics and .csv) were removed.
useSeededDatabase();
// The demo seed's book (task F1) is dated from the real clock: deleted, so only this file's quotes fall in its fixed window on any day.
beforeAll(clearDemoBook);

const FROM='2027-03-01T07:00:00.000Z',TO='2027-03-08T07:00:00.000Z',NOW='2027-03-07T12:00:00.000Z';
const at=(day:number,hour:number)=>`2027-03-0${day}T${String(hour).padStart(2,'0')}:00:00.000Z`;
const params=(more:Record<string,string>={})=>new URLSearchParams({from:FROM,to:TO,...more});
const manager={repId:'brandi',manager:true};

async function build(){
  const {createQuote}=await import('@/server/repository');
  const {sendQuote,declineQuote}=await import('@/server/quotes/service');
  const {moveQuotes}=await import('@/server/rep/reassign');
  const make=(day:number,price=80)=>createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',at:at(day,12),lines:[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:price,priceBasis:'custom'}]});
  // Mara sends one, Canyon Ridge declines it with an Other note.
  const declined=make(2);
  await sendQuote(declined.id,{repId:'mara',now:at(2,14)});
  declineQuote('canyon-ridge',declined.id,{revision:1,reason:'other',note:'Bought them at the hardware store',now:at(3,14)});
  // A draft Mara never sent: its live draft total counts as quoted.
  const draft=make(4,50);
  // Brandi moves a third to Eli: it counts under Eli now.
  const moved=make(5);
  moveQuotes('brandi',[moved.id],{id:'eli',name:'Eli Porter'},{now:at(5,13)});
  return {declined,draft,moved};
}

describe('the leaderboard cohort',()=>{
  it('serves every metric per picked rep and in the totals, with the Other notes',async()=>{
    const {analyticsPage}=await import('./service');
    const {declined,moved}=await build();
    const result=await analyticsPage(manager,params({reps:'mara,eli',breakdown:'rep'}),{now:NOW});
    expect(result.filter.window).toEqual({from:FROM,to:TO});
    const groups=result.groups;
    expect(groups.rows.map(r=>[r.key,r.created])).toEqual([['eli',1],['mara',2]]);
    const mara=groups.rows.find(r=>r.key==='mara')!;
    expect(mara.statuses).toMatchObject({declined:1,ready_for_review:1});
    expect(mara.declines.other).toBe(1);
    expect(mara.hours.to_send).toBeCloseTo(2);
    expect(mara.hours.customer_response).toBeCloseTo(24);
    expect(mara.value.quoted_cents).toBe(16000+10000);
    expect(mara.rates).toEqual({quote_to_order:0,unaccepted:0.5,decided_win:0});
    expect(groups.rows.find(r=>r.key==='eli')!.statuses.ready_for_review).toBe(1);
    expect(groups.totals.created).toBe(3);
    expect(groups.other_notes).toEqual([{quote_id:declined.id,quote_number:declined.quote_number,rep_id:'mara',rep_name:'Mara Jensen',customer_id:'canyon-ridge',customer_name:'Canyon Ridge Builders',note:'Bought them at the hardware store',declined_at:at(3,14)}]);
    expect(moved.id).toBeTruthy();
  });

  it('defaults to every active rep and narrows by team',async()=>{
    const {analyticsPage}=await import('./service');
    expect((await analyticsPage(manager,params(),{now:NOW})).groups.rows.map(r=>r.key)).toEqual(['brandi','eli','mara','nora']);
    const inside=await analyticsPage(manager,params({teams:'Inside Sales'}),{now:NOW});
    expect(inside.groups.rows.map(r=>r.key)).toEqual(['brandi','mara']);
    expect(inside.groups.totals.created).toBe(2);
  });
});
