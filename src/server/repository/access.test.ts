import {describe,expect,it} from 'vitest';
import {access,aggregateAccess,enabledCategories,isCategory,setAccess} from './access';
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
