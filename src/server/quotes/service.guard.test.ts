import {describe,expect,it,vi} from 'vitest';
import * as repository from '@/server/repository';
import {useSeededDatabase} from '@/server/repository/test-db';
import {acceptQuote,expireQuote,requestChanges,sendQuote} from './service';

// The expected-status guard (spec §7.2: a concurrent transition). Within one process the
// services read and write in a single transaction, so to model another process moving the quote
// between our read and our write, `quote()` hands the service a stale copy once. The write
// (saveQuoteTransition, guarded on the status read) must then change nothing, and the service
// must report a conflict and roll back its revision and Activity writes.

vi.mock('@/server/repository',async importOriginal=>{
  const actual=await importOriginal<typeof import('@/server/repository')>();
  return {...actual,quote:vi.fn(actual.quote)};
});

useSeededDatabase();

const {quote:realQuote}=await vi.importActual<typeof import('@/server/repository')>('@/server/repository');

const SEND='2026-09-23T17:00:00.000Z';
const counts=(id:string)=>({revisions:repository.quoteRevisions(id).length,activity:repository.quoteActivity(id).length});
/** The next quote() read of `id` returns what it was before `move` ran. */
function staleOnce(id:string,move:()=>void){
  const stale=repository.quote(id)!;
  move();
  vi.mocked(repository.quote).mockImplementationOnce(quoteId=>quoteId===id?stale:realQuote(quoteId));
  return stale;
}
const newQuote=()=>repository.createQuote({customerId:'wasatch',contactId:'dana',fulfillment:'will_call',branchId:'slc',at:'2026-09-23T16:00:00.000Z',
  lines:[{itemId:'HCS-12-13-2G8',qty:10,unitPrice:31.5}]});

describe('expected-status guard',()=>{
  it('refuses an Accept decided on a stale read: the customer requested changes in between',async()=>{
    const q=(await sendQuote(newQuote().id,{repId:'brandi',now:SEND})).quote;
    staleOnce(q.id,()=>requestChanges('wasatch',q.id,{revision:1,note:'Different gloves',now:'2026-09-24T09:00:00.000Z'}));
    const before=counts(q.id);
    expect(()=>acceptQuote('wasatch',q.id,{revision:1,fulfillmentTime:'2026-09-25T15:00',customerPo:'7781',now:'2026-09-24T09:00:01.000Z'}))
      .toThrow(expect.objectContaining({code:'conflict'}));
    expect(repository.quote(q.id)).toMatchObject({status:'changes_requested',customer_po:null,change_request_note:'Different gloves'});
    expect(counts(q.id)).toEqual(before);
  });

  it('refuses an expiry decided on a stale read: the customer accepted in between',async()=>{
    const q=(await sendQuote(newQuote().id,{repId:'brandi',now:SEND})).quote;
    staleOnce(q.id,()=>acceptQuote('wasatch',q.id,{revision:1,fulfillmentTime:'2026-09-25',customerPo:'7781',now:'2026-10-07T23:00:00.000Z'}));
    const before=counts(q.id);
    expect(()=>expireQuote(q.id,{now:'2026-10-08T00:00:00.000Z'})).toThrow(expect.objectContaining({code:'conflict'}));
    expect(repository.quote(q.id)?.status).toBe('accepted');
    expect(counts(q.id)).toEqual(before);
  });

  it('refuses a send decided on a stale read, storing no revision or Activity',async()=>{
    const q=newQuote();
    // Another process sent it (rev 1) between our transaction's read and its guarded write.
    const other=repository.saveQuoteTransition(q.id,{from:'ready_for_review',to:'sent',revision:1,sentAt:SEND,validUntil:'2026-10-07',at:q.updated_at});
    expect(other).toBe(true);
    const stale=repository.quote(q.id)!;
    vi.mocked(repository.quote).mockImplementation(id=>id===q.id?{...stale,status:'ready_for_review',revision:0}:realQuote(id));
    try{
      await expect(sendQuote(q.id,{repId:'brandi',now:SEND})).rejects.toMatchObject({code:'conflict'});
    }finally{vi.mocked(repository.quote).mockImplementation(realQuote);}
    expect(counts(q.id)).toEqual({revisions:0,activity:0});
  });
});
