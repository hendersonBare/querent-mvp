import {describe,expect,it,vi} from 'vitest';
import {IdempotencyStore,parseIdempotencyKey} from './idempotency';

// The double-submit guard behind Duplicate quote (task 3.5): a repeated request with the same
// Idempotency-Key gets the first answer back instead of doing the work again.

describe('IdempotencyStore',()=>{
  it('runs once per key and replays the stored result',()=>{
    const store=new IdempotencyStore();
    const work=vi.fn(()=>({n:1}));
    expect(store.once('dup:brandi:q-1','k1',work)).toEqual({value:{n:1},replayed:false});
    expect(store.once('dup:brandi:q-1','k1',work)).toEqual({value:{n:1},replayed:true});
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('keeps scopes apart: the same key on another quote or rep is new work',()=>{
    const store=new IdempotencyStore();
    let n=0;
    const work=()=>++n;
    expect(store.once('dup:brandi:q-1','k',work).value).toBe(1);
    expect(store.once('dup:brandi:q-2','k',work).value).toBe(2);
    expect(store.once('dup:mara:q-1','k',work).value).toBe(3);
  });

  it('always runs without a key',()=>{
    const store=new IdempotencyStore();
    let n=0;
    expect(store.once('s',null,()=>++n)).toEqual({value:1,replayed:false});
    expect(store.once('s',null,()=>++n)).toEqual({value:2,replayed:false});
  });

  it('remembers nothing when the work throws, so a retry can succeed',()=>{
    const store=new IdempotencyStore();
    expect(()=>store.once('s','k',()=>{throw new Error('conflict');})).toThrow('conflict');
    expect(store.once('s','k',()=>'ok')).toEqual({value:'ok',replayed:false});
  });

  it('forgets a key after its time to live',()=>{
    let now=1_000;
    const store=new IdempotencyStore({ttlMs:60_000,clock:()=>now});
    store.once('s','k',()=>'first');
    now+=59_999;
    expect(store.once('s','k',()=>'second')).toEqual({value:'first',replayed:true});
    now+=2;
    expect(store.once('s','k',()=>'third')).toEqual({value:'third',replayed:false});
  });

  it('holds at most maxEntries, dropping the oldest',()=>{
    const store=new IdempotencyStore({maxEntries:2});
    store.once('s','a',()=>'a');store.once('s','b',()=>'b');store.once('s','c',()=>'c');
    expect(store.size).toBe(2);
    expect(store.once('s','a',()=>'a again')).toEqual({value:'a again',replayed:false});
    expect(store.once('s','c',()=>'c again')).toEqual({value:'c',replayed:true});
  });
});

describe('IdempotencyStore.onceAsync (task 3.7: Send, whose work awaits freight)',()=>{
  /** A promise the test settles by hand, to hold work in flight. */
  function deferred<T>(){
    let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;
    const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
    return {promise,resolve,reject};
  }

  it('makes a repeat that arrives while the first is still running wait for it, instead of running again',async()=>{
    const store=new IdempotencyStore();
    const gate=deferred<string>();
    let runs=0;
    const work=()=>{runs++;return gate.promise;};
    const first=store.onceAsync('rep:q','click-1',work);
    const second=store.onceAsync('rep:q','click-1',work);
    gate.resolve('sent rev 1');
    expect(await first).toEqual({value:'sent rev 1',replayed:false});
    expect(await second).toEqual({value:'sent rev 1',replayed:true});
    expect(runs).toBe(1);
    // And after it finished, within the time to live.
    expect(await store.onceAsync('rep:q','click-1',work)).toEqual({value:'sent rev 1',replayed:true});
    expect(runs).toBe(1);
  });

  it('starts the work synchronously, so nothing can slip in between the check and the start',()=>{
    const store=new IdempotencyStore();
    let started=false;
    void store.onceAsync('s','k',async()=>{started=true;return 1;});
    expect(started).toBe(true);
  });

  it('runs every time without a key, and keeps keys apart by scope',async()=>{
    const store=new IdempotencyStore();
    let runs=0;
    const work=async()=>++runs;
    await store.onceAsync('s',null,work);await store.onceAsync('s',null,work);
    expect(runs).toBe(2);
    expect(await store.onceAsync('rep-a:q','k',work)).toEqual({value:3,replayed:false});
    expect(await store.onceAsync('rep-b:q','k',work)).toEqual({value:4,replayed:false});
  });

  it('forgets a failed run, so the same key can try again; a repeat waiting on it gets the same failure',async()=>{
    const store=new IdempotencyStore();
    const gate=deferred<string>();
    const first=store.onceAsync('s','k',()=>gate.promise);
    const waiting=store.onceAsync('s','k',async()=>'never runs');
    gate.reject(new Error('conflict'));
    await expect(first).rejects.toThrow('conflict');
    await expect(waiting).rejects.toThrow('conflict');
    expect(store.size).toBe(0);
    expect(await store.onceAsync('s','k',async()=>'retried')).toEqual({value:'retried',replayed:false});
  });

  it('forgets work that throws before its first await',async()=>{
    const store=new IdempotencyStore();
    await expect(store.onceAsync('s','k',()=>{throw new Error('bad input');})).rejects.toThrow('bad input');
    expect(store.size).toBe(0);
  });
});

describe('parseIdempotencyKey',()=>{
  it('accepts a UUID or another short token, trimmed',()=>{
    expect(parseIdempotencyKey('9b2f3c1e-2d4a-4b8e-9f00-1a2b3c4d5e6f')).toBe('9b2f3c1e-2d4a-4b8e-9f00-1a2b3c4d5e6f');
    expect(parseIdempotencyKey('  dup:1.2_x ')).toBe('dup:1.2_x');
  });
  it('reads a missing or blank header as no key',()=>{
    expect(parseIdempotencyKey(null)).toBeNull();
    expect(parseIdempotencyKey('   ')).toBeNull();
  });
  it('refuses a malformed key (undefined), so the route can answer 400',()=>{
    expect(parseIdempotencyKey('x'.repeat(129))).toBeUndefined();
    expect(parseIdempotencyKey('has space')).toBeUndefined();
    expect(parseIdempotencyKey('<script>')).toBeUndefined();
  });
});
