// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {setSettingFixture,useSeededDatabase} from '@/server/repository/test-db';
import {repBadges} from './badges';
import {attentionOrder,parseAttentionSort,repQuoteList,type RepQuoteRow} from './quotes';

// Aging in the rep's Quotes list and header badge (v3 spec §3, §5, §6; decision 18; OA-8, OA-9;
// task A2). The seed's aging quotes are relative to the reset time, so the list is read at the real
// clock: Q-24789 sent 100 h ago (Aging), Q-24790 changes requested 30 h ago (Overdue), Q-24791 sent
// 20 h ago (fine), and the sample Q-24817, requested on the pinned seed day weeks ago (Overdue).
useSeededDatabase();

/** A minute after the real clock: the seed is written on first use, so its reset time is a moment after the test starts. */
const now=()=>new Date(Date.now()+60_000).toISOString();
const numbers=(rows:RepQuoteRow[])=>rows.map(r=>r.quote_number);

describe('rows carry their aging',()=>{
  it('levels each open quote and leaves final ones null',async()=>{
    const list=await repQuoteList('brandi',{now:now()});
    const row=(n:string)=>list.rows.find(r=>r.quote_number===n)!;
    expect(row('Q-24789').aging).toMatchObject({level:'amber',reason:'Sent 4 days ago',since:row('Q-24789').sent_at});
    expect(row('Q-24790').aging).toMatchObject({level:'red',reason:'Changes requested 30 hours ago'});
    expect(row('Q-24791').aging).toMatchObject({level:'ok',reason:'Sent 20 hours ago'});
    expect(row('Q-24817').aging).toMatchObject({level:'red',since:'2026-09-23T16:15:00.000Z'});
    expect(row('Q-24816').aging).toBeNull();
    expect(list.rows.filter(r=>r.status==='accepted'||r.status==='expired').every(r=>r.aging===null)).toBe(true);
  });

  it('carries the quoted total: the latest sent total, else the live draft total',async()=>{
    const list=await repQuoteList('brandi',{now:now()});
    const row=(n:string)=>list.rows.find(r=>r.quote_number===n)!;
    expect(row('Q-24817')).toMatchObject({total:1122.4,quoted_total:1122.4});
    // Q-24790 is a draft again (changes requested): the list shows the live draft, the sort uses what Dana was sent.
    expect(row('Q-24790')).toMatchObject({total_basis:'draft',quoted_total:1164});
    expect(row('Q-24789')).toMatchObject({total:360.8,quoted_total:360.8});
  });
});

describe('the Needs attention filter',()=>{
  it('shows the amber and red open quotes, red first, then by quoted total (largest first)',async()=>{
    const list=await repQuoteList('brandi',{now:now(),attention:true});
    expect(numbers(list.rows)).toEqual(['Q-24790','Q-24817','Q-24789']);
    expect(list).toMatchObject({attention:true,sort:'urgent',status:null,attention_count:3});
    // The status counts still describe every quote of the picked customer.
    expect(list.counts).toMatchObject({all:31,sent:2,changes_requested:1,ready_for_review:1});
  });

  it('toggles to oldest clock first',async()=>{
    const list=await repQuoteList('brandi',{now:now(),attention:true,sort:'oldest'});
    expect(numbers(list.rows)).toEqual(['Q-24817','Q-24789','Q-24790']);
    expect(list.sort).toBe('oldest');
  });

  it('counts the quotes needing attention on every view, and other filters keep their newest-first order (OA-9)',async()=>{
    const all=await repQuoteList('brandi',{now:now()});
    expect(all).toMatchObject({attention:false,attention_count:3});
    const requested=all.rows.map(r=>r.requested_at);
    expect(requested).toEqual([...requested].sort().reverse());
    const sent=await repQuoteList('brandi',{now:now(),status:'sent',sort:'oldest'});
    expect(numbers(sent.rows)).toEqual(['Q-24791','Q-24789']);
    expect(sent.sort).toBe('urgent');
  });

  it('follows the Viewing picker',async()=>{
    expect((await repQuoteList('brandi',{now:now(),attention:true,customerId:'great-basin'})).rows).toEqual([]);
    expect(numbers((await repQuoteList('brandi',{now:now(),attention:true,customerId:'wasatch'})).rows)).toEqual(['Q-24790','Q-24817','Q-24789']);
    expect((await repQuoteList('nora',{now:now(),attention:true})).attention_count).toBe(0);
    // Mara's demo book (task F1): her Overdue draft and change request first, then Aging.
    const mara=await repQuoteList('mara',{now:now(),attention:true});
    expect(mara.rows.map(r=>r.aging!.level)).toEqual(['red','red','amber','amber']);
  });

  it('honours the supplier’s thresholds',async()=>{
    await setSettingFixture('aging_sent_amber_h','12');
    try{
      const list=await repQuoteList('brandi',{now:now(),attention:true});
      expect(numbers(list.rows)).toEqual(['Q-24790','Q-24817','Q-24789','Q-24791']);
    }finally{await setSettingFixture('aging_sent_amber_h',null);}
  });
});

describe('attentionOrder',()=>{
  const row=(quote_number:string,level:'amber'|'red',since:string,quoted_total:number|null)=>
    ({quote_number,quoted_total,aging:{level,since,reason:''}}) as unknown as RepQuoteRow;
  const rows=[row('A','amber','2026-10-01T00:00:00.000Z',500),row('B','red','2026-10-03T00:00:00.000Z',100),row('C','amber','2026-09-30T00:00:00.000Z',null),
    row('D','red','2026-10-02T00:00:00.000Z',900),row('E','amber','2026-10-04T00:00:00.000Z',700)];
  it('sorts red before amber, then quoted total descending, with no total last',()=>{
    expect(numbers(attentionOrder(rows,'urgent'))).toEqual(['D','B','E','A','C']);
  });
  it('sorts oldest clock start first',()=>{
    expect(numbers(attentionOrder(rows,'oldest'))).toEqual(['C','A','D','B','E']);
  });
  it('reads ?sort=oldest, and anything else as the default',()=>{
    expect(parseAttentionSort('oldest')).toBe('oldest');
    expect(parseAttentionSort('urgent')).toBe('urgent');
    expect(parseAttentionSort('newest')).toBe('urgent');
    expect(parseAttentionSort(null)).toBe('urgent');
  });
});

describe('the header badge counts red quotes only',()=>{
  it('adds attention beside the unread count (OA-8)',()=>{
    expect(repBadges('brandi',{now:now()})).toEqual({quotes:1,attention:2});
    expect(repBadges('nora',{now:now()})).toEqual({quotes:0,attention:0});
    // Mara's demo book (task F1): a new draft she hasn't opened; an Overdue draft and change request.
    expect(repBadges('mara',{now:now()})).toEqual({quotes:1,attention:2});
  });

  it('honours the supplier’s thresholds',async()=>{
    await setSettingFixture('aging_sent_red_h','90');
    try{expect(repBadges('brandi',{now:now()}).attention).toBe(3);}
    finally{await setSettingFixture('aging_sent_red_h',null);}
  });
});
