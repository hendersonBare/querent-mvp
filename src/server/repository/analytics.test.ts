import {describe,expect,it} from 'vitest';
import {analytics,quoteFacts,quoteLineFacts,topRequestedItems} from './analytics';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

describe('query analytics',()=>{
  it('counts seeded chat questions by information category',()=>{
    const wasatch=analytics('wasatch');
    expect(wasatch.total_queries).toBe(40);
    expect(wasatch.categories.map(c=>c.category)).toEqual(['items_stock','pricing','orders_quotes','account']);
    expect(wasatch.categories.every(c=>c.count>0&&c.rep_name==='Brandi Gallegos')).toBe(true);
    expect(Number(wasatch.hours_saved)).toBeGreaterThan(0);
    expect(analytics('great-basin').total_queries).toBe(0);
    expect(analytics(null).total_queries).toBe(40);
    expect(analytics(null).categories[0].rep_name).toBe('Multiple reps');
  });
});

describe('quote analytics facts',()=>{
  it('returns one fact per quote with send and response times',()=>{
    const facts=quoteFacts('wasatch');
    expect(facts).toHaveLength(25);
    expect(facts.find(f=>f.quote_number==='Q-24816')).toEqual({id:'q-24816',quote_number:'Q-24816',customer_id:'wasatch',rep_id:'brandi',status:'accepted',is_sample:false,
      requested_at:'2026-09-07T15:20:00.000Z',first_sent_at:'2026-09-07T16:20:00.000Z',last_sent_at:'2026-09-07T16:20:00.000Z',responded_at:'2026-09-09T16:05:00.000Z',revisions:1,sent_total:655.25});
    expect(facts.at(-1)).toMatchObject({quote_number:'Q-24817',status:'ready_for_review',is_sample:true,first_sent_at:null,revisions:0,sent_total:null});
    expect(facts.filter(f=>f.status==='accepted')).toHaveLength(17);
    expect(quoteFacts(null)).toHaveLength(25);
    expect(quoteFacts('great-basin')).toEqual([]);
  });

  it('returns each line with its cost and the quote rep\'s floor for the category',()=>{
    const sample=quoteLineFacts('wasatch').filter(l=>l.quote_id==='q-24817');
    expect(sample.map(l=>[l.sku,l.unit_price,l.unit_cost,l.margin_floor])).toEqual([['HCS-12-13-2G8',31.5,21.4,0.2],['CW-45-045-T1',36,24.1,0.25],['GLV-N8-L-1000',79,58,0.3],['RS-2-27-JH',22.95,14.2,0.2]]);
    expect(sample[0]).toMatchObject({status:'ready_for_review',category_id:'fasteners',qty:10,suggested_price:31.5,customer_price:30.95,added_by:'querent'});
    expect(quoteLineFacts('great-basin')).toEqual([]);
  });

  it('ranks the most requested items',()=>{
    expect(topRequestedItems('wasatch',3)).toEqual([
      {item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',quote_count:6,total_qty:60},
      {item_id:'CW-45-045-T1',sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',quote_count:6,total_qty:44},
      {item_id:'HN-12-13-G8',sku:'HN-12-13-G8',description:'Hex nut 1/2-13, Grade 8, yellow zinc',quote_count:5,total_qty:25},
    ]);
    expect(topRequestedItems(null)).toHaveLength(10);
    expect(topRequestedItems('great-basin')).toEqual([]);
  });
});
