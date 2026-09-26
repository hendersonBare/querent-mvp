import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,beforeAll,describe,expect,it} from 'vitest';

let root='';
beforeAll(()=>{root=mkdtempSync(join(tmpdir(),'querent-repo-'));process.env.DATABASE_PATH=join(root,'test.sqlite');process.env.QUERENT_SEED_DATE='2026-09-23';});
afterAll(async()=>{const {closeDatabase}=await import('./db');closeDatabase();rmSync(root,{recursive:true,force:true});delete process.env.DATABASE_PATH;delete process.env.QUERENT_SEED_DATE;});
const repo=()=>import('./repository');

describe('repository on the Query to Quote seed',()=>{
  it('lists Wasatch and the placeholder customers',async()=>{
    const {customers,customerIds}=await repo();
    expect(customers().map(c=>c.name)).toEqual(['Canyon Ridge Builders','Great Basin Fabrication','Uinta Facility Services','Wasatch Mechanical Contractors']);
    expect(customerIds()).toEqual(customers().map(c=>c.id));
  });

  it('returns the customer\'s one assigned rep',async()=>{
    const {assignedRep,reps}=await repo();
    expect(assignedRep('wasatch')).toMatchObject({name:'Brandi Gallegos',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'});
    expect(assignedRep('nobody')).toBeUndefined();
    expect(reps().map(r=>r.initials)).toEqual(['BG','EP','MJ','NC']);
  });

  it('reports every information category with the assigned rep as the contact',async()=>{
    const {aggregateAccess}=await repo();
    const rules=aggregateAccess(['wasatch']);
    expect(rules.map(r=>r.category)).toEqual(['items_stock','pricing','orders_quotes','account']);
    for(const r of rules)expect(r).toMatchObject({enabled:true,rep_id:'brandi',rep_name:'Brandi Gallegos',mixed_rep:false});
  });

  it('shows Multiple reps when the selected customers have different reps',async()=>{
    const {aggregateAccess,customerIds}=await repo();
    expect(aggregateAccess(customerIds())[0]).toMatchObject({enabled:true,mixed_rep:true,rep_name:'Multiple reps'});
  });

  it('turns an information category off and on for one customer',async()=>{
    const {enabledCategories,setAccess,aggregateAccess,customerIds}=await repo();
    setAccess('wasatch','pricing',false);
    expect(enabledCategories('wasatch').has('pricing')).toBe(false);
    expect(aggregateAccess(customerIds()).find(r=>r.category==='pricing')?.enabled).toBeNull();
    setAccess('wasatch','pricing',true);
    expect(enabledCategories('wasatch').has('pricing')).toBe(true);
  });

  it('browses the catalog with stock by branch',async()=>{
    const {browse}=await repo();
    const page=browse(null,'items_stock',1,10);
    expect(page.total).toBe(62);expect(page.rows).toHaveLength(10);
    expect(page.rows[0]).toMatchObject({sku:'ANC-12-414-W',category:'Fasteners'});
    expect(page.rows[0].available).toBe('SLC 30 · Ogden 12 · Provo 9');
  });

  it('browses customer records, empty for placeholder customers',async()=>{
    const {browse}=await repo();
    expect(browse('wasatch','orders_quotes',1,5).total).toBe(23);
    expect(browse('wasatch','orders_quotes',1,5).rows[0]).toMatchObject({order_number:'SO-51223',status:'shipped'});
    expect(browse('great-basin','orders_quotes',1,5).total).toBe(0);
    expect(browse('wasatch','pricing',1,5).total).toBe(62);
    expect(browse('great-basin','pricing',1,5).total).toBe(0);
    expect(browse(null,'account',1,10).total).toBe(4);
    expect(browse('wasatch','account',1,10).rows[0]).toMatchObject({account_number:'WAS-1142',rep:'Brandi Gallegos'});
  });

  it('counts seeded chat questions by information category',async()=>{
    const {analytics}=await repo();
    const wasatch=analytics('wasatch');
    expect(wasatch.total_queries).toBe(40);
    expect(wasatch.categories.map(c=>c.category)).toEqual(['items_stock','pricing','orders_quotes','account']);
    expect(wasatch.categories.every(c=>c.count>0)).toBe(true);
    expect(Number(wasatch.hours_saved)).toBeGreaterThan(0);
    expect(analytics('great-basin').total_queries).toBe(0);
    expect(analytics(null).total_queries).toBe(40);
  });

  it('logs a chat question and returns it in that conversation\'s history',async()=>{
    const {appendLog,history}=await repo();
    appendLog({customerId:'wasatch',conversationId:'conv-test',question:'Q?',categories:['items_stock'],handled:['items_stock'],toolCalls:['search_items'],rowCount:1,latency:12,outcome:'answered',answer:'A.'});
    expect(history('wasatch','conv-test')).toEqual([expect.objectContaining({question:'Q?',answer:'A.',categories:['items_stock'],outcome:'answered',sql:null})]);
    expect(history('great-basin','conv-test')).toEqual([]);
  });
});
