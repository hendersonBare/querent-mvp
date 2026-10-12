import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// Add to quote (plan U5; C_ST3): the quotes the signed-in rep can add an item to are their own drafts,
// the ones whose status still allows edits (Draft ready, Changes requested). A manager edits only their
// own quotes (decision 22), so other reps' drafts are not offered.
useSeededDatabase();

const {addToQuoteTargets}=await import('./add-to-quote');
const NOW='2026-09-23T18:00:00.000Z';

describe('addToQuoteTargets',()=>{
  it('lists the rep\'s own editable quotes, newest request first, with customer, status, lines and the draft total',async()=>{
    const brandi=await addToQuoteTargets('brandi',{now:NOW});
    // The seed's aging quotes (Q-24790) are dated from the reset time, so the order follows the clock.
    const {quotes}=await import('@/server/repository');
    const newestFirst=quotes({repId:'brandi',statuses:['ready_for_review','changes_requested']}).map(q=>q.quote_number);
    expect(brandi.map(t=>t.quote_number)).toEqual(newestFirst);
    expect([...newestFirst].sort()).toEqual(['Q-24790','Q-24817']);
    expect(brandi.find(t=>t.quote_number==='Q-24817')).toEqual({quote_number:'Q-24817',customer_name:'Wasatch Mechanical Contractors',status:'ready_for_review',line_count:4,total:1122.4});
    expect(brandi.find(t=>t.quote_number==='Q-24790')).toMatchObject({status:'changes_requested'});
  });

  it('offers a rep only their own drafts, never another rep\'s',async()=>{
    const mara=await addToQuoteTargets('mara',{now:NOW});
    expect(mara.length).toBeGreaterThan(0);
    expect(mara.map(t=>t.customer_name).every(name=>name==='Canyon Ridge Builders')).toBe(true);
    expect(mara.map(t=>t.quote_number)).not.toContain('Q-24817');
    expect(mara.every(t=>t.status==='ready_for_review'||t.status==='changes_requested')).toBe(true);
  });

  it('carries no cost or margin',async()=>{
    for(const target of await addToQuoteTargets('brandi',{now:NOW}))expect(Object.keys(target).filter(k=>/cost|margin/.test(k))).toEqual([]);
  });
});
