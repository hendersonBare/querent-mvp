// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {setRepFixture,useSeededDatabase} from '@/server/repository/test-db';

// Quote reassignment (v3 spec §5, §8; decision 21; task D2): the manager moves one quote or many to
// an active rep. Each moved quote gets its new owner in quotes.rep_id, keeps its first owner in
// original_rep_id, and logs a quote_activity row with who, from and to. Quotes the target already
// owns are skipped (no row). Open and closed quotes both move. One transaction: a bad id moves nothing.
useSeededDatabase();

const NOW='2026-09-25T18:00:00.000Z';
const load=async()=>({repo:await import('@/server/repository'),reassign:await import('./reassign')});

/** A fresh ready_for_review quote for Mara's customer (Canyon Ridge), so it is Mara's. */
async function marasQuote(){
  const {repo}=await load();
  return repo.createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',at:NOW,lines:[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:82,priceBasis:'custom'}]});
}
const activity=async(quoteId:string)=>(await load()).repo.quoteActivity(quoteId).filter(a=>a.kind==='reassigned');

function refused(fn:()=>unknown,status:number,message?:RegExp|string){
  try{fn();}catch(error){
    expect((error as {httpStatus?:number}).httpStatus).toBe(status);
    if(message)expect((error as Error).message).toMatch(message);
    return;
  }
  throw new Error('Expected a refusal');
}

describe('original_rep_id',()=>{
  it('is the rep a quote was created for, and every seeded quote has it',async()=>{
    const {repo}=await load();
    const q=await marasQuote();
    expect(q).toMatchObject({rep_id:'mara',original_rep_id:'mara'});
    expect(repo.quote('q-24817')).toMatchObject({rep_id:'brandi',original_rep_id:'brandi'});
    // Every seeded quote is still its first rep's, except the demo book's moves (task F1): three of Mara's to Brandi, two to Eli.
    const moved=repo.quotes().filter(row=>repo.quote(row.id)!.original_rep_id!==row.rep_id).map(row=>[repo.quote(row.id)!.original_rep_id,row.rep_id].join('>'));
    expect(moved.sort()).toEqual(['mara>brandi','mara>brandi','mara>brandi','mara>eli','mara>eli']);
  });
});

describe('reassignRepQuotes',()=>{
  it('moves one quote: new owner, first owner kept, an activity row with who, from and to',async()=>{
    const {repo,reassign}=await load();
    const q=await marasQuote();
    const {value,replayed}=reassign.reassignRepQuotes('brandi',{quoteIds:[q.quote_number],toRepId:'eli'},{now:NOW});
    expect(replayed).toBe(false);
    expect(value).toEqual({to:{id:'eli',name:'Eli Porter'},moved:[{id:q.id,quote_number:q.quote_number,from:{id:'mara',name:'Mara Jensen'}}],skipped:[]});
    expect(repo.quote(q.id)).toMatchObject({rep_id:'eli',original_rep_id:'mara',updated_at:q.updated_at});
    expect(await activity(q.id)).toEqual([expect.objectContaining({actor:'rep',actor_id:'brandi',kind:'reassigned',at:NOW,
      message:`Brandi Gallegos reassigned ${q.quote_number} from Mara Jensen to Eli Porter`})]);
    // Moved again: the first owner is still Mara.
    reassign.reassignRepQuotes('brandi',{quoteIds:[q.id],toRepId:'brandi'},{now:NOW});
    expect(repo.quote(q.id)).toMatchObject({rep_id:'brandi',original_rep_id:'mara'});
    expect((await activity(q.id)).map(a=>a.message)).toEqual([
      `Brandi Gallegos reassigned ${q.quote_number} from Mara Jensen to Eli Porter`,
      `Brandi Gallegos reassigned ${q.quote_number} from Eli Porter to Brandi Gallegos`]);
  });

  it('moves many at once, open and closed alike, and skips the ones the target already owns (no row)',async()=>{
    const {repo,reassign}=await load();
    const a=await marasQuote(),b=await marasQuote();
    // Q-24816 is one of Brandi's accepted (closed) quotes; Q-24790 is her open change request.
    const before=(await activity('q-24816')).length;
    const {value}=reassign.reassignRepQuotes('brandi',{quoteIds:[a.id,'Q-24816',b.quote_number,'q-24790'],toRepId:'mara'},{now:NOW});
    expect(value.moved.map(m=>[m.quote_number,m.from.id])).toEqual([['Q-24816','brandi'],['Q-24790','brandi']]);
    expect(value.skipped.map(s=>s.quote_number)).toEqual([a.quote_number,b.quote_number]);
    expect(repo.quote('q-24816')).toMatchObject({rep_id:'mara',original_rep_id:'brandi',status:'accepted'});
    expect(repo.quote('q-24790')).toMatchObject({rep_id:'mara',original_rep_id:'brandi',status:'changes_requested'});
    expect(await activity(a.id)).toEqual([]);
    expect((await activity('q-24816')).length).toBe(before+1);
    // Back to Brandi, for the tests after this one.
    reassign.reassignRepQuotes('brandi',{quoteIds:['q-24816','q-24790'],toRepId:'brandi'},{now:NOW});
  });

  it('refuses an unknown or inactive target (400), and a bad request, moving nothing',async()=>{
    const {repo,reassign}=await load();
    const q=await marasQuote();
    refused(()=>reassign.reassignRepQuotes('brandi',{quoteIds:[q.id],toRepId:'nobody'}),400,/Choose an active rep/);
    await setRepFixture('nora',{active:0});
    try{
      refused(()=>reassign.reassignRepQuotes('brandi',{quoteIds:[q.id],toRepId:'nora'}),400,'Nora Chen is inactive. Choose an active rep.');
    }finally{await setRepFixture('nora',{active:1});}
    refused(()=>reassign.reassignRepQuotes('brandi',{quoteIds:[],toRepId:'eli'}),400,/Choose 1 to 200 quotes/);
    refused(()=>reassign.reassignRepQuotes('brandi',{quoteIds:Array.from({length:201},(_,i)=>`q-${i}`),toRepId:'eli'}),400,/Choose 1 to 200 quotes/);
    refused(()=>reassign.reassignRepQuotes('brandi',{quoteIds:[q.id,q.id],toRepId:'eli'}),400,/more than once/);
    refused(()=>reassign.reassignRepQuotes('brandi',{quoteIds:[q.id,q.quote_number],toRepId:'eli'}),400,/more than once/);
    refused(()=>reassign.reassignRepQuotes('brandi',{quoteIds:[42],toRepId:'eli'}),400);
    refused(()=>reassign.reassignRepQuotes('brandi',{quoteIds:[q.id]}),400);
    refused(()=>reassign.reassignRepQuotes('brandi','nope'),400);
    expect(repo.quote(q.id)!.rep_id).toBe('mara');
    expect(await activity(q.id)).toEqual([]);
  });

  it('moves nothing when any quote is unknown (404): one transaction',async()=>{
    const {repo,reassign}=await load();
    const q=await marasQuote();
    refused(()=>reassign.reassignRepQuotes('brandi',{quoteIds:[q.id,'Q-99999'],toRepId:'eli'}),404,'No quote Q-99999.');
    expect(repo.quote(q.id)!.rep_id).toBe('mara');
    expect(await activity(q.id)).toEqual([]);
  });

  it('replays a repeated Idempotency-Key instead of moving again',async()=>{
    const {repo,reassign}=await load();
    const q=await marasQuote();
    const first=reassign.reassignRepQuotes('brandi',{quoteIds:[q.id],toRepId:'eli'},{idempotencyKey:'move-1',now:NOW});
    const again=reassign.reassignRepQuotes('brandi',{quoteIds:[q.id],toRepId:'eli'},{idempotencyKey:'move-1',now:NOW});
    expect(again).toEqual({value:first.value,replayed:true});
    expect((await activity(q.id)).length).toBe(1);
    expect(repo.quote(q.id)!.rep_id).toBe('eli');
  });
});
