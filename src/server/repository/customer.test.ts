import {describe,expect,it} from 'vitest';
import * as customer from './customer';
import * as internal from './index';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

// Customer-safe guard (task 0.3): nothing the customer module returns may carry cost, margin,
// floors, Querent's pricing notes or internal notes. Checked at runtime against the seed, and at
// compile time on the return types (npm run typecheck).

const FORBIDDEN=/cost|margin|floor|suggest|explanation|internal/i;
/**
 * The item pop-up's "Frequently bought together" (task E1, decision 37) is customer-facing by design:
 * these two payload keys pass "suggest" (which is here for suggested_price); what they hold is scanned.
 */
const CUSTOMER_KEYS=new Set(['suggestions','suggestions_offered']);
const ON='2026-09-23';

/** Every key path in `value` whose key looks internal. */
function leaks(value:unknown,path='$'):string[]{
  if(value instanceof Set||value instanceof Map)return leaks([...value.values()],path);
  if(Array.isArray(value))return value.flatMap((v,i)=>leaks(v,`${path}[${i}]`));
  if(value&&typeof value==='object')return Object.entries(value).flatMap(([k,v])=>[...(FORBIDDEN.test(k)&&!CUSTOMER_KEYS.has(k)?[`${path}.${k}`]:[]),...leaks(v,`${path}.${k}`)]);
  return [];
}

const ALL_ITEMS=()=>customer.catalogItems().map(i=>i.id);
/** One representative call per export, on data that exists, so every field is present. */
const calls:Record<keyof typeof customer,()=>unknown>={
  access:()=>customer.access('wasatch'),
  enabledCategories:()=>customer.enabledCategories('wasatch'),
  isCategory:()=>customer.isCategory('pricing'),
  accountSummary:()=>customer.accountSummary('wasatch'),
  assignedRep:()=>customer.assignedRep('wasatch'),
  deliveryAddress:()=>customer.deliveryAddress('wasatch'),
  departments:()=>customer.departments(),
  supplier:()=>customer.supplier(),
  branches:()=>customer.branches(),
  catalogItem:()=>customer.catalogItem('HCS-12-13-2G8'),
  catalogItems:()=>customer.catalogItems(),
  productCategories:()=>customer.productCategories(),
  stockForItems:()=>customer.stockForItems(ALL_ITEMS()),
  addMessage:()=>customer.addMessage('wasatch','conv-q-24817',{role:'assistant',kind:'item_popup',content:'Here is your list.',payload:{lines:[{sku:'RS-2-27-JH',qty:12}]}}),
  appendLog:()=>customer.appendLog({customerId:'wasatch',conversationId:'conv-q-24817',question:'Q?',categories:['pricing'],handled:['pricing'],toolCalls:['get_price'],rowCount:1,latency:5,outcome:'answered',answer:'A.'}),
  conversation:()=>customer.conversation('wasatch','conv-q-24817'),
  conversationMessages:()=>customer.conversationMessages('wasatch','conv-q-24817'),
  createConversation:()=>customer.createConversation({customerId:'wasatch',contactId:'dana'}),
  history:()=>customer.history('wasatch','history-1'),
  quoteNotices:()=>{
    // The seed has no quote_ready message: post one as Approve & send does (task 3.7), with internal-looking extras it must drop.
    customer.addMessage('wasatch','conv-q-24817',{role:'system',kind:'quote_ready',content:'Hi Dana',payload:{quote_id:'q-24816',quote_number:'Q-24816',revision:1,total:655.25,
      valid_until:'2026-09-24',headline:'Quote Q-24816 is ready: $655.25, valid until Sep 24',attach_pdf:true,pdf_url:'/api/quotes/q-24816/pdf?variant=customer&rev=1',unit_cost:1,internal_notes:'x'}});
    return customer.quoteNotices('wasatch');
  },
  order:()=>customer.order('wasatch','SO-51223'),
  orderHistory:()=>customer.orderHistory('wasatch'),
  orders:()=>customer.orders('wasatch'),
  orderStatus:()=>customer.orderStatus('wasatch'),
  purchasedItems:()=>customer.purchasedItems('wasatch'),
  coPurchases:()=>customer.coPurchases('wasatch','CW-45-045-T1'),
  customerPrices:()=>customer.customerPrices('wasatch',ALL_ITEMS(),ON),
  customerQuote:()=>customer.customerQuote('wasatch','Q-24816'),
  customerQuoteRevision:()=>customer.customerQuoteRevision('wasatch','Q-24816'),
  customerQuotes:()=>customer.customerQuotes('wasatch'),
  markCustomerViewed:()=>customer.markCustomerViewed('wasatch','Q-24816'),
};
const RETURNS_NOTHING=new Set(['isCategory']);

describe('customer-safe repository module',()=>{
  it('has a guard call for every export',()=>{
    expect(Object.keys(customer).sort()).toEqual(Object.keys(calls).sort());
  });

  it.each(Object.entries(calls))('%s returns data without cost, margin or internal notes',(name,call)=>{
    const result=call();
    if(!RETURNS_NOTHING.has(name)){
      expect(result).toBeTruthy();
      if(Array.isArray(result)||result instanceof Set)expect([...result].length).toBeGreaterThan(0);
    }
    expect(leaks(result)).toEqual([]);
  });

  it('exports only functions that are also in the internal API',()=>{
    for(const [name,fn] of Object.entries(customer))expect(internal[name as keyof typeof internal]).toBe(fn);
  });

  it('is checked by a scanner that does catch internal fields',()=>{
    expect(leaks(internal.priceSources('wasatch',['HCS-12-13-2G8'],ON))).toEqual(['$[0].cost']);
    expect(leaks(internal.quote('q-24817'))).toEqual(expect.arrayContaining(['$.lines[0].unit_cost','$.lines[0].suggested_price','$.lines[0].explanation']));
    expect(leaks(internal.quotes()[0])).toEqual(expect.arrayContaining(['$.cost_total','$.margin']));
    expect(leaks(internal.repFloors('brandi'))).toContain('$[0].margin_floor');
    expect(leaks(new Set([{unit_cost:1}]))).toEqual(['$[0].unit_cost']);
    expect(leaks({suggestions:[{sku:'HN-12-13-G8',suggested_price:1}],suggestions_offered:1})).toEqual(['$.suggestions[0].suggested_price']);
  });
});

// Compile-time twin of the runtime scan: every key reachable from a customer function's return type.
type Keys<T>=T extends readonly (infer U)[]?Keys<U>:T extends Set<infer U>?Keys<U>:T extends object?{[K in keyof T]-?:(K&string)|Keys<T[K]>}[keyof T]:never;
type CustomerKeys={[F in keyof typeof customer]:(typeof customer)[F] extends (...args:never[])=>infer R?Keys<R>:never}[keyof typeof customer];
type Forbidden=`${string}${'cost'|'margin'|'floor'|'suggest'|'explanation'|'internal'}${string}`;
const noInternalKeys:[Extract<Exclude<CustomerKeys,'suggestions'|'suggestions_offered'>,Forbidden>] extends [never]?true:false=true;
void noInternalKeys;
