import {describe,expect,it} from 'vitest';
import type {NewQuote} from '@/domain';
import {formatMargin,margin} from '@/server/floors';
import {createQuote,quote,quoteRevision} from '@/server/repository';
import {requestChanges,sendQuote} from '@/server/quotes/service';
import {useSeededDatabase} from '@/server/repository/test-db';
import {repBadges} from './badges';
import {openRepQuote,parseStatus,repQuote,repQuoteList} from './quotes';

// The rep's Quotes list (task 3.2, spec §4) against the seed pinned to the mockup's day: 24
// historical Wasatch quotes (17 accepted, 7 expired) plus the sample Q-24817, all Brandi's.
useSeededDatabase();

const NOW='2026-09-23T18:00:00.000Z';
const T0='2026-09-24T16:00:00.000Z',SENT='2026-09-24T17:00:00.000Z',LATER='2026-09-25T15:00:00.000Z';

/** A priced Wasatch quote, as the item pop-up's Request quote creates it. */
const request=(input:Partial<NewQuote>={})=>createQuote({customerId:'wasatch',contactId:'dana',fulfillment:'will_call',branchId:'slc',at:T0,
  lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'last_paid'}],...input});

describe('repQuoteList: the seeded queue',()=>{
  it("lists the rep's quotes newest request first, the sample quote on top",async()=>{
    const list=await repQuoteList('brandi',{now:NOW});
    expect(list.rows).toHaveLength(25);
    expect(list.rows[0]).toMatchObject({quote_number:'Q-24817',revision:0,customer_id:'wasatch',customer_name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',
      status:'ready_for_review',requested_at:'2026-09-23T16:14:00.000Z',sent_at:null,unread:true,is_sample:true,line_count:4,change_request:null});
    const requested=list.rows.map(r=>r.requested_at);
    expect(requested).toEqual([...requested].sort().reverse());
    expect(list).toMatchObject({customer:null,other_rep:false,status:null,unread:1,as_of:NOW});
    expect(list.counts).toEqual({all:25,ready_for_review:1,sent:0,changes_requested:0,accepted:17,expired:7});
  });

  it("totals a draft live, as Approve & send would: Q-24817 is $1,122.40 will call at 32.2%, with the gloves under Brandi's 30% PPE floor",async()=>{
    const [sample]=(await repQuoteList('brandi',{now:NOW})).rows;
    expect(sample).toMatchObject({total:1122.4,total_basis:'draft',freight_pending:false,margin_label:'32.2%',below_floor_count:1});
    expect(sample.margin).toBeCloseTo(361.4/1122.4,10);
  });

  it('totals a quote the rep can no longer edit from its last sent revision, and computes margin with the floor helpers',async()=>{
    const list=await repQuoteList('brandi',{now:NOW});
    const accepted=list.rows.find(r=>r.quote_number==='Q-24816')!;
    expect(accepted).toMatchObject({status:'accepted',revision:1,total_basis:'sent',freight_pending:false,below_floor_count:0,unread:false,is_sample:false});
    expect(accepted.total).toBe(quoteRevision('q-24816',1)!.total);
    const q=quote('q-24816')!;
    const items=q.lines.reduce((sum,l)=>sum+l.qty*l.unit_price!,0),cost=q.lines.reduce((sum,l)=>sum+l.qty*l.unit_cost,0);
    expect(accepted.margin).toBeCloseTo(margin(items,cost)!,10);
    expect(accepted.margin_label).toBe(formatMargin(margin(items,cost)));
    expect(list.rows.find(r=>r.quote_number==='Q-24815')).toMatchObject({status:'expired',total_basis:'sent'});
  });

  it('filters by status without changing the counts',async()=>{
    const accepted=await repQuoteList('brandi',{now:NOW,status:'accepted'});
    expect(accepted.rows).toHaveLength(17);
    expect(accepted.rows.every(r=>r.status==='accepted')).toBe(true);
    expect(accepted.status).toBe('accepted');
    expect(accepted.counts.all).toBe(25);
    expect((await repQuoteList('brandi',{now:NOW,status:'changes_requested'})).rows).toEqual([]);
  });
});

describe('repQuoteList: the "Viewing" picker and whose quotes',()=>{
  it('follows the picked customer',async()=>{
    const wasatch=await repQuoteList('brandi',{now:NOW,customerId:'wasatch'});
    expect(wasatch.rows).toHaveLength(25);
    expect(wasatch.customer).toMatchObject({id:'wasatch',name:'Wasatch Mechanical Contractors',rep_id:'brandi'});
    expect(wasatch.other_rep).toBe(false);
  });

  it('is empty for a placeholder customer, with nothing counted',async()=>{
    const greatBasin=await repQuoteList('brandi',{now:NOW,customerId:'great-basin'});
    expect(greatBasin.rows).toEqual([]);
    expect(greatBasin).toMatchObject({other_rep:false,unread:0,customer:{name:'Great Basin Fabrication',account_number:'GBF-2207'}});
    expect(greatBasin.counts).toEqual({all:0,ready_for_review:0,sent:0,changes_requested:0,accepted:0,expired:0});
  });

  it("reads an unknown customer as All customers, like the picker",async()=>{
    const list=await repQuoteList('brandi',{now:NOW,customerId:'nobody'});
    expect(list.customer).toBeNull();
    expect(list.rows).toHaveLength(25);
  });

  it("shows only the signed-in rep's quotes: another rep's customer reads as theirs, not an empty queue",async()=>{
    const other=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',at:T0,lines:[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:82,priceBasis:'custom'}]});
    try{
      expect(other.rep_id).toBe('mara');
      const all=await repQuoteList('brandi',{now:NOW});
      expect(all.rows.map(r=>r.quote_number)).not.toContain(other.quote_number);
      expect(all.counts.all).toBe(25);
      const canyon=await repQuoteList('brandi',{now:NOW,customerId:'canyon-ridge'});
      expect(canyon).toMatchObject({rows:[],other_rep:true,customer:{name:'Canyon Ridge Builders',rep_name:'Mara Jensen'}});
      const mara=await repQuoteList('mara',{now:NOW});
      expect(mara.rows.map(r=>r.quote_number)).toEqual([other.quote_number]);
      expect(mara).toMatchObject({unread:1,other_rep:false});
    }finally{
      // Leave the queue as seeded for the tests below: Mara's quote never shows for Brandi anyway.
      openRepQuote('mara',other.id);
    }
  });
});

describe('repQuoteList: statuses the rep acts on',()=>{
  it("highlights changes_requested with the customer's note, who wrote it and when, and totals the draft the rep is editing",async()=>{
    const q=request();
    await sendQuote(q.id,{repId:'brandi',now:SENT});
    requestChanges('wasatch',q.id,{revision:1,note:'Make it 12 boxes and deliver Friday.',now:LATER});
    const list=await repQuoteList('brandi',{now:LATER});
    const row=list.rows.find(r=>r.id===q.id)!;
    expect(row).toMatchObject({status:'changes_requested',revision:1,unread:true,total:315,total_basis:'draft',
      change_request:{note:'Make it 12 boxes and deliver Friday.',by:'Dana Ortiz',at:LATER}});
    expect(list.counts.changes_requested).toBe(1);
    expect((await repQuoteList('brandi',{now:LATER,status:'changes_requested'})).rows.map(r=>r.id)).toEqual([q.id]);
  });

  it('shows an overdue sent quote as expired: the lazy expiry is stored before listing',async()=>{
    const {quote:sent}=await sendQuote(request().id,{repId:'brandi',now:SENT});
    const valid=await repQuoteList('brandi',{now:LATER});
    expect(valid.rows.find(r=>r.id===sent.id)).toMatchObject({status:'sent',total_basis:'sent',total:315,unread:false});
    const afterExpiry='2026-10-09T00:00:00.000Z';
    const expired=await repQuoteList('brandi',{now:afterExpiry});
    expect(expired.rows.find(r=>r.id===sent.id)).toMatchObject({status:'expired',total:315});
    expect(quote(sent.id)!.status).toBe('expired');
    expect(expired.counts.sent).toBe(0);
  });

  it('totals the items only while a draft is still call for freight',async()=>{
    const far=request({fulfillment:'delivery',shipTo:{address:'Moab, UT',lat:38.573,lng:-109.55}});
    const row=(await repQuoteList('brandi',{now:T0})).rows.find(r=>r.id===far.id)!;
    expect(row).toMatchObject({total:315,total_basis:'draft',freight_pending:true});
  });

  it('shows no margin before anything is priced',async()=>{
    const unpriced=request({lines:[{itemId:'HCS-12-13-2G8',qty:10}]});
    const row=(await repQuoteList('brandi',{now:T0})).rows.find(r=>r.id===unpriced.id)!;
    expect(row).toMatchObject({margin:null,margin_label:'—',total:0,below_floor_count:0});
    openRepQuote('brandi',unpriced.id);
  });
});

describe('opening a quote',()=>{
  it("finds the rep's quote by number or id, and hides another rep's",()=>{
    expect(repQuote('brandi','Q-24817')?.id).toBe('q-24817');
    expect(repQuote('brandi','q-24817')?.quote_number).toBe('Q-24817');
    expect(repQuote('mara','Q-24817')).toBeUndefined();
    expect(repQuote('brandi','Q-99999')).toBeUndefined();
  });

  it('clears the unread flag for the rep, and the badge with it',async()=>{
    const before=repBadges('brandi',{now:LATER}).quotes;
    expect(quote('q-24817')!.unread_for_rep).toBe(true);
    expect(openRepQuote('brandi','Q-24817')).toEqual({id:'q-24817',quote_number:'Q-24817'});
    expect(quote('q-24817')!.unread_for_rep).toBe(false);
    expect(repBadges('brandi',{now:LATER}).quotes).toBe(before-1);
    expect((await repQuoteList('brandi',{now:LATER})).rows.find(r=>r.id==='q-24817')!.unread).toBe(false);
    // Opening it again is harmless.
    expect(openRepQuote('brandi','q-24817')).toEqual({id:'q-24817',quote_number:'Q-24817'});
  });

  it("never marks another rep's quote read",()=>{
    const other=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',at:T0,lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
    expect(openRepQuote('brandi',other.quote_number)).toBeUndefined();
    expect(quote(other.id)!.unread_for_rep).toBe(true);
  });
});

describe('parseStatus',()=>{
  it('accepts the five statuses and reads anything else as every status',()=>{
    expect(parseStatus('changes_requested')).toBe('changes_requested');
    expect(parseStatus('ready_for_review')).toBe('ready_for_review');
    expect(parseStatus('lost')).toBeNull();
    expect(parseStatus('')).toBeNull();
    expect(parseStatus(null)).toBeNull();
    expect(parseStatus(undefined)).toBeNull();
  });
});
