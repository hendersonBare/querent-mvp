// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {DEFAULT_LEVEL,STRICTNESS_LEVELS} from '@/features/settings/strictness';

// GET/PUT /api/settings (docs/boxt/plan.md "API", B7) with the repository mocked: 401 without a user
// (through withApiUser), 403 for a cross-origin write, 400 for anything but a known level, and a
// change that is saved through the repository and logged as settings_change with the two level enums.

const repo=vi.hoisted(()=>({getOrgSettings:vi.fn(),setMatchStrictness:vi.fn(),logActivity:vi.fn()}));
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

const {GET,PUT}=await import('./route');
const {RepositoryError,sanitizeActivityMetadata}=await import('@/server/repository');

const ORIGIN='http://127.0.0.1:3000';
const get=()=>new NextRequest(`${ORIGIN}/api/settings`,{headers:{host:'127.0.0.1:3000'}});
const put=(body:unknown,{raw=false,origin=ORIGIN}:{raw?:boolean;origin?:string}={})=>new NextRequest(`${ORIGIN}/api/settings`,{method:'PUT',
  headers:{host:'127.0.0.1:3000',origin,'content-type':'application/json'},body:raw?body as string:JSON.stringify(body)});
const ctx={params:Promise.resolve({})};
const settings=(matchStrictness:string)=>({matchStrictness,updatedAt:'2026-10-15T09:00:00.000Z',updatedBy:'u1'});

beforeEach(()=>{
  auth.signedIn=true;
  repo.getOrgSettings.mockReset().mockResolvedValue(settings('strict'));
  repo.setMatchStrictness.mockReset().mockImplementation(async(_db:unknown,level:string)=>({ok:true,settings:settings(level)}));
  repo.logActivity.mockReset().mockResolvedValue({ok:true});
});

const nothingWritten=()=>{
  expect(repo.setMatchStrictness).not.toHaveBeenCalled();
  expect(repo.logActivity).not.toHaveBeenCalled();
};

describe('without a session',()=>{
  it('GET answers 401 and reads nothing',async()=>{
    auth.signedIn=false;
    const response=await GET(get(),ctx);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({error:'Sign in to continue.'});
    expect(repo.getOrgSettings).not.toHaveBeenCalled();
  });

  it('PUT answers 401 and writes nothing',async()=>{
    auth.signedIn=false;
    const response=await PUT(put({matchStrictness:'balanced'}),ctx);
    expect(response.status).toBe(401);
    expect(repo.getOrgSettings).not.toHaveBeenCalled();
    nothingWritten();
  });
});

describe('GET /api/settings',()=>{
  it('returns the organization\'s match strictness, uncached',async()=>{
    repo.getOrgSettings.mockResolvedValue(settings('lenient'));
    const response=await GET(get(),ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({matchStrictness:'lenient'});
    expect(repo.getOrgSettings).toHaveBeenCalledWith({tag:'user-db'});
  });

  it('answers 500 with a plain message when the read fails',async()=>{
    repo.getOrgSettings.mockRejectedValue(new RepositoryError('getOrgSettings','XX000','internal detail'));
    const response=await GET(get(),ctx);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/internal detail|XX000/);
  });
});

describe('PUT /api/settings',()=>{
  it.each([
    ['an unknown level',{matchStrictness:'extreme'}],
    ['a level in another case',{matchStrictness:'Strict'}],
    ['a number',{matchStrictness:1}],
    ['null',{matchStrictness:null}],
    ['a missing field',{}],
    ['an extra field',{matchStrictness:'balanced',minScore:0}],
    ['an array',['balanced']],
  ])('answers 400 for %s and writes nothing',async(_name,body)=>{
    const response=await PUT(put(body),ctx);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({error:'Choose Strict, Balanced or Lenient.'});
    nothingWritten();
  });

  it('answers 400 for a body that is not JSON',async()=>{
    const response=await PUT(put('matchStrictness=balanced',{raw:true}),ctx);
    expect(response.status).toBe(400);
    nothingWritten();
  });

  it('refuses a cross-origin write with 403',async()=>{
    const response=await PUT(put({matchStrictness:'lenient'},{origin:'https://evil.example'}),ctx);
    expect(response.status).toBe(403);
    nothingWritten();
  });

  it('saves the level through the repository and logs settings_change with the two levels only',async()=>{
    const response=await PUT(put({matchStrictness:'balanced'}),ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({matchStrictness:'balanced'});
    expect(repo.setMatchStrictness).toHaveBeenCalledWith({tag:'user-db'},'balanced');
    expect(repo.logActivity).toHaveBeenCalledTimes(1);
    const [db,action,metadata]=repo.logActivity.mock.calls[0];
    expect(db).toEqual({tag:'user-db'});
    expect(action).toBe('settings_change');
    expect(metadata).toEqual({from:'strict',to:'balanced'});
    // Nothing the sanitizer would drop: the metadata is made of known enum values only.
    expect(sanitizeActivityMetadata(metadata)).toEqual(metadata);
  });

  it.each(STRICTNESS_LEVELS.filter(level=>level!==DEFAULT_LEVEL))('accepts %s',async level=>{
    const response=await PUT(put({matchStrictness:level}),ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({matchStrictness:level});
  });

  it('answers 200 for the level already in force, without a write or a log row',async()=>{
    const response=await PUT(put({matchStrictness:'strict'}),ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({matchStrictness:'strict'});
    nothingWritten();
  });

  it('answers 403 when the database refuses the write, and logs nothing',async()=>{
    repo.setMatchStrictness.mockResolvedValue({ok:false,error:'unauthorized',message:'Not allowed.'});
    const response=await PUT(put({matchStrictness:'lenient'}),ctx);
    expect(response.status).toBe(403);
    expect(repo.logActivity).not.toHaveBeenCalled();
  });

  it('answers 500 with a plain message when the write fails, and logs nothing',async()=>{
    repo.setMatchStrictness.mockResolvedValue({ok:false,error:'failed',message:'The database could not save this.'});
    const response=await PUT(put({matchStrictness:'lenient'}),ctx);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({error:'The setting could not be saved. Try again.'});
    expect(repo.logActivity).not.toHaveBeenCalled();
  });

  it('answers 500 when the current setting cannot be read',async()=>{
    repo.getOrgSettings.mockRejectedValue(new RepositoryError('getOrgSettings','XX000','internal detail'));
    const response=await PUT(put({matchStrictness:'lenient'}),ctx);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/internal detail|XX000/);
    nothingWritten();
  });

  it('still answers 200 when the activity row cannot be written',async()=>{
    repo.logActivity.mockResolvedValue({ok:false,error:'failed',message:'The activity could not be logged.'});
    const response=await PUT(put({matchStrictness:'lenient'}),ctx);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({matchStrictness:'lenient'});
  });
});
