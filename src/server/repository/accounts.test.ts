import {describe,expect,it} from 'vitest';
import {accountSummary,assignedRep,contact,contacts,customerAccount,customerDirectory,customerIds,customers,customerStats,deliveryAddress,departments,rep,reps,setAssignedRep,supplier} from './accounts';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

const BRANDI={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'};

describe('supplier and customers',()=>{
  it('returns Herrick as the supplier',()=>{
    expect(supplier()).toMatchObject({id:'herrick',name:'Herrick Industrial Supply',phone:'(801) 555-0100'});
  });

  it('lists Wasatch and the placeholder customers by name, each with its one rep',()=>{
    expect(customers()).toEqual([
      {id:'canyon-ridge',name:'Canyon Ridge Builders',account_number:'CRB-3318',rep_id:'mara',rep_name:'Mara Jensen'},
      {id:'great-basin',name:'Great Basin Fabrication',account_number:'GBF-2207',rep_id:'brandi',rep_name:'Brandi Gallegos'},
      {id:'uinta-facility',name:'Uinta Facility Services',account_number:'UFS-4051',rep_id:'nora',rep_name:'Nora Chen'},
      {id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',rep_id:'brandi',rep_name:'Brandi Gallegos'},
    ]);
    expect(customerIds()).toEqual(customers().map(c=>c.id));
  });

  it('gives the ship-to on file as one line for delivery, or null without one (task 2.3)',()=>{
    expect(deliveryAddress('wasatch')).toBe('1800 W 10950 S, South Jordan, UT 84095');
    expect(deliveryAddress('great-basin')).toBeNull();
    expect(deliveryAddress('nobody')).toBeNull();
  });

  it('returns the full Wasatch account with ship-to and rep',()=>{
    expect(customerAccount('wasatch')).toEqual({
      id:'wasatch',account_number:'WAS-1142',name:'Wasatch Mechanical Contractors',terms:'Net 30',credit_limit:50000,open_balance:18420,past_due_balance:0,
      tax_status:'taxable',tax_state:'UT',price_level_id:'contractor-2',main_phone:'(801) 555-0148',
      ship_to:{name:'Wasatch Mechanical Contractors, main yard',address:'1800 W 10950 S',city:'South Jordan',state:'UT',zip:'84095',lat:40.5513,lng:-111.933},
      rep:BRANDI,
    });
  });

  it('returns a placeholder customer with only name, account and rep',()=>{
    expect(customerAccount('great-basin')).toMatchObject({account_number:'GBF-2207',terms:null,credit_limit:null,open_balance:null,price_level_id:null,ship_to:null,rep:BRANDI});
    expect(customerAccount('nobody')).toBeUndefined();
  });

  it('gives the customer-safe account summary',()=>{
    expect(accountSummary('wasatch')).toEqual({customer_id:'wasatch',account_number:'WAS-1142',name:'Wasatch Mechanical Contractors',terms:'Net 30',credit_limit:50000,open_balance:18420,past_due_balance:0,tax_status:'taxable',rep:BRANDI});
    expect(accountSummary('nobody')).toBeUndefined();
  });

  it('reports the last order and the quote win rate (lost quotes are stored as expired)',()=>{
    expect(customerStats('wasatch')).toEqual({customer_id:'wasatch',last_order:{order_number:'SO-51223',order_date:'2026-09-09',total:698.22},quotes_accepted:17,quotes_lost:7,win_rate:17/24});
    expect(customerStats('great-basin')).toEqual({customer_id:'great-basin',last_order:null,quotes_accepted:0,quotes_lost:0,win_rate:null});
  });

});

describe('contacts and departments',()=>{
  it('lists the customer\'s contacts, primary first',()=>{
    expect(contacts('wasatch')).toEqual([{id:'dana',customer_id:'wasatch',name:'Dana Ortiz',title:'Purchasing',phone:'(801) 555-0142',email:'dana.ortiz@wasatchmechanical.example',is_primary:true}]);
    expect(contacts('great-basin')).toEqual([]);
    expect(contact('dana')?.name).toBe('Dana Ortiz');
    expect(contact('nobody')).toBeUndefined();
  });

  it('lists the static departments in sidebar order',()=>{
    expect(departments().map(d=>d.name)).toEqual(['Customer Service','Accounts Receivable / Finance','Warehouse / Will-call · SLC','Warehouse / Will-call · Ogden','Warehouse / Will-call · Provo']);
    expect(departments()[2]).toMatchObject({branch_id:'slc',phone:'(801) 555-0120',email:null});
  });
});

describe('reps and assignments',()=>{
  it('lists reps and finds one',()=>{
    expect(reps().map(r=>r.initials)).toEqual(['BG','EP','MJ','NC']);
    expect(rep('brandi')).toEqual(BRANDI);
    expect(rep('nobody')).toBeUndefined();
  });

  it('returns the customer\'s one assigned rep',()=>{
    expect(assignedRep('wasatch')).toEqual(BRANDI);
    expect(assignedRep('nobody')).toBeUndefined();
  });

  it('reassigns a customer to another rep (one rep per customer)',()=>{
    expect(setAssignedRep('great-basin','eli')).toBe(true);
    expect(assignedRep('great-basin')?.name).toBe('Eli Porter');
    expect(customers().filter(c=>c.id==='great-basin')).toHaveLength(1);
    expect(setAssignedRep('great-basin','nobody')).toBe(false);
    expect(setAssignedRep('nobody','eli')).toBe(false);
    expect(setAssignedRep('great-basin','brandi')).toBe(true);
  });
});

describe('customer directory (rep Customers list, task 3.8)',()=>{
  it('lists every customer by name with its rep, terms, balance and activity counts',()=>{
    expect(customerDirectory()).toEqual([
      {id:'canyon-ridge',name:'Canyon Ridge Builders',account_number:'CRB-3318',rep_id:'mara',rep_name:'Mara Jensen',terms:null,credit_limit:null,open_balance:null,order_count:0,last_order_date:null,quote_count:0},
      {id:'great-basin',name:'Great Basin Fabrication',account_number:'GBF-2207',rep_id:'brandi',rep_name:'Brandi Gallegos',terms:null,credit_limit:null,open_balance:null,order_count:0,last_order_date:null,quote_count:0},
      {id:'uinta-facility',name:'Uinta Facility Services',account_number:'UFS-4051',rep_id:'nora',rep_name:'Nora Chen',terms:null,credit_limit:null,open_balance:null,order_count:0,last_order_date:null,quote_count:0},
      // 24 quotes of history plus the sample Q-24817; 23 orders (17 won quotes and 6 direct orders).
      {id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',rep_id:'brandi',rep_name:'Brandi Gallegos',terms:'Net 30',credit_limit:50000,open_balance:18420,order_count:23,last_order_date:'2026-09-09',quote_count:28}, // 28: with the 3 aging quotes (task A2)
    ]);
    expect(customerDirectory().map(({id,name,account_number,rep_id,rep_name})=>({id,name,account_number,rep_id,rep_name}))).toEqual(customers());
  });

  it('carries no cost, margin or price-level fields',()=>{
    for(const row of customerDirectory())expect(Object.keys(row).filter(k=>/cost|margin|price/.test(k))).toEqual([]);
  });
});

describe('declined quotes (task A1; last: it adds a quote to the shared database)',()=>{
  it('counts a declined quote as decided and lost, like quoteOutcome (task A1)',async()=>{
    const {declineQuote,duplicateQuote,sendQuote}=await import('@/server/quotes/service');
    const copy=duplicateQuote('Q-24817',{repId:'brandi',now:'2026-09-23T15:00:00.000Z'});
    await sendQuote(copy.id,{repId:'brandi',now:'2026-09-23T16:00:00.000Z'});
    declineQuote('wasatch',copy.id,{revision:1,reason:'price_too_high',now:'2026-09-24T15:00:00.000Z'});
    expect(customerStats('wasatch')).toMatchObject({quotes_accepted:17,quotes_lost:8,win_rate:17/25});
  });
});
