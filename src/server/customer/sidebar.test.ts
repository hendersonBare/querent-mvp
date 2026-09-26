import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// The customer's two sidebars (spec §3, task 2.4): contacts on the left, quote buttons on the right.

const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal/i;
const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];

describe('customerContacts',()=>{
  it('puts the assigned rep first, then Customer Service, AR/Finance and will-call per branch',async()=>{
    const {customerContacts}=await import('./sidebar');
    const contacts=customerContacts('wasatch');
    expect(contacts.supplier).toBe('Herrick Industrial Supply');
    expect(contacts.rep).toMatchObject({name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'});
    expect(contacts.departments.map(d=>d.name)).toEqual(['Customer Service','Accounts Receivable / Finance']);
    expect(contacts.departments[0]).toMatchObject({phone:'(801) 555-0110',email:'customerservice@herrickindustrial.com'});
    expect(contacts.willCall.map(b=>[b.code,b.name,b.phone])).toEqual([
      ['SLC','Salt Lake City','(801) 555-0120'],['Ogden','Ogden','(801) 555-0130'],['Provo','Provo','(801) 555-0140'],
    ]);
    expect(contacts.willCall[0].hours).toMatch(/Mon–Fri/);
  });

  it('shows no rep for a customer without one, and never carries internal fields',async()=>{
    const {customerContacts}=await import('./sidebar');
    expect(customerContacts('nobody').rep).toBeNull();
    expect(keys(customerContacts('wasatch')).filter(k=>FORBIDDEN.test(k))).toEqual([]);
  });
});

describe('customerQuoteList',()=>{
  const NOW='2026-09-23T18:00:00.000Z';

  it("lists the customer's quotes newest first, with no total before the rep's first send",async()=>{
    const {customerQuoteList}=await import('./sidebar');
    const list=customerQuoteList('wasatch',NOW);
    expect(list.length).toBeGreaterThan(20);
    expect(list[0]).toMatchObject({quote_number:'Q-24817',status:'ready_for_review',total:null,sent_at:null});
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
