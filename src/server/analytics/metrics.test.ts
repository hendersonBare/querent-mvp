import {describe,expect,it} from 'vitest';
import type {ProductCategory,QuoteFact,QuoteLineFact} from '@/domain';
import {
  MINUTES_SAVED_PER_QUOTE,extraGp,hoursSaved,marginVsFloor,median,questionsAnswered,quotedVsAccepted,turnaround,weekStart,weeklyTrend,winRateCard,
} from './metrics';

// The Analytics stat cards and trends (spec §4, task 6.2) on small hand-made facts. The same
// metrics against the seed are in ./service.test.ts.

const NOW='2026-09-23T18:00:00.000Z';
let n=0;
function fact(overrides:Partial<QuoteFact>={}):QuoteFact{
  n++;
  return {id:`q-${n}`,quote_number:`Q-${n}`,customer_id:'wasatch',rep_id:'brandi',status:'accepted',is_sample:false,requested_at:'2026-09-01T15:00:00.000Z',
    first_sent_at:'2026-09-01T16:00:00.000Z',last_sent_at:'2026-09-01T16:00:00.000Z',responded_at:null,valid_until:'2026-09-15',revisions:1,sent_total:100,...overrides};
}
const draft=(overrides:Partial<QuoteFact>={})=>fact({status:'ready_for_review',first_sent_at:null,last_sent_at:null,valid_until:null,revisions:0,sent_total:null,...overrides});
function line(quoteId:string,overrides:Partial<QuoteLineFact>={}):QuoteLineFact{
  return {quote_id:quoteId,status:'accepted',item_id:'HCS',sku:'HCS',category_id:'fasteners',qty:10,unit_price:31.5,price_basis:'last_paid',suggested_price:31.5,suggested_basis:'last_paid',
    customer_price:30.95,unit_cost:21.4,margin_floor:0.2,added_by:'querent',...overrides};
}

describe('median',()=>{
  it('is the middle value, or the mean of the two middle values, and null for nothing',()=>{
    expect(median([5,1,3])).toBe(3);
    expect(median([95,90,35,260])).toBe(92.5);
    expect(median([7])).toBe(7);
    expect(median([])).toBeNull();
  });
});

describe('median time from request to sent',()=>{
  it('uses the first send of each sent quote and skips drafts',()=>{
    const quotes=[
      fact({requested_at:'2026-09-01T15:00:00.000Z',first_sent_at:'2026-09-01T15:30:00.000Z'}),
      fact({requested_at:'2026-09-02T15:00:00.000Z',first_sent_at:'2026-09-02T17:00:00.000Z',last_sent_at:'2026-09-05T17:00:00.000Z',revisions:2}),
      fact({requested_at:'2026-09-03T15:00:00.000Z',first_sent_at:'2026-09-03T16:00:00.000Z'}),
      draft(),
    ];
    expect(turnaround(quotes)).toEqual({median_minutes:60,quotes:3,fastest_minutes:30,slowest_minutes:120});
  });

  it('is empty with no sent quote',()=>{
    expect(turnaround([draft()])).toEqual({median_minutes:null,quotes:0,fastest_minutes:null,slowest_minutes:null});
    expect(turnaround([])).toEqual({median_minutes:null,quotes:0,fastest_minutes:null,slowest_minutes:null});
  });
});

describe('win rate (task 1.5 carry-forward)',()=>{
  it('counts accepted as won; expired, and sent past valid_until, as lost; everything else as open',()=>{
    const quotes=[
      fact({status:'accepted'}),fact({status:'accepted'}),fact({status:'expired'}),
      fact({status:'sent',valid_until:'2026-09-20'}), // overdue: lost even before the expiry sweep stores it
      fact({status:'sent',valid_until:'2026-09-23'}), // still valid through today: open
      fact({status:'changes_requested'}),draft(),
    ];
    expect(winRateCard(quotes,NOW)).toEqual({rate:0.5,won:2,lost:2,open:3});
  });

  it('is null with nothing decided',()=>{
    expect(winRateCard([draft()],NOW)).toEqual({rate:null,won:0,lost:0,open:1});
    expect(winRateCard([],NOW)).toEqual({rate:null,won:0,lost:0,open:0});
  });
});

describe('$ quoted vs $ accepted',()=>{
  it('sums the last sent revision totals of every sent quote, and of the accepted ones',()=>{
    const quotes=[fact({status:'accepted',sent_total:655.25}),fact({status:'accepted',sent_total:100.1}),fact({status:'expired',sent_total:244.65}),fact({status:'sent',valid_until:'2026-10-01',sent_total:0.2}),draft()];
    expect(quotedVsAccepted(quotes)).toEqual({quoted:1000.2,accepted:755.35,quoted_count:4,accepted_count:2,share:755.35/1000.2});
  });

  it('is zero with nothing sent',()=>{
    expect(quotedVsAccepted([draft()])).toEqual({quoted:0,accepted:0,quoted_count:0,accepted_count:0,share:null});
  });
});

describe('hours saved',()=>{
  it('is a fixed 20 minutes per quote sent, each quote once however many revisions',()=>{
    expect(MINUTES_SAVED_PER_QUOTE).toBe(20);
    expect(hoursSaved([fact(),fact({revisions:3}),fact(),draft()])).toEqual({hours:1,minutes:60,quotes_sent:3,minutes_per_quote:20});
    expect(hoursSaved([fact(),fact(),fact(),fact()])).toMatchObject({hours:80/60,minutes:80});
    expect(hoursSaved([draft()])).toEqual({hours:0,minutes:0,quotes_sent:0,minutes_per_quote:20});
  });
});

describe('extra GP Querent found (task 1.1 rules)',()=>{
  it('sums qty x (final price - customer price) on accepted quotes where the rep kept Querent\'s raised suggestion',()=>{
    const won=fact({status:'accepted'}),won2=fact({status:'accepted'}),lost=fact({status:'expired'}),open=fact({status:'sent',valid_until:'2026-10-01'});
    const lines=[
      line(won.id), // kept last paid: 10 x (31.50 - 30.95) = 5.50
      line(won.id,{sku:'GLV',qty:4,unit_price:79,suggested_price:79,customer_price:77.5,category_id:'safety'}), // 4 x 1.50 = 6.00
      line(won.id,{sku:'CW',qty:6,unit_price:36,suggested_price:36,suggested_basis:'contract',price_basis:'contract',customer_price:38.95}), // contract: never counts
      line(won2.id,{sku:'NUT',unit_price:16.5,suggested_price:15.9,suggested_basis:'customer',customer_price:15.9,price_basis:'custom'}), // the rep raised it, not Querent
      line(won2.id,{sku:'BOLT',unit_price:30,suggested_price:31.5,customer_price:30.95,price_basis:'custom'}), // the rep lowered Querent's suggestion: not kept
      line(won2.id,{sku:'WASH',unit_price:12.4,suggested_price:12.4,suggested_basis:'customer',customer_price:12.4,price_basis:'customer'}), // no uplift
      line(won2.id,{sku:'LIST',qty:3,unit_price:20,suggested_price:20,suggested_basis:'list',customer_price:null}), // no customer price: no GP vs it
      line(lost.id),line(open.id,{status:'sent'}), // not accepted
    ];
    expect(extraGp([won,won2,lost,open],lines)).toEqual({amount:11.5,lines:2,quotes:1,accepted_quotes:2});
  });

  it('counts a sent quote accepted even if it had since gone overdue (accepted is final)',()=>{
    const won=fact({status:'accepted',valid_until:'2026-01-01'});
    expect(extraGp([won],[line(won.id)])).toMatchObject({amount:5.5,lines:1,quotes:1});
  });

  it('is zero with nothing accepted',()=>{
    const open=draft();
    expect(extraGp([open],[line(open.id,{status:'ready_for_review'})])).toEqual({amount:0,lines:0,quotes:0,accepted_quotes:0});
  });
});

describe('weekly quotes and wins',()=>{
  it('starts weeks on Monday (UTC)',()=>{
    expect(weekStart('2026-09-23T18:00:00.000Z')).toBe('2026-09-21');
    expect(weekStart('2026-09-21T00:00:00.000Z')).toBe('2026-09-21');
    expect(weekStart('2026-09-27T23:59:59.000Z')).toBe('2026-09-21');
    expect(weekStart('2026-09-28T00:00:00.000Z')).toBe('2026-09-28');
  });

  it('buckets quotes by the week they were requested, oldest first, with each one\'s outcome today',()=>{
    const quotes=[
      fact({requested_at:'2026-09-22T10:00:00.000Z',status:'accepted'}),
      fact({requested_at:'2026-09-23T10:00:00.000Z',status:'sent',valid_until:'2026-10-07'}),
      fact({requested_at:'2026-09-08T10:00:00.000Z',status:'sent',valid_until:'2026-09-20'}), // overdue: lost
      fact({requested_at:'2026-09-07T00:00:00.000Z',status:'expired'}),
      fact({requested_at:'2026-08-30T23:59:00.000Z',status:'accepted'}), // before the 4-week window
    ];
    expect(weeklyTrend(quotes,NOW,4)).toEqual([
      {week_start:'2026-08-31',quotes:0,won:0,lost:0,open:0},
      {week_start:'2026-09-07',quotes:2,won:0,lost:2,open:0},
      {week_start:'2026-09-14',quotes:0,won:0,lost:0,open:0},
      {week_start:'2026-09-21',quotes:2,won:1,lost:0,open:1},
    ]);
  });

  it('has empty weeks with no quotes',()=>{
    expect(weeklyTrend([],NOW,2)).toEqual([{week_start:'2026-09-14',quotes:0,won:0,lost:0,open:0},{week_start:'2026-09-21',quotes:0,won:0,lost:0,open:0}]);
  });
});

describe('average margin vs floor (task 1.2 rules)',()=>{
  const categories:ProductCategory[]=[{id:'fasteners',name:'Fasteners',sort_order:1},{id:'abrasives',name:'Abrasives & Cutting',sort_order:2},{id:'safety',name:'Safety & PPE',sort_order:3}];

  it('weights margin and floor by line revenue over the priced lines of sent quotes, per category and overall',()=>{
    const sent=fact({status:'accepted'}),sent2=fact({status:'expired'}),unsent=draft();
    const lines=[
      line(sent.id,{qty:10,unit_price:30,unit_cost:21,margin_floor:0.2}), // revenue 300, cost 210 (30%)
      line(sent2.id,{qty:5,unit_price:20,unit_cost:17,margin_floor:0.2}), // revenue 100, cost 85 (15%, below the 20% floor)
      line(sent.id,{category_id:'safety',qty:4,unit_price:79,unit_cost:58,margin_floor:0.3}), // revenue 316, cost 232 (26.6%, below 30%)
      line(sent.id,{category_id:'abrasives',qty:2,unit_price:null,unit_cost:24.1,margin_floor:0.25}), // not priced
      line(sent.id,{category_id:'abrasives',qty:0,unit_price:36,unit_cost:24.1,margin_floor:0.25}), // zero qty: no revenue
      line(unsent.id,{qty:100,unit_price:1,unit_cost:0.99}), // not sent
    ];
    const result=marginVsFloor([sent,sent2,unsent],lines,categories);
    const close=(value:number)=>expect.closeTo(value,10);
    expect(result.overall).toEqual({margin:close((716-527)/716),floor:close((400*0.2+316*0.3)/716),revenue:716,lines:3,below_floor:2});
    expect(result.categories).toEqual([
      {category_id:'fasteners',name:'Fasteners',margin:close((400-295)/400),floor:close(0.2),revenue:400,lines:2,below_floor:1},
      {category_id:'safety',name:'Safety & PPE',margin:close(84/316),floor:close(0.3),revenue:316,lines:1,below_floor:1},
    ]);
  });

  it('uses the default 20% floor when the rep has no floor row, and is empty with nothing sent',()=>{
    const sent=fact();
    expect(marginVsFloor([sent],[line(sent.id,{qty:1,unit_price:10,unit_cost:9,margin_floor:null})],categories).overall)
      .toEqual({margin:expect.closeTo(0.1,10),floor:expect.closeTo(0.2,10),revenue:10,lines:1,below_floor:1});
    expect(marginVsFloor([draft()],[],categories)).toEqual({overall:{margin:null,floor:null,revenue:0,lines:0,below_floor:0},categories:[]});
  });
});

describe('questions answered without a rep',()=>{
  it('counts answers with data and "no match" answers as answered; access refusals and errors needed the rep',()=>{
    expect(questionsAnswered({answered:37,no_rows:3})).toEqual({total:40,answered:40,with_data:37,no_match:3,needed_rep:0,rate:1});
    expect(questionsAnswered({answered:6,no_rows:1,restricted:2,error:1})).toEqual({total:10,answered:7,with_data:6,no_match:1,needed_rep:3,rate:0.7});
    expect(questionsAnswered({})).toEqual({total:0,answered:0,with_data:0,no_match:0,needed_rep:0,rate:null});
  });
});
