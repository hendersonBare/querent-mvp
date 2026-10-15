// @vitest-environment node
import {describe,expect,it,vi} from 'vitest';
import {CATALOG_TTL_MS,createCatalogCache} from './catalog';
import type {CatalogItem} from './repository/types';

// The in-memory catalog cache (docs/boxt/plan.md "Layout": src/server/catalog.ts): loads through the
// repository at most once per TTL (10 minutes), shares one load between concurrent callers
// (single-flight), and never caches a failed load.

const item=(sku:string):CatalogItem=>({sku,description:`Item ${sku}`,category:'boxes',pack:'Each',caseQty:25,listPrice:1.5,keywords:''});
function deferred<T>(){
  let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;
  const promise=new Promise<T>((res,rej)=>{resolve=res;reject=rej;});
  return {promise,resolve,reject};
}

describe('createCatalogCache',()=>{
  it('uses a ten-minute TTL by default',()=>{expect(CATALOG_TTL_MS).toBe(10*60*1000);});

  it('loads once and serves the cached rows until the TTL runs out',async()=>{
    let now=1_000;
    const cache=createCatalogCache({now:()=>now});
    const load=vi.fn(async()=>[item('A')]);
    expect(await cache.get(load)).toEqual([item('A')]);
    now+=CATALOG_TTL_MS-1;
    expect(await cache.get(load)).toEqual([item('A')]);
    expect(load).toHaveBeenCalledTimes(1);
    now+=1;
    load.mockResolvedValueOnce([item('B')]);
    expect(await cache.get(load)).toEqual([item('B')]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shares one in-flight load between concurrent callers',async()=>{
    const cache=createCatalogCache({now:()=>0});
    const pending=deferred<CatalogItem[]>();
    const load=vi.fn(()=>pending.promise);
    const calls=[cache.get(load),cache.get(load),cache.get(load)];
    expect(load).toHaveBeenCalledTimes(1);
    pending.resolve([item('A'),item('B')]);
    const results=await Promise.all(calls);
    for(const rows of results)expect(rows.map(r=>r.sku)).toEqual(['A','B']);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed load: every waiting caller sees the error and the next call retries',async()=>{
    const cache=createCatalogCache({now:()=>0});
    const pending=deferred<CatalogItem[]>();
    const failing=vi.fn(()=>pending.promise);
    const calls=[cache.get(failing),cache.get(failing)];
    pending.reject(new Error('network'));
    for(const call of calls)await expect(call).rejects.toThrow('network');
    const load=vi.fn(async()=>[item('C')]);
    expect(await cache.get(load)).toEqual([item('C')]);
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('clear() forgets the rows, so the next call loads again',async()=>{
    const cache=createCatalogCache({now:()=>0});
    const load=vi.fn(async()=>[item('A')]);
    await cache.get(load);
    cache.clear();
    await cache.get(load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('a load that finishes after clear() does not refill the cache with stale rows',async()=>{
    const cache=createCatalogCache({now:()=>0});
    const pending=deferred<CatalogItem[]>();
    const first=cache.get(()=>pending.promise);
    cache.clear();
    pending.resolve([item('OLD')]);
    expect((await first).map(r=>r.sku)).toEqual(['OLD']);
    const load=vi.fn(async()=>[item('NEW')]);
    expect((await cache.get(load)).map(r=>r.sku)).toEqual(['NEW']);
  });

  it('does not cache an empty catalog (an unseeded database), so the next call looks again',async()=>{
    const cache=createCatalogCache({now:()=>0});
    const load=vi.fn(async():Promise<CatalogItem[]>=>[]);
    expect(await cache.get(load)).toEqual([]);
    load.mockResolvedValueOnce([item('A')]);
    expect((await cache.get(load)).map(r=>r.sku)).toEqual(['A']);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('accepts a custom TTL',async()=>{
    let now=0;
    const cache=createCatalogCache({ttlMs:50,now:()=>now});
    const load=vi.fn(async()=>[item('A')]);
    await cache.get(load);
    now=50;
    await cache.get(load);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
