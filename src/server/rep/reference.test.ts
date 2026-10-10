import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createQuote,quote} from '@/server/repository';
import {sendQuote} from '@/server/quotes/service';
import {useSeededDatabase} from '@/server/repository/test-db';

// The rep portal's Customers, Orders and Items views (task 3.8) against the seed pinned to the mockup's day.
useSeededDatabase();

const session=vi.hoisted(()=>({persona:undefined as string|undefined}));
vi.mock('next/headers',()=>({cookies:async()=>({get:(name:string)=>name==='querent-persona'&&session.persona?{value:session.persona}:undefined})}));

const {RECENT,customerDetail,customerList,detailTitle,itemDetail,itemList,pickedCustomer}=await import('./reference');

const NOW='2026-09-23T18:00:00.000Z';
/** Every key anywhere in `value`, for "no cost or margin" checks. */
const keysOf=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keysOf):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keysOf(v)]):[];
const costly=(value:unknown)=>keysOf(value).filter(k=>/cost|margin|floor|price_basis|suggested/i.test(k));

describe('pickedCustomer: the "Viewing" picker from searchParams',()=>{
  it('reads ?customer=, and treats all, an unknown id or a repeated param as All customers',()=>{
    expect(pickedCustomer({})).toEqual({customerId:null,customer:null,label:'All customers'});
    expect(pickedCustomer({customer:'wasatch'})).toEqual({customerId:'wasatch',label:'Wasatch Mechanical Contractors',
      customer:{id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',rep_id:'brandi',rep_name:'Brandi Gallegos'}});
    expect(pickedCustomer({customer:'all'}).customerId).toBeNull();
    expect(pickedCustomer({customer:'nobody'}).customerId).toBeNull();
    expect(pickedCustomer({customer:['wasatch','great-basin']}).customerId).toBeNull();
  });
});

describe('detailTitle',()=>{
  beforeEach(()=>{session.persona=undefined;});
  it('names the record for a rep only; anyone else gets the section name',async()=>{
    const name=vi.fn(()=>'Wasatch Mechanical Contractors');
    expect(await detailTitle('Customers',name)).toBe('Customers');
    session.persona='customer';
    expect(await detailTitle('Customers',name)).toBe('Customers');
    expect(name).not.toHaveBeenCalled();
    session.persona='supplier';
    expect(await detailTitle('Customers',name)).toBe('Wasatch Mechanical Contractors');
    expect(await detailTitle('Customers',()=>undefined)).toBe('Customers');
  });
});

describe('customerList',()=>{
  it('lists every customer by name, or only the picked one',()=>{
    expect(customerList().map(c=>c.id)).toEqual(['canyon-ridge','great-basin','uinta-facility','utah-valley-electric','wasatch','weber-basin']);
    expect(customerList('great-basin')).toEqual([expect.objectContaining({id:'great-basin',rep_name:'Brandi Gallegos',order_count:0,quote_count:0,terms:null})]);
    expect(customerList('nobody')).toEqual([]);
  });
});

describe('customerDetail',()=>{
  it('gathers Wasatch\'s account, rep, contacts, win rate and newest orders and quotes',()=>{
    const view=customerDetail('wasatch',{now:NOW})!;
    expect(view.account).toMatchObject({name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',terms:'Net 30',credit_limit:50000,open_balance:18420,tax_status:'taxable',
      rep:{name:'Brandi Gallegos',phone:'(801) 111-2222'},ship_to:{address:'1800 W 10950 S',city:'South Jordan'}});
    expect(view.on_file).toBe(true);
    expect(view.credit_used).toBeCloseTo(0.3684,4);
    expect(view.contacts.map(c=>c.name)).toEqual(['Dana Ortiz']);
    // 17 of 24 seeded quotes won (spec §2, seed history).
    expect([view.quotes_won,view.quotes_decided]).toEqual([17,24]);
    expect(view.win_rate).toBeCloseTo(17/24);

    expect(view.orders.count).toBe(23);
    expect(view.orders.recent.map(o=>o.order_number)).toEqual(['SO-51223','SO-51222','SO-51221','SO-51220','SO-51219']);
    expect(view.orders.recent).toHaveLength(RECENT);

    expect(view.quotes.count).toBe(28);
    // The seed's three aging quotes (task A2) are dated from the reset time, so they are the newest.
    expect(view.quotes.recent.slice(0,3).map(q=>q.quote_number)).toEqual(['Q-24791','Q-24790','Q-24789']);
    expect(view.quotes.recent[3]).toEqual({id:'q-24817',quote_number:'Q-24817',revision:0,status:'ready_for_review',requested_at:expect.any(String),sent_total:null,rep_name:'Brandi Gallegos',line_count:4});
    expect(view.quotes.recent[4]).toMatchObject({quote_number:'Q-24816',revision:1,status:'accepted',sent_total:expect.any(Number)});
    expect(view.quotes.recent).toHaveLength(RECENT);
  });

  it('shows a placeholder customer\'s rep with empty account, orders and quotes',()=>{
    const view=customerDetail('great-basin',{now:NOW})!;
    expect(view.account).toMatchObject({name:'Great Basin Fabrication',account_number:'GBF-2207',terms:null,credit_limit:null,ship_to:null,rep:{name:'Brandi Gallegos'}});
    expect(view.on_file).toBe(false);
    expect(view.credit_used).toBeNull();
    expect(view.contacts).toEqual([]);
    expect(view.win_rate).toBeNull();
    expect(view.orders).toEqual({count:0,recent:[]});
    expect(view.quotes).toEqual({count:0,recent:[]});
    expect(customerDetail('canyon-ridge',{now:NOW})?.account.rep?.name).toBe('Mara Jensen');
  });

  it('is undefined for an unknown customer',()=>{
    expect(customerDetail('nobody',{now:NOW})).toBeUndefined();
  });

  it('never carries cost or margin',()=>{
    expect(costly(customerDetail('wasatch',{now:NOW}))).toEqual([]);
    expect(costly(customerList())).toEqual([]);
  });
});

describe('itemList',()=>{
  it('lists the whole catalog in category order with stock at SLC, Ogden and Provo',()=>{
    const list=itemList();
    expect(list.branches.map(b=>b.code)).toEqual(['SLC','Ogden','Provo']);
    expect(list.category).toBeNull();
    expect(list.categories.map(c=>c.name)).toEqual(['Fasteners','Abrasives & Cutting','Safety & PPE','Material Handling & Tie-downs','Tools','Janitorial/MRO']);
    expect(list.categories.reduce((sum,c)=>sum+c.count,0)).toBe(list.items.length);
    expect(list.items.length).toBeGreaterThanOrEqual(60);
    const bolts=list.items.find(i=>i.sku==='HCS-12-13-2G8')!;
    expect(bolts).toMatchObject({description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',category_name:'Fasteners',pack:'Box of 50',case_qty:10,list_price:38.95,total_available:94});
    expect(bolts.stock.map(s=>[s.branch_code,s.available])).toEqual([['SLC',64],['Ogden',22],['Provo',8]]);
    expect(list.items[0].category_id).toBe('fasteners');
    expect(list.items.at(-1)?.category_id).toBe('janitorial');
  });

  it('narrows to one category; an unknown category shows everything',()=>{
    const abrasives=itemList({category:'abrasives'});
    expect(abrasives.category).toEqual({id:'abrasives',name:'Abrasives & Cutting',sort_order:expect.any(Number)});
    expect(abrasives.items.length).toBe(abrasives.categories.find(c=>c.id==='abrasives')!.count);
    expect(new Set(abrasives.items.map(i=>i.category_id))).toEqual(new Set(['abrasives']));
    expect(itemList({category:'nope'})).toEqual(itemList());
  });

  it('never carries cost',()=>{
    expect(costly(itemList())).toEqual([]);
    expect(keysOf(itemList().items[0])).not.toContain('keywords');
  });
});

describe('itemDetail',()=>{
  it('finds an item by id or SKU with stock per branch and every customer\'s recent sales',()=>{
    const view=itemDetail('hcs-12-13-2g8')!;
    expect(view.item).toMatchObject({sku:'HCS-12-13-2G8',total_available:94});
    expect(view.branches.map(b=>b.name)).toEqual(['Salt Lake City','Ogden','Provo']);
    expect(view.sales.map(s=>[s.order_number,s.qty,s.unit_price])).toEqual([['SO-51221',10,31.5],['SO-51213',12,30.4],['SO-51209',8,29.8],['SO-51204',10,29.5],['SO-51201',10,29.5]]);
    expect(itemDetail('HCS-12-13-2G8',{customerId:'wasatch'})?.sales).toEqual(view.sales);
  });

  it('shows only the picked customer\'s sales, and is undefined for an unknown item',()=>{
    expect(itemDetail('HCS-12-13-2G8',{customerId:'great-basin'})?.sales).toEqual([]);
    expect(itemDetail('RS-2-27-JH')?.sales).toEqual([]);
    expect(itemDetail('NOPE-1')).toBeUndefined();
  });

  it('never carries cost',()=>{
    expect(costly(itemDetail('HCS-12-13-2G8'))).toEqual([]);
  });
});

describe('customerDetail stores lazy expiry first (statuses match the Quotes list)',()=>{
  it('expires an overdue sent quote before listing it, so its status and the win rate agree',async()=>{
    const q=createQuote({customerId:'wasatch',contactId:'dana',fulfillment:'will_call',branchId:'slc',at:'2026-09-23T16:00:00.000Z',
      lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5,priceBasis:'last_paid'}]});
    await sendQuote(q.id,{repId:'brandi',now:'2026-09-23T17:00:00.000Z'});
    const later='2026-10-08T00:00:00.000Z';
    const view=customerDetail('wasatch',{now:later})!;
    expect(quote(q.id)?.status).toBe('expired');
    expect(view.quotes.recent.find(r=>r.id===q.id)).toMatchObject({status:'expired',revision:1,sent_total:315});
    expect([view.quotes_won,view.quotes_decided]).toEqual([17,25]);
  });
});

describe('declined quotes (task A1; last: it adds a quote to the shared database)',()=>{
  it('counts a declined quote as decided and lost in the win rate (task A1)',async()=>{
    const {declineQuote,duplicateQuote}=await import('@/server/quotes/service');
    const before=customerDetail('wasatch',{now:NOW})!;
    const copy=duplicateQuote('Q-24817',{repId:'brandi',now:'2026-09-22T15:00:00.000Z'});
    await sendQuote(copy.id,{repId:'brandi',now:'2026-09-22T16:00:00.000Z'});
    declineQuote('wasatch',copy.id,{revision:1,reason:null,now:'2026-09-23T15:00:00.000Z'});
    const view=customerDetail('wasatch',{now:NOW})!;
    expect([view.quotes_won,view.quotes_decided]).toEqual([before.quotes_won,before.quotes_decided+1]);
    expect(view.win_rate).toBeCloseTo(before.quotes_won/(before.quotes_decided+1));
    // The seed's aging quotes (task A2) are newer than the copy, so it is counted but not among the five most recent.
    expect(view.quotes.count).toBe(before.quotes.count+1);
    expect(quote(copy.id)).toMatchObject({quote_number:copy.quote_number,status:'declined'});
  });
});
