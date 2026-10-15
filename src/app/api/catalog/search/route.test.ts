// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {CATALOG} from '@/features/quote-tool/test-fixtures';
import type {ScoredItem} from '@/features/quote-tool/types';

// GET /api/catalog/search?q= (the review dialog's Swap search) with the catalog mocked: 401 without a
// user, 400 for a query under 2 characters, at most 10 items by the scorer, best first.

const catalog=vi.hoisted(()=>({getCatalog:vi.fn()}));
vi.mock('@/server/catalog',()=>catalog);
const auth=vi.hoisted(()=>({signedIn:true}));
vi.mock('@/features/auth/server',async original=>{
  const actual=await original<typeof import('@/features/auth/server')>();
  return {...actual,requireApiUser:async(request?:Request)=>auth.signedIn
    ?{user:{id:'u1',email:'rep@boxt.test'},db:{tag:'user-db'},applyCookies:<R extends Response>(r:R)=>r}
    :actual.requireApiUser(request)};
});

beforeAll(()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:59999');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','test-anon-key');
});
afterAll(()=>vi.unstubAllEnvs());

const {GET}=await import('./route');
const ctx={params:Promise.resolve({})};
const get=(q:string|null)=>new NextRequest(`http://127.0.0.1:3000/api/catalog/search${q===null?'':`?q=${encodeURIComponent(q)}`}`,{headers:{host:'127.0.0.1:3000'}});

beforeEach(()=>{
  auth.signedIn=true;
  catalog.getCatalog.mockReset().mockResolvedValue(CATALOG);
});

describe('GET /api/catalog/search',()=>{
  it('answers 401 without a session',async()=>{
    auth.signedIn=false;
    expect((await GET(get('boxes'),ctx)).status).toBe(401);
    expect(catalog.getCatalog).not.toHaveBeenCalled();
  });

  it('answers 400 for a missing, 1-character or overlong query',async()=>{
    for(const q of [null,'','b',' b ','x'.repeat(201)])expect((await GET(get(q),ctx)).status,String(q)).toBe(400);
  });

  it('returns items by score, best first, with SKU, description, pack label, list price and score',async()=>{
    const response=await GET(get('12x10x8 corrugated boxes'),ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const {items}=await response.json() as {items:ScoredItem[]};
    expect(items[0]).toEqual({sku:'12108-BDL',description:'12x10x8" Corrugated Boxes, 32 ECT, bundle pricing',pack:'Bundle of 25',category:'Boxes',listPrice:0.84,listPriceUnit:'each',score:1});
    expect(items.map(i=>i.score)).toEqual([...items.map(i=>i.score)].sort((a,b)=>b-a));
    expect(items.every(i=>i.score>0)).toBe(true);
  });

  it('returns at most 10 items',async()=>{
    const many=Array.from({length:30},(_,i)=>({sku:`T-${i}`,description:`Carton Sealing Tape ${i+1} rolls`,pack:'Case of 36',caseQty:36,listPrice:1,category:'Tape',keywords:''}));
    catalog.getCatalog.mockResolvedValue([...CATALOG,...many]);
    const {items}=await (await GET(get('carton sealing tape'),ctx)).json() as {items:ScoredItem[]};
    expect(items).toHaveLength(10);
  });

  it('returns an empty list when nothing scores',async()=>{
    const {items}=await (await GET(get('zzqx'),ctx)).json() as {items:ScoredItem[]};
    expect(items).toEqual([]);
  });
});
