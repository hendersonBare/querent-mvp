import {describe,expect,it} from 'vitest';
import {db} from '../db';
import {markCustomerViewed} from './customer';
import {createQuote,quote,quoteTouchClocks,quotes,touchQuoteByRep} from './quotes';
import {useSeededDatabase} from './test-db';

// The touch and view clocks (v3 spec §1.2 "003_quote_touch" row, §3; decision 25; task A2).
useSeededDatabase();

const T0='2026-09-24T10:00:00.000Z',T1='2026-09-24T11:00:00.000Z',T2='2026-09-24T12:00:00.000Z';
const updatedAt=(id:string)=>quote(id)!.updated_at;

describe('migration 005_quote_touch',()=>{
  it('adds two nullable text columns to quotes, empty on every seeded quote',()=>{
    const columns=db().prepare("SELECT name,type,\"notnull\",dflt_value FROM pragma_table_info('quotes') WHERE name IN ('last_rep_touch_at','customer_viewed_at') ORDER BY name").all();
    expect(columns).toEqual([
      {name:'customer_viewed_at',type:'TEXT',notnull:0,dflt_value:null},
      {name:'last_rep_touch_at',type:'TEXT',notnull:0,dflt_value:null},
    ]);
    // The demo book (task F1) seeds both clocks; Wasatch's quotes have neither.
    expect(db().prepare("SELECT count(*) FROM quotes WHERE customer_id='wasatch' AND (last_rep_touch_at IS NOT NULL OR customer_viewed_at IS NOT NULL)").pluck().get()).toBe(0);
    expect(db().prepare("SELECT id FROM schema_migrations WHERE id='005_quote_touch'").pluck().get()).toBe('005_quote_touch');
  });
});

describe('touchQuoteByRep: last_rep_touch_at',()=>{
  it('stamps the rep touch without changing updated_at',()=>{
    const before=updatedAt('q-24817');
    expect(quoteTouchClocks('q-24817')).toEqual({last_rep_touch_at:null,customer_viewed_at:null});
    expect(touchQuoteByRep('q-24817',T1)).toBe(true);
    expect(quoteTouchClocks('q-24817')).toEqual({last_rep_touch_at:T1,customer_viewed_at:null});
    expect(updatedAt('q-24817')).toBe(before);
    touchQuoteByRep('q-24817',T2);
    expect(quoteTouchClocks('q-24817')?.last_rep_touch_at).toBe(T2);
  });

  it('changes nothing for an unknown quote',()=>{
    expect(touchQuoteByRep('nope',T1)).toBe(false);
    expect(quoteTouchClocks('nope')).toBeUndefined();
  });
});

describe('markCustomerViewed: customer_viewed_at',()=>{
  it('stamps the view on one of the customer’s sent quotes (by id or number), clears its unread flag, and keeps updated_at',()=>{
    db().prepare("UPDATE quotes SET unread_for_customer=1 WHERE id='q-24816'").run();
    const before=updatedAt('q-24816');
    expect(markCustomerViewed('wasatch','Q-24816',T1)).toBe(true);
    expect(quoteTouchClocks('q-24816')).toEqual({last_rep_touch_at:null,customer_viewed_at:T1});
    expect(quote('q-24816')!.unread_for_customer).toBe(false);
    expect(updatedAt('q-24816')).toBe(before);
    expect(markCustomerViewed('wasatch','q-24816',T2)).toBe(true);
    expect(quoteTouchClocks('q-24816')?.customer_viewed_at).toBe(T2);
  });

  it('ignores a draft the rep never sent, another customer’s quote and an unknown one',()=>{
    expect(markCustomerViewed('wasatch','Q-24817',T1)).toBe(false);
    expect(quoteTouchClocks('q-24817')?.customer_viewed_at).toBeNull();
    const other=createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',at:T0,lines:[{itemId:'HCS-12-13-2G5',qty:1,unitPrice:21.95,priceBasis:'customer'}]});
    expect(markCustomerViewed('wasatch',other.id,T1)).toBe(false);
    expect(markCustomerViewed('canyon-ridge','q-24816',T1)).toBe(false);
    expect(markCustomerViewed('wasatch','Q-1',T1)).toBe(false);
  });
});

describe('quotes(): the list carries the aging clocks',()=>{
  it('adds created_at and responded_at to each row',()=>{
    const row=quotes().find(q=>q.id==='q-24816')!;
    const full=quote('q-24816')!;
    expect(row).toMatchObject({created_at:full.created_at,responded_at:full.responded_at,sent_at:full.sent_at,valid_until:full.valid_until});
  });
});
