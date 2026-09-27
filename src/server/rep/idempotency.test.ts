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
