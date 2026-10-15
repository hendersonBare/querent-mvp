// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';
import {parseOnly,parseStatuses,repQuoteList,type RepQuoteRow} from './quotes';

// The Quotes page's filter panel (plan U3; frames C_QOB2, C_QOT1, C_RQB2): status (any set), Rep (the
// manager only), Customer, Requested from and to (UTC days, like every date in the list) and "Only
// show" Overdue, Aging, Below margin floor (any of them). The board's lane counts come from the same
// filtered quotes, before the status filter. Read at the real clock, since the seed's aging quotes are
// dated from the reset time (Q-24789 Aging, Q-24790 and the sample Q-24817 Overdue, Q-24791 fine).
useSeededDatabase();

const now=()=>new Date(Date.now()+60_000).toISOString();
const numbers=(rows:RepQuoteRow[])=>rows.map(r=>r.quote_number);
const day=(iso:string)=>iso.slice(0,10);

describe('parsing the panel params',()=>{
  it('reads a status list, keeping known statuses in board order, and anything else as every status',()=>{
    expect(parseStatuses('sent,ready_for_review')).toEqual(['ready_for_review','sent']);
    expect(parseStatuses('accepted')).toEqual(['accepted']);
    expect(parseStatuses('lost,sent,sent')).toEqual(['sent']);
    expect(parseStatuses('lost')).toEqual([]);
    expect(parseStatuses(null)).toEqual([]);
  });
  it('reads Only show as a set of overdue, aging and below_floor',()=>{
    expect(parseOnly('aging,overdue')).toEqual(['overdue','aging']);
    expect(parseOnly('below_floor,nope')).toEqual(['below_floor']);
    expect(parseOnly('')).toEqual([]);
    expect(parseOnly(null)).toEqual([]);
  });
});

describe('repQuoteList: the filter panel',()=>{
  it('shows any set of statuses, counting every status of the other filters for the board',async()=>{
    const all=await repQuoteList('brandi',{manager:true,filters:{rep:'brandi'},now:now()});
    const two=await repQuoteList('brandi',{manager:true,filters:{rep:'brandi'},statuses:['sent','changes_requested'],now:now()});
    expect(two.statuses).toEqual(['changes_requested','sent']);
    expect(new Set(two.rows.map(r=>r.status))).toEqual(new Set(['sent','changes_requested']));
    expect(two.rows).toHaveLength(all.counts.sent+all.counts.changes_requested);
    expect(two.counts).toEqual(all.counts);
    // Every status picked reads as every status.
    const every=await repQuoteList('brandi',{manager:true,filters:{rep:'brandi'},statuses:['ready_for_review','changes_requested','sent','accepted','expired','declined'],now:now()});
    expect(every.statuses).toEqual([]);
    expect(every.rows).toHaveLength(all.rows.length);
  });

  it('keeps quotes requested from and to the given UTC days, both included; a bad day is ignored',async()=>{
    const all=await repQuoteList('brandi',{manager:true,filters:{rep:'brandi'},now:now()});
    const accepted=all.rows.find(r=>r.quote_number==='Q-24816')!;
    const from=day(accepted.requested_at);
    const expected=all.rows.filter(r=>day(r.requested_at)>=from).map(r=>r.quote_number);
    const since=await repQuoteList('brandi',{manager:true,filters:{rep:'brandi'},requestedFrom:from,now:now()});
    expect(numbers(since.rows)).toEqual(expected);
    expect(since.requested_from).toBe(from);
    const only=await repQuoteList('brandi',{manager:true,filters:{rep:'brandi'},requestedFrom:from,requestedTo:from,now:now()});
    expect(numbers(only.rows)).toEqual(all.rows.filter(r=>day(r.requested_at)===from).map(r=>r.quote_number));
    expect(only.rows.map(r=>r.quote_number)).toContain('Q-24816');
    expect(only.counts.all).toBe(only.rows.length);
    const bad=await repQuoteList('brandi',{manager:true,filters:{rep:'brandi'},requestedFrom:'Sep 1',requestedTo:'2026-13-40',now:now()});
    expect(bad).toMatchObject({requested_from:null,requested_to:null});
    expect(bad.rows).toHaveLength(all.rows.length);
  });

  it('Only show: Overdue is red, Aging is amber, Below margin floor a draft with a line under the floor; several show any of them',async()=>{
    const base={manager:true,filters:{rep:'brandi'}};
    const overdue=await repQuoteList('brandi',{...base,only:['overdue'],now:now()});
    expect(numbers(overdue.rows).sort()).toEqual(['Q-24790','Q-24817']);
    expect(overdue.only).toEqual(['overdue']);
    expect(overdue.counts).toMatchObject({all:2,ready_for_review:1,changes_requested:1,sent:0});
    expect(numbers((await repQuoteList('brandi',{...base,only:['aging'],now:now()})).rows)).toEqual(['Q-24789']);
    expect(numbers((await repQuoteList('brandi',{...base,only:['below_floor'],now:now()})).rows)).toEqual(['Q-24817']);
    expect(numbers((await repQuoteList('brandi',{...base,only:['overdue','aging'],now:now()})).rows).sort()).toEqual(['Q-24789','Q-24790','Q-24817']);
    // With a status: both apply.
    expect(numbers((await repQuoteList('brandi',{...base,only:['overdue','aging'],statuses:['sent'],now:now()})).rows)).toEqual(['Q-24789']);
  });

  it('a rep\'s filters never reach another rep: Rep is the manager\'s only, and the rep reads their own quotes',async()=>{
    const mara=await repQuoteList('mara',{filters:{rep:'brandi'},now:now()});
    expect(mara.rows.length).toBeGreaterThan(0);
    expect(mara.rows.every(r=>r.rep_id==='mara')).toBe(true);
    expect(mara.rep_filter).toBeNull();
  });
});

describe('repQuoteList: what the page needs beyond the rows',()=>{
  it("lists the customers the reader may pick: a rep's own, every customer for the manager",async()=>{
    const brandi=await repQuoteList('brandi',{manager:true,now:now()});
    expect(brandi.customers.map(c=>c.id)).toEqual(expect.arrayContaining(['wasatch','canyon-ridge','great-basin','uinta-facility']));
    expect(brandi.customers[0]).toEqual({id:expect.any(String),name:expect.any(String),account_number:expect.any(String)});
    const mara=await repQuoteList('mara',{now:now()});
    expect(mara.customers.map(c=>c.id)).toEqual(['canyon-ridge']);
  });

  it('names each quote\'s purchasing agent (the contact), for the table\'s optional column',async()=>{
    const list=await repQuoteList('brandi',{manager:true,filters:{rep:'brandi'},now:now()});
    expect(list.rows.find(r=>r.quote_number==='Q-24817')?.contact_name).toBe('Dana Ortiz');
    expect(list.rows.every(r=>r.contact_name===null||typeof r.contact_name==='string')).toBe(true);
  });
});
