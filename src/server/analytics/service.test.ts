import {describe,expect,it} from 'vitest';
import {explainQuoteGp,querentFoundGp} from '@/server/pricing';
import {acceptQuote,duplicateQuote,requestChanges,sendQuote} from '@/server/quotes/service';
import {customers,quote,quotes,updateQuoteLine} from '@/server/repository';
import {SEED_DATE,useSeededDatabase} from '@/server/repository/test-db';
import {analyticsScope,repAnalytics} from './service';

// Every Analytics metric against the seed (spec §4, task 6.2). useSeededDatabase pins
// QUERENT_SEED_DATE to 2026-09-23, the mockup's day. The seed's facts (src/server/db/seed/history.ts):
// 24 Wasatch quotes sent by Brandi over a year (17 accepted, 7 expired) plus the sample Q-24817
// awaiting her review; 40 Wasatch chat questions. Great Basin (Brandi's), Canyon Ridge (Mara's)
// and Uinta (Nora's) are placeholders with no data.
useSeededDatabase();

const NOW=`${SEED_DATE}T18:00:00.000Z`;
const brandi=(customerId:string|null=null,now=NOW)=>repAnalytics('brandi',{customerId,now});

describe('scope: the signed-in rep\'s customers, narrowed by the picker',()=>{
  it('covers every customer of the rep for All customers, one of them when picked, and none of another rep\'s',()=>{
    expect(analyticsScope('brandi',null)).toEqual({customer:null,customer_ids:['great-basin','wasatch'],other_rep:false});
    expect(analyticsScope('brandi','wasatch')).toMatchObject({customer:{id:'wasatch',name:'Wasatch Mechanical Contractors'},customer_ids:['wasatch'],other_rep:false});
    expect(analyticsScope('brandi','canyon-ridge')).toMatchObject({customer:{id:'canyon-ridge',rep_name:'Mara Jensen'},customer_ids:[],other_rep:true});
    expect(analyticsScope('brandi','nobody')).toEqual(analyticsScope('brandi',null));
    expect(analyticsScope('mara',null).customer_ids).toEqual(['canyon-ridge']);
    expect(analyticsScope('brandi',null,customers().map(c=>({...c,rep_id:'nora'}))).customer_ids).toEqual([]);
  });
});

describe('the five stat cards on the seed',()=>{
  it('median time from request to sent: 92.5 minutes over the 24 sent quotes',()=>{
    // First sends (history.ts sendMinutes), sorted: ... 85, 90 | 95, 95 ...: the two middle values average 92.5.
    expect(brandi().turnaround).toEqual({median_minutes:92.5,quotes:24,fastest_minutes:35,slowest_minutes:260});
    expect(brandi('wasatch').turnaround).toEqual(brandi().turnaround);
  });

  it('win rate: 17 of 24 decided, 71%, with the sample open (task 1.5 carry-forward)',()=>{
    expect(brandi().win_rate).toEqual({rate:17/24,won:17,lost:7,open:1});
    expect(Math.round(brandi().win_rate.rate!*100)).toBe(71);
  });

  it('$ quoted vs $ accepted: the last sent revision totals, as the Quotes list shows them',()=>{
    const {quoted}=brandi();
    const sent=quotes({customerId:'wasatch'}).filter(q=>q.sent_total!==null);
    const cents=(rows:typeof sent)=>Math.round(rows.reduce((sum,q)=>sum+q.sent_total!*100,0));
    expect(quoted).toEqual({quoted:9045.35,accepted:7008.05,quoted_count:24,accepted_count:17,share:7008.05/9045.35});
    expect(quoted.quoted*100).toBe(cents(sent));
    expect(quoted.accepted*100).toBe(cents(sent.filter(q=>q.status==='accepted')));
  });

  it('hours saved: 20 minutes x 24 quotes sent = 8 hours',()=>{
    expect(brandi().hours_saved).toEqual({hours:8,minutes:480,quotes_sent:24,minutes_per_quote:20});
  });

  it('extra GP Querent found: $10.20 on the two accepted quotes where Brandi kept a raised last-paid price',()=>{
    // Q-24805: 12 bolts at last paid $30.40 vs customer $29.80 = $7.20. Q-24811: 2 tapes at $94.50 vs $93.00 = $3.00.
    // Contract lines (wheels, flap discs) and prices Brandi raised herself (Q-24812 bolts, Q-24816 gloves) don't count.
    expect(brandi().extra_gp).toEqual({amount:10.2,lines:2,quotes:2,accepted_quotes:17});
  });
});

describe('the trends on the seed',()=>{
  it('weekly quotes and wins: 26 weeks to this one, each quote in its request week',()=>{
    const {weekly}=brandi();
    expect(weekly).toHaveLength(26);
    expect(weekly[0].week_start).toBe('2026-03-30');
    expect(weekly.at(-1)).toEqual({week_start:'2026-09-21',quotes:1,won:0,lost:0,open:1}); // Q-24817
    expect(weekly.find(w=>w.week_start==='2026-09-07')).toEqual({week_start:'2026-09-07',quotes:1,won:1,lost:0,open:0}); // Q-24816
    const sum=(key:'quotes'|'won'|'lost'|'open')=>weekly.reduce((total,w)=>total+w[key],0);
    expect([sum('quotes'),sum('won'),sum('lost'),sum('open')]).toEqual([15,10,4,1]);
  });

  it('average margin vs floor: revenue-weighted over the 24 sent quotes, against Brandi\'s floors',()=>{
    const {margin}=brandi();
    expect(margin.overall).toMatchObject({lines:56,revenue:8309.6,below_floor:3});
    expect(margin.overall.margin).toBeCloseTo(0.338,3);
    expect(margin.overall.floor).toBeCloseTo(0.2397,4);
    expect(margin.categories.map(c=>[c.name,c.floor])).toEqual([
      ['Fasteners',0.2],['Abrasives & Cutting',0.25],['Safety & PPE',0.3],['Material Handling & Tie-downs',0.2],['Tools',0.18],['Janitorial/MRO',0.2],
    ]);
    // The gloves (cost $58) sold at $76.50, $78.00 and $79.00 are all under Brandi's 30% PPE floor.
    expect(margin.categories.find(c=>c.category_id==='safety')).toMatchObject({lines:13,below_floor:3});
    // Tools: drill bits 2 x $58.95 + $58.95, sockets 2 x $72.50, blades 2 x $17.80, paint marker $23.10.
    expect(margin.categories.find(c=>c.category_id==='tools')).toMatchObject({lines:6,revenue:380.55,below_floor:0});
    // The sample Q-24817 isn't sent, so its gloves line (26.6%) isn't here yet.
    expect(margin.categories.reduce((sum,c)=>sum+c.lines,0)).toBe(56);
  });

  it('top requested items: bolts and Type 1 wheels on 6 quotes each',()=>{
    expect(brandi().top_items.map(i=>[i.sku,i.quote_count])).toEqual([['HCS-12-13-2G8',6],['CW-45-045-T1',6],['HN-12-13-G8',5],['FD-45-60Z',4],['FW-12-G8',4]]);
  });

  it('questions answered without a rep: all 40, 3 of them "we don\'t carry that"',()=>{
    expect(brandi().questions).toEqual({total:40,answered:40,with_data:37,no_match:3,needed_rep:0,rate:1});
  });

  it('keeps the old query analytics for the same customers',()=>{
    const result=brandi();
    expect(result.queries.total_queries).toBe(40);
    expect(result.queries.categories.every(c=>c.rep_name==='Brandi Gallegos')).toBe(true);
    expect(result.access.map(a=>a.category)).toEqual(['items_stock','pricing','orders_quotes','account']);
  });
});

describe('placeholder and other reps\' customers',()=>{
  const empty={
    turnaround:{median_minutes:null,quotes:0,fastest_minutes:null,slowest_minutes:null},
    win_rate:{rate:null,won:0,lost:0,open:0},
    quoted:{quoted:0,accepted:0,quoted_count:0,accepted_count:0,share:null},
    hours_saved:{hours:0,minutes:0,quotes_sent:0,minutes_per_quote:20},
    extra_gp:{amount:0,lines:0,quotes:0,accepted_quotes:0},
    margin:{overall:{margin:null,floor:null,revenue:0,lines:0,below_floor:0},categories:[]},
    top_items:[],
    questions:{total:0,answered:0,with_data:0,no_match:0,needed_rep:0,rate:null},
  };

  it('shows zeros for Brandi\'s placeholder customer, Great Basin',()=>{
    const result=brandi('great-basin');
    expect(result).toMatchObject({scope:{customer:{id:'great-basin'},customer_ids:['great-basin'],other_rep:false},...empty});
    expect(result.weekly.every(w=>w.quotes===0)).toBe(true);
    expect(result.queries.total_queries).toBe(0);
  });

  it('shows zeros for another rep\'s customer, and says so',()=>{
    const result=brandi('canyon-ridge');
    expect(result).toMatchObject({scope:{customer:{id:'canyon-ridge',rep_name:'Mara Jensen'},customer_ids:[],other_rep:true},...empty});
    expect(result.queries).toMatchObject({total_queries:0});
    expect(result.access).toEqual([]);
  });

  it('shows zeros for a rep whose customers have no data',()=>{
    expect(repAnalytics('mara',{now:NOW})).toMatchObject({scope:{customer_ids:['canyon-ridge']},...empty});
  });
});

describe('live changes (these write to the database, so they run last)',()=>{
  it('counts the sample once Brandi sends it and Dana accepts it; its GP agrees with "Querent found" on the quote',async()=>{
    const sample=quote('q-24817')!;
    // Q-24817's lines: bolts at last paid $31.50 vs $30.95 (+$5.50), gloves at $79.00 vs $77.50 (+$6.00); wheels are contract.
    expect(explainQuoteGp(sample.lines)).toBe('Querent found +$11.50 GP');
    await sendQuote('Q-24817',{repId:'brandi',now:'2026-09-23T17:00:00.000Z'}); // 46 minutes after Dana asked
    acceptQuote('wasatch','Q-24817',{revision:1,fulfillmentTime:'2026-09-24T15:00:00.000Z',customerPo:'7781',now:'2026-09-24T14:00:00.000Z'});
    const after=brandi(null,'2026-09-24T18:00:00.000Z');
    expect(after.extra_gp).toEqual({amount:21.7,lines:4,quotes:3,accepted_quotes:18});
    expect(Math.round(after.extra_gp.amount*100)).toBe(1020+Math.round(querentFoundGp(sample.lines)*100));
    expect(after.win_rate).toEqual({rate:18/25,won:18,lost:7,open:0});
    expect(after.hours_saved.quotes_sent).toBe(25);
    expect(after.turnaround).toMatchObject({quotes:25,median_minutes:90,fastest_minutes:35});
    expect(after.weekly.at(-1)).toEqual({week_start:'2026-09-21',quotes:1,won:1,lost:0,open:0});
    expect(after.margin.categories.find(c=>c.category_id==='safety')).toMatchObject({lines:14,below_floor:4});
  });

  it('keeps margin vs floor on the prices the customer was sent while the rep reworks a quote after a change request',async()=>{
    const before=brandi(null,'2026-09-24T18:00:00.000Z').margin;
    const copy=duplicateQuote('Q-24806',{repId:'brandi',now:'2026-09-24T18:00:00.000Z'}); // 4 gloves at $78.00, 2 glasses at $29.40
    await sendQuote(copy.id,{repId:'brandi',now:'2026-09-24T18:30:00.000Z'});
    const sent=brandi(null,'2026-09-24T19:00:00.000Z').margin;
    expect(sent.overall.lines).toBe(before.overall.lines+2);
    expect(Math.round(sent.overall.revenue*100)).toBe(Math.round((before.overall.revenue+4*78+2*29.4)*100));
    requestChanges('wasatch',copy.id,{revision:1,note:'Can you do better on the gloves?',now:'2026-09-24T19:30:00.000Z'});
    const gloves=quote(copy.id)!.lines.find(l=>l.sku==='GLV-N8-L-1000')!;
    updateQuoteLine(copy.id,gloves.id,{unitPrice:40,priceBasis:'custom'},'2026-09-24T19:45:00.000Z'); // a draft far under the 30% floor
    expect(brandi(null,'2026-09-24T20:00:00.000Z').margin).toEqual(sent);
  });

  it('stores the expiry of an overdue sent quote before counting it as lost',async()=>{
    const copy=duplicateQuote('Q-24816',{repId:'brandi',now:'2026-09-24T18:00:00.000Z'});
    await sendQuote(copy.id,{repId:'brandi',now:'2026-09-24T19:00:00.000Z'}); // valid until Oct 8
    // Open: this copy, and the reworked copy of Q-24806 from the test above (changes requested, so it never expires).
    expect(brandi(null,'2026-10-08T23:00:00.000Z').win_rate).toMatchObject({won:18,lost:7,open:2});
    expect(quote(copy.id)!.status).toBe('sent');
    expect(brandi(null,'2026-10-09T00:00:00.000Z').win_rate).toEqual({rate:18/26,won:18,lost:8,open:1});
    expect(quote(copy.id)!.status).toBe('expired');
  });
});
