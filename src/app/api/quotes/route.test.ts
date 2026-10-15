// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {summary} from '@/features/quotes/test-fixtures';

// GET /api/quotes (docs/boxt/plan.md "API", B6) with the repository mocked: 401 without a user (through
// withApiUser), the list newest first as the repository returns it, and a plain 500 when the read fails.
// POST (create) is B5's.

const repo=vi.hoisted(()=>({listQuotes:vi.fn()}));
vi.mock('@/server/repository',async original=>({...await original<typeof import('@/server/repository')>(),...repo}));

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
const {RepositoryError}=await import('@/server/repository');
const get=()=>new NextRequest('http://127.0.0.1:3000/api/quotes',{headers:{host:'127.0.0.1:3000'}});
const ctx={params:Promise.resolve({})};

beforeEach(()=>{auth.signedIn=true;repo.listQuotes.mockReset();});

describe('GET /api/quotes',()=>{
  it('answers 401 without a session and reads nothing',async()=>{
    auth.signedIn=false;
    const response=await GET(get(),ctx);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({error:'Sign in to continue.'});
    expect(repo.listQuotes).not.toHaveBeenCalled();
  });

  it('returns the quotes as the repository lists them (newest first)',async()=>{
    const rows=[summary(),summary({id:'7c7c7c7c-0000-4000-8000-000000000007',createdAt:'2026-10-14T09:30:00.000Z'})];
    repo.listQuotes.mockResolvedValue(rows);
    const response=await GET(get(),ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({quotes:rows});
    expect(repo.listQuotes).toHaveBeenCalledWith({tag:'user-db'});
  });

  it('answers 500 with a plain message when the read fails',async()=>{
    repo.listQuotes.mockRejectedValue(new RepositoryError('listQuotes','XX000','internal detail'));
    const response=await GET(get(),ctx);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/internal detail|XX000/);
  });
});
