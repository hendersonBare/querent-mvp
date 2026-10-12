import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';
import {AnalyticsQueryError,analyticsPage,repAnalytics} from './service';

// The Analytics page's data with its filter (plan U6; Part 1 section 6; Appendix D): reps, teams, a
// customer, a breakdown and a period, over the seeded database. The demo book (task F1) is dated from
// the real clock, so these read the default window (the last 30 days) at the real now.
useSeededDatabase();

const manager={repId:'brandi',manager:true};
const rep=(repId:string)=>({repId,manager:false});
const page=(reader:{repId:string;manager:boolean},query='')=>analyticsPage(reader,new URLSearchParams(query));

describe('the manager\'s filter',()=>{
  it('reads the whole organization by default, with a row per active rep and the filter options',async()=>{
    const data=await page(manager);
    expect(data.filter).toMatchObject({rep_ids:[],teams:[],customer_id:null,breakdown:'org'});
    expect(data.groups.dimension).toBe('rep');
    expect(data.groups.rows.map(r=>r.key)).toEqual(['brandi','eli','mara','nora']);
    expect(data.groups.rows.find(r=>r.key==='mara')!.created).toBe(13);
    expect(data.groups.rows.find(r=>r.key==='eli')!.created).toBe(20);
    expect(data.options.reps.map(r=>r.id)).toEqual(['brandi','eli','mara','nora']);
    expect(data.options.teams).toEqual(['Inside Sales','Outside Sales']);
    expect(data.options.customers.map(c=>c.id)).toEqual(['canyon-ridge','great-basin','uinta-facility','utah-valley-electric','wasatch','weber-basin']);
    // The overview is every rep's quotes, as before.
    expect(data.turnaround).toEqual(repAnalytics('brandi',{manager:true}).turnaround);
  });

  it('narrows every number to the picked reps: their own quotes, and their customers\' questions',async()=>{
    const data=await page(manager,'reps=mara');
    expect(data.filter.rep_ids).toEqual(['mara']);
    const own=repAnalytics('mara');
    expect(data.turnaround).toEqual(own.turnaround);
    expect(data.win_rate).toEqual(own.win_rate);
    expect(data.scope.customer_ids).toEqual(['canyon-ridge']);
    expect(data.groups.rows.map(r=>r.key)).toEqual(['mara']);
    expect(data.groups.totals.created).toBe(13);
  });

  it('counts a team\'s members, alongside any reps picked',async()=>{
    const data=await page(manager,'teams=Inside%20Sales&reps=nora');
    expect(data.groups.rows.map(r=>r.key)).toEqual(['brandi','mara','nora']);
    expect(data.scope.customer_ids).toEqual(['canyon-ridge','great-basin','uinta-facility','wasatch']);
  });

  it('breaks the numbers down by team or customer, with the same totals',async()=>{
    const byRep=await page(manager);
    const byTeam=await page(manager,'breakdown=team');
    expect(byTeam.groups.dimension).toBe('team');
    expect(byTeam.groups.rows.map(r=>[r.name,r.rep_ids])).toEqual([['Inside Sales',['brandi','mara']],['Outside Sales',['eli','nora']]]);
    expect(byTeam.groups.rows.find(r=>r.name==='Outside Sales')!.created).toBe(20);
    expect(byTeam.groups.totals).toEqual(byRep.groups.totals);
    const byCustomer=await page(manager,'breakdown=customer');
    expect(byCustomer.groups.dimension).toBe('customer');
    expect(byCustomer.groups.rows.map(r=>r.customer_id)).toEqual(byRep.options.customers.map(c=>c.id));
    expect(byCustomer.groups.rows.reduce((sum,r)=>sum+r.created,0)).toBe(byRep.groups.totals.created);
    expect(byCustomer.groups.totals).toEqual(byRep.groups.totals);
  });

  it('narrows to one customer: the overview, the questions and the cohort',async()=>{
    const data=await page(manager,'customer=canyon-ridge&breakdown=customer');
    expect(data.scope.customer?.id).toBe('canyon-ridge');
    expect(data.groups.rows.map(r=>r.customer_id)).toEqual(['canyon-ridge']);
    expect(data.groups.totals.created).toBe(data.groups.rows[0].created);
    expect(data.groups.other_notes.every(n=>n.customer_id==='canyon-ridge')).toBe(true);
  });

  it('refuses a bad filter with the reason',async()=>{
    await expect(page(manager,'reps=ghost')).rejects.toThrow(new AnalyticsQueryError('Unknown rep: ghost.'));
    await expect(page(manager,'breakdown=region')).rejects.toBeInstanceOf(AnalyticsQueryError);
  });
});

describe('a rep: own data only (Appendix B), whatever the query asks',()=>{
  it('gets their own quotes and customers, one row, no other rep or team to pick',async()=>{
    const plain=await page(rep('mara'));
    for(const query of ['reps=eli','reps=eli,nora&teams=Outside%20Sales&breakdown=team','breakdown=customer']){
      const asked=await page(rep('mara'),query);
      expect(asked.groups,query).toEqual(plain.groups);
      expect(asked.turnaround,query).toEqual(plain.turnaround);
      expect(asked.scope,query).toEqual(plain.scope);
    }
    expect(plain.groups.dimension).toBe('rep');
    expect(plain.groups.rows.map(r=>r.key)).toEqual(['mara']);
    expect(plain.groups.rows[0].created).toBe(13);
    expect(plain.options).toEqual({reps:[],teams:[],customers:[expect.objectContaining({id:'canyon-ridge'})]});
  });

  it('ignores another rep\'s customer, like an unknown one',async()=>{
    const data=await page(rep('mara'),'customer=wasatch');
    expect(data.scope.customer).toBeNull();
    expect(data.filter.customer_id).toBeNull();
    expect(data.groups).toEqual((await page(rep('mara'))).groups);
  });
});
