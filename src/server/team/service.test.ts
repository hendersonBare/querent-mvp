import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The Team dashboard end to end over the seeded database (v3 spec §5, §7; decisions 23–25; task D3):
// quotes made and moved through the real services, read back live through the repository.
useSeededDatabase();

const FROM='2027-03-01T07:00:00.000Z',TO='2027-03-08T07:00:00.000Z',NOW='2027-03-07T12:00:00.000Z';
const at=(day:number,hour:number)=>`2027-03-0${day}T${String(hour).padStart(2,'0')}:00:00.000Z`;
const params=(more:Record<string,string>={})=>new URLSearchParams({from:FROM,to:TO,...more});

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

describe('teamMetrics',()=>{
  it('serves every metric per selected rep and in the totals, with the Other notes and the filter options',async()=>{
    const {teamMetrics}=await import('./service');
    const {declined,moved}=await build();
    const result=await teamMetrics(params({reps:'mara,eli'}),{now:NOW});
    expect(result.window).toEqual({from:FROM,to:TO});
    expect(result.as_of).toBe(NOW);
    expect(result.rows.map(r=>[r.rep_id,r.created])).toEqual([['eli',1],['mara',2]]);
    const mara=result.rows.find(r=>r.rep_id==='mara')!;
    expect(mara.statuses).toMatchObject({declined:1,ready_for_review:1});
    expect(mara.declines.other).toBe(1);
    expect(mara.hours.to_send).toBeCloseTo(2);
    expect(mara.hours.customer_response).toBeCloseTo(24);
    expect(mara.value.quoted_cents).toBe(16000+10000);
    expect(mara.rates).toEqual({quote_to_order:0,unaccepted:0.5,decided_win:0});
    expect(result.rows.find(r=>r.rep_id==='eli')!.statuses.ready_for_review).toBe(1);
    expect(result.totals.created).toBe(3);
    expect(result.other_notes).toEqual([{quote_id:declined.id,quote_number:declined.quote_number,rep_id:'mara',rep_name:'Mara Jensen',note:'Bought them at the hardware store',declined_at:at(3,14)}]);
    expect(result.selected).toEqual({rep_ids:['eli','mara'],team:null});
    expect(result.options.reps.map(r=>r.id)).toEqual(['brandi','eli','mara','nora']);
    expect(result.options.teams).toEqual(['Inside Sales','Outside Sales']);
    expect(moved.id).toBeTruthy();
  });

  it('defaults to every active rep and narrows by team label',async()=>{
    const {teamMetrics}=await import('./service');
    expect((await teamMetrics(params(),{now:NOW})).rows.map(r=>r.rep_id)).toEqual(['brandi','eli','mara','nora']);
    const inside=await teamMetrics(params({team:'Inside Sales'}),{now:NOW});
    expect(inside.rows.map(r=>r.rep_id)).toEqual(['brandi','mara']);
    expect(inside.totals.created).toBe(2);
  });

  it('refuses a bad query with the reason',async()=>{
    const {teamMetrics,TeamQueryError}=await import('./service');
    await expect(teamMetrics(params({reps:'ghost'}),{now:NOW})).rejects.toThrow(TeamQueryError);
    await expect(teamMetrics(new URLSearchParams({from:TO,to:FROM}),{now:NOW})).rejects.toThrow('The range must end after it starts.');
  });
});
