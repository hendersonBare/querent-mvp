import {describe,expect,it} from 'vitest';
import {analytics,questionOutcomes,quoteFacts,quoteLineFacts,sentLineFacts,topRequestedItems} from './analytics';
import {appendLog,createConversation} from './chat';
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

  it('takes a list of customers (a rep\'s book of business)',()=>{
    const brandis=analytics(['wasatch','great-basin']);
    expect(brandis.total_queries).toBe(40);
    expect(brandis.minutes_saved).toBe(analytics('wasatch').minutes_saved);
    expect(brandis.categories.every(c=>c.rep_name==='Brandi Gallegos')).toBe(true);
    const nobody=analytics([]);
    expect(nobody).toMatchObject({total_queries:0,minutes_saved:0,hours_saved:'0.0'});
    expect(nobody.categories.map(c=>[c.count,c.rep_name])).toEqual([[0,'—'],[0,'—'],[0,'—'],[0,'—']]);
  });

  it('counts chat questions by outcome',()=>{
    // 12 seeded questions repeat over 40 logs; the 10th ("6 in Type 27?") is a no-match answer.
    expect(questionOutcomes('wasatch')).toEqual({answered:37,no_rows:3});
    expect(questionOutcomes(['wasatch','great-basin'])).toEqual({answered:37,no_rows:3});
    expect(questionOutcomes('great-basin')).toEqual({});
    expect(questionOutcomes([])).toEqual({});
  });

  it('leaves Request quote out: it is logged as a chat turn (tool call request_quote), but asks nothing (cleanup 6)',()=>{
    const before={queries:analytics('wasatch'),outcomes:questionOutcomes('wasatch')};
    createConversation({id:'conv-analytics',customerId:'wasatch'});
    const log=(question:string,toolCalls:string[],handled:('items_stock')[]=[])=>expect(appendLog({customerId:'wasatch',conversationId:'conv-analytics',question,
      categories:handled,handled,toolCalls,rowCount:2,latency:0,outcome:'answered',answer:'Sent to Brandi for review.'})).toBe(true);
    log('Request quote: 10 × HCS-12-13-2G8 (pickup at SLC).',['request_quote']);
    log('Request quote: 2 × FD-45-60Z (pickup at SLC).',['search_items','request_quote'],['items_stock']);
    expect(analytics('wasatch')).toEqual(before.queries);
    expect(questionOutcomes('wasatch')).toEqual(before.outcomes);
    // A real question in the same chat still counts.
    log('Do you have flap discs in stock?',['get_stock'],['items_stock']);
    expect(analytics('wasatch').total_queries).toBe(before.queries.total_queries+1);
    expect(questionOutcomes('wasatch')).toEqual({...before.outcomes,answered:before.outcomes.answered+1});
  });
});

describe('quote analytics facts',()=>{
  it('returns one fact per quote with send and response times',()=>{
    const facts=quoteFacts('wasatch');
    expect(facts).toHaveLength(28); // 24 history, the sample and the three aging quotes (task A2)
    expect(facts.find(f=>f.quote_number==='Q-24816')).toEqual({id:'q-24816',quote_number:'Q-24816',customer_id:'wasatch',rep_id:'brandi',status:'accepted',is_sample:false,
      requested_at:'2026-09-07T15:20:00.000Z',first_sent_at:'2026-09-07T16:20:00.000Z',last_sent_at:'2026-09-07T16:20:00.000Z',responded_at:'2026-09-09T16:05:00.000Z',
      valid_until:'2026-09-21',revisions:1,sent_total:655.25});
    expect(facts.find(f=>f.quote_number==='Q-24817')).toMatchObject({quote_number:'Q-24817',status:'ready_for_review',is_sample:true,first_sent_at:null,valid_until:null,revisions:0,sent_total:null});
    expect(facts.filter(f=>f.status==='accepted')).toHaveLength(17);
    // All customers: Wasatch's and the demo book's 47 (task F1).
    expect(quoteFacts(null)).toHaveLength(75);
    expect(quoteFacts(null).filter(f=>f.customer_id==='wasatch')).toEqual(facts);
    expect(quoteFacts(['great-basin','wasatch'])).toEqual(facts);
    expect(quoteFacts('great-basin')).toEqual([]);
    expect(quoteFacts([])).toEqual([]);
  });

  it('narrows to the quotes of the reps given (the manager\'s rep and team filter, plan U6)',()=>{
    const all=quoteFacts(null);
    expect(quoteFacts({customers:null,repId:null,repIds:['mara','eli']})).toEqual(all.filter(f=>f.rep_id==='mara'||f.rep_id==='eli'));
    expect(quoteFacts({customers:null,repId:null,repIds:['mara']})).toEqual(quoteFacts({customers:null,repId:'mara'}));
    expect(quoteFacts({customers:null,repId:null,repIds:[]})).toEqual([]);
    expect(quoteFacts({customers:null,repId:null,repIds:null})).toEqual(all);
    expect(topRequestedItems({customers:null,repId:null,repIds:['nora']})).toEqual([]);
  });

  it('returns each line with its cost, Querent\'s suggestion and the quote rep\'s floor for the category',()=>{
    const sample=quoteLineFacts('wasatch').filter(l=>l.quote_id==='q-24817');
    expect(sample.map(l=>[l.sku,l.unit_price,l.unit_cost,l.margin_floor])).toEqual([['HCS-12-13-2G8',31.5,21.4,0.2],['CW-45-045-T1',36,24.1,0.25],['GLV-N8-L-1000',79,58,0.3],['RS-2-27-JH',22.95,14.2,0.2]]);
    expect(sample[0]).toMatchObject({status:'ready_for_review',category_id:'fasteners',qty:10,suggested_price:31.5,suggested_basis:'last_paid',customer_price:30.95,added_by:'querent'});
    expect(sample[1]).toMatchObject({suggested_basis:'contract',price_basis:'contract'});
    expect(quoteLineFacts(['wasatch'])).toEqual(quoteLineFacts('wasatch'));
    expect(quoteLineFacts('great-basin')).toEqual([]);
    expect(quoteLineFacts([])).toEqual([]);
  });

  it('returns the lines of each quote\'s last sent revision, as the customer saw them, with cost and the rep\'s floor',()=>{
    const sent=sentLineFacts('wasatch');
    expect(sent).toHaveLength(61); // the 24 sent history quotes and the 3 aging ones (5 lines); the draft sample Q-24817 has no revision
    expect(sent.some(l=>l.quote_id==='q-24817')).toBe(false);
    expect(sent.filter(l=>l.quote_id==='q-24816')).toEqual([
      {quote_id:'q-24816',revision:1,item_id:'CW-45-045-T1',sku:'CW-45-045-T1',category_id:'abrasives',qty:4,unit_price:36,unit_cost:24.1,margin_floor:0.25},
      {quote_id:'q-24816',revision:1,item_id:'GLV-N8-L-1000',sku:'GLV-N8-L-1000',category_id:'safety',qty:4,unit_price:79,unit_cost:58,margin_floor:0.3},
      {quote_id:'q-24816',revision:1,item_id:'FD-45-60Z',sku:'FD-45-60Z',category_id:'abrasives',qty:3,unit_price:44.25,unit_cost:expect.any(Number),margin_floor:0.25},
    ]);
    expect(sentLineFacts(['wasatch','great-basin'])).toEqual(sent);
    expect(sentLineFacts('great-basin')).toEqual([]);
    expect(sentLineFacts([])).toEqual([]);
  });

  it('ranks the most requested items',()=>{
    expect(topRequestedItems('wasatch',3)).toEqual([
      {item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',quote_count:7,total_qty:64},
      {item_id:'CW-45-045-T1',sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',quote_count:6,total_qty:44},
      {item_id:'HN-12-13-G8',sku:'HN-12-13-G8',description:'Hex nut 1/2-13, Grade 8, yellow zinc',quote_count:5,total_qty:25},
    ]);
    expect(topRequestedItems(null)).toHaveLength(10);
    expect(topRequestedItems(['wasatch','great-basin'],3)).toEqual(topRequestedItems('wasatch',3));
    expect(topRequestedItems('great-basin')).toEqual([]);
    expect(topRequestedItems([])).toEqual([]);
  });
});
