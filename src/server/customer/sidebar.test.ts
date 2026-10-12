import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// The customer's rep (the My rep sheet, plan U10) and quote list (spec §3, task 2.4).

const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal/i;
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];

describe('customerRepContact',()=>{
  it("gives the assigned rep only, for the My rep sheet (C_CVL3; Appendix D: departments stay with the chat's answers)",async()=>{
    const {customerRepContact}=await import('./sidebar');
    // Plan U9: what the rep set on Settings > Profile, their title and their picture's link; no internal id.
    expect(customerRepContact('wasatch')).toEqual({rep:{name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com',picture_url:null}});
  });

  it('shows no rep for a customer without one, and never carries internal fields',async()=>{
    const {customerRepContact}=await import('./sidebar');
    expect(customerRepContact('nobody')).toEqual({rep:null});
    expect(keys(customerRepContact('wasatch')).filter(k=>FORBIDDEN.test(k))).toEqual([]);
  });
});

describe('customerQuoteList',()=>{
  const NOW='2026-09-23T18:00:00.000Z';

  it("lists the customer's quotes newest first, with no total before the rep's first send",async()=>{
    const {customerQuoteList}=await import('./sidebar');
    const list=customerQuoteList('wasatch',NOW);
    expect(list.length).toBeGreaterThan(20);
    // The seed's aging quotes (task A2) are dated from the reset time, so they are the newest; the sample comes next.
    expect(list.slice(0,4).map(q=>q.quote_number)).toEqual(['Q-24791','Q-24790','Q-24789','Q-24817']);
    expect(list[3]).toMatchObject({quote_number:'Q-24817',status:'ready_for_review',total:null,sent_at:null});
    const requested=list.map(q=>q.requested_at);
    expect(requested).toEqual([...requested].sort().reverse());
    expect(list.filter(q=>q.status!=='ready_for_review').every(q=>typeof q.total==='number'&&q.total>0)).toBe(true);
    expect(keys(list).filter(k=>FORBIDDEN.test(k))).toEqual([]);
  });

  it('shows a sent quote past valid_until as expired, without storing the expiry',async()=>{
    const {customerQuoteList}=await import('./sidebar');
    const {saveQuoteTransition,quote}=await import('@/server/repository');
    expect(saveQuoteTransition('q-24817',{from:'ready_for_review',to:'sent',revision:1,sentAt:'2026-09-01T16:00:00.000Z',validUntil:'2026-09-15'})).toBe(true);
    try{
      const status=(now:string)=>customerQuoteList('wasatch',now).find(q=>q.quote_number==='Q-24817')!.status;
      expect(status('2026-09-15T23:59:59.000Z')).toBe('sent');
      expect(status('2026-09-16T00:00:00.000Z')).toBe('expired');
      expect(status(NOW)).toBe('expired');
      expect(quote('q-24817')!.status).toBe('sent');
    }finally{
      saveQuoteTransition('q-24817',{from:'sent',to:'ready_for_review',revision:0,sentAt:null,validUntil:null});
    }
  });

  it("is empty for a customer with no quotes and never lists another customer's",async()=>{
    const {customerQuoteList}=await import('./sidebar');
    expect(customerQuoteList('great-basin',NOW)).toEqual([]);
    expect(customerQuoteList('nobody',NOW)).toEqual([]);
  });
});
