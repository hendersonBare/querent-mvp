import {describe,expect,it} from 'vitest';
import {access,accessCustomers,aggregateAccess,enabledCategories,isCategory,setAccess} from './access';
import {customerIds} from './accounts';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

describe('customer access toggles',()=>{
  it('recognises the four information categories',()=>{
    expect(['items_stock','pricing','orders_quotes','account'].every(isCategory)).toBe(true);
    expect(isCategory('financing')).toBe(false);
  });

  it('lists one customer\'s toggles with the assigned rep as the contact',()=>{
    expect(access('wasatch')).toContainEqual({category:'pricing',enabled:true,rep_id:'brandi',rep_name:'Brandi Gallegos',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'});
    expect(access('wasatch')).toHaveLength(4);
    expect(access('nobody')).toEqual([]);
  });

  it('reports every information category with the assigned rep as the contact',()=>{
    const rules=aggregateAccess(['wasatch']);
    expect(rules.map(r=>r.category)).toEqual(['items_stock','pricing','orders_quotes','account']);
    for(const r of rules)expect(r).toMatchObject({enabled:true,rep_id:'brandi',rep_name:'Brandi Gallegos',mixed_rep:false});
  });

  it('shows Multiple reps when the selected customers have different reps',()=>{
    expect(aggregateAccess(customerIds())[0]).toMatchObject({enabled:true,mixed_rep:true,rep_name:'Multiple reps',rep_id:null,phone:null});
  });

  it('turns an information category off and on for one customer',()=>{
    setAccess('wasatch','pricing',false);
    expect(enabledCategories('wasatch').has('pricing')).toBe(false);
    expect(enabledCategories('great-basin').has('pricing')).toBe(true);
    expect(aggregateAccess(customerIds()).find(r=>r.category==='pricing')?.enabled).toBeNull();
    setAccess('wasatch','pricing',true);
    expect(enabledCategories('wasatch').has('pricing')).toBe(true);
  });

  it('turns a category off for every customer when the scope is all',()=>{
    setAccess(null,'account',false);
    expect(aggregateAccess(customerIds()).find(r=>r.category==='account')?.enabled).toBe(false);
    setAccess(null,'account',true);
    expect(aggregateAccess(customerIds()).find(r=>r.category==='account')?.enabled).toBe(true);
  });
});

describe('customers by access state (Settings > Customer access filter, plan U8)',()=>{
  const ALL_ON={items_stock:true,pricing:true,orders_quotes:true,account:true};

  it('lists every customer by name with their account number and one switch per data type',()=>{
    const rows=accessCustomers();
    expect(rows.map(r=>[r.name,r.account_number])).toEqual([
      ['Canyon Ridge Builders','CRB-3318'],['Great Basin Fabrication','GBF-2207'],['Uinta Facility Services','UFS-4051'],
      ['Utah Valley Electric','UVE-5126'],['Wasatch Mechanical Contractors','WAS-1142'],['Weber Basin Fabricators','WBF-6074'],
    ]);
    expect(rows.every(r=>JSON.stringify(r.access)===JSON.stringify(ALL_ON))).toBe(true);
  });

  it('keeps the customers whose data types match: answers (on) or not shared (off), every type given at once',()=>{
    setAccess('great-basin','pricing',false);
    setAccess('uinta-facility','pricing',false);
    setAccess('uinta-facility','account',false);
    try{
      expect(accessCustomers({pricing:'not_shared'}).map(r=>r.id)).toEqual(['great-basin','uinta-facility']);
      expect(accessCustomers({pricing:'not_shared'})[0].access).toEqual({...ALL_ON,pricing:false});
      expect(accessCustomers({pricing:'not_shared',account:'answers'}).map(r=>r.id)).toEqual(['great-basin']);
      expect(accessCustomers({pricing:'answers'}).map(r=>r.id)).toEqual(['canyon-ridge','utah-valley-electric','wasatch','weber-basin']);
      expect(accessCustomers({items_stock:'not_shared'})).toEqual([]);
    }finally{
      setAccess(null,'pricing',true);
      setAccess(null,'account',true);
    }
  });

  it('narrows by a search on the name or account number, any case, with % and _ taken literally',()=>{
    expect(accessCustomers({q:'basin'}).map(r=>r.id)).toEqual(['great-basin','weber-basin']);
    expect(accessCustomers({q:'ufs-40'}).map(r=>r.id)).toEqual(['uinta-facility']);
    expect(accessCustomers({q:'  Wasatch  '}).map(r=>r.id)).toEqual(['wasatch']);
    expect(accessCustomers({q:'%'})).toEqual([]);
    expect(accessCustomers({q:'_'})).toEqual([]);
    expect(accessCustomers({q:'basin',items_stock:'answers'}).map(r=>r.id)).toEqual(['great-basin','weber-basin']);
  });
});
