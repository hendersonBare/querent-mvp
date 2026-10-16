// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';

// The per-handler guards (docs/boxt/plan.md product rule 7: "proxy.ts and again in each handler").
// Without a session cookie no network call is made, so these run offline.

const headerStore=vi.hoisted(()=>({cookies:[] as {name:string;value:string}[],headers:new Headers(),bailOut:null as Error|null}));
vi.mock('next/headers',()=>({
  // During `next build`, cookies() throws to stop prerendering (the page is rendered per request).
  cookies:async()=>{if(headerStore.bailOut)throw headerStore.bailOut;return {getAll:()=>headerStore.cookies,set:()=>{}};},
  headers:async()=>headerStore.headers,
}));

beforeAll(()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:59999');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','test-anon-key');
});
afterAll(()=>vi.unstubAllEnvs());
beforeEach(()=>{headerStore.cookies=[];headerStore.headers=new Headers();headerStore.bailOut=null;});

const {createSupabaseServerClient,requireApiUser,requireUser}=await import('./server');
const {withApiUser,isSameOrigin}=await import('./api');
const {COPY}=await import('./copy');

describe('requireApiUser',()=>{
  it('answers 401 JSON {error:"Sign in to continue."} without a session',async()=>{
    const result=await requireApiUser(new Request('http://127.0.0.1:3000/api/quotes'));
    expect(result).toBeInstanceOf(Response);
    const response=result as Response;
    expect(response.status).toBe(401);
    expect(response.headers.get('content-type')).toMatch(/application\/json/);
    expect(await response.json()).toEqual({error:'Sign in to continue.'});
    expect(COPY.signInToContinue).toBe('Sign in to continue.');
  });

  it('also reads the request cookies through next/headers when no request is given',async()=>{
    const result=await requireApiUser();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(401);
  });
});

describe('withApiUser',()=>{
  it('never runs the handler without a session',async()=>{
    const handler=vi.fn(async()=>Response.json({secret:true}));
    const GET=withApiUser(handler);
    const response=await GET(new Request('http://127.0.0.1:3000/api/quotes') as never,{params:Promise.resolve({})});
    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('refuses a cross-origin state-changing request before looking at the session',async()=>{
    const handler=vi.fn(async()=>Response.json({ok:true}));
    const POST=withApiUser(handler);
    const response=await POST(new Request('http://127.0.0.1:3000/api/quotes',{method:'POST',headers:{origin:'https://evil.example'}}) as never,{params:Promise.resolve({})});
    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('isSameOrigin',()=>{
  const req=(method:string,headers:Record<string,string>)=>new Request('http://127.0.0.1:3000/api/auth/login',{method,headers});
  it('accepts the app\'s own origin and requests without an Origin header (not a browser form)',()=>{
    expect(isSameOrigin(req('POST',{origin:'http://127.0.0.1:3000',host:'127.0.0.1:3000'}))).toBe(true);
    expect(isSameOrigin(req('POST',{}))).toBe(true);
  });

  it('uses the forwarded host behind a reverse proxy',()=>{
    expect(isSameOrigin(req('POST',{origin:'https://quotes.boxt.example','x-forwarded-host':'quotes.boxt.example','x-forwarded-proto':'https',host:'10.0.0.5:3000'}))).toBe(true);
    expect(isSameOrigin(req('POST',{origin:'https://evil.example','x-forwarded-host':'quotes.boxt.example',host:'10.0.0.5:3000'}))).toBe(false);
  });

  it('refuses another origin, an opaque origin and a cross-site fetch',()=>{
    expect(isSameOrigin(req('POST',{origin:'https://evil.example',host:'127.0.0.1:3000'}))).toBe(false);
    expect(isSameOrigin(req('POST',{origin:'http://127.0.0.1:3001',host:'127.0.0.1:3000'}))).toBe(false);
    expect(isSameOrigin(req('POST',{origin:'null',host:'127.0.0.1:3000'}))).toBe(false);
    expect(isSameOrigin(req('POST',{'sec-fetch-site':'cross-site',host:'127.0.0.1:3000'}))).toBe(false);
  });
});

describe('requireUser',()=>{
  it('redirects to /login with the page as next when there is no session',async()=>{
    let thrown:unknown;
    try{await requireUser('/quotes');}catch(error){thrown=error;}
    expect(String((thrown as {digest?:string})?.digest)).toMatch(/^NEXT_REDIRECT;\w+;\/login\?next=%2Fquotes;307;/);
  });

  it('never puts an unsafe next into the redirect',async()=>{
    let thrown:unknown;
    try{await requireUser('//evil.com');}catch(error){thrown=error;}
    expect(String((thrown as {digest?:string})?.digest)).toMatch(/^NEXT_REDIRECT;\w+;\/login;307;/);
  });
});

// Follow-up F1 (docs/boxt/plan.md): `next build` runs before any Supabase env exists (CI builds first).
// A page that creates the server client must become dynamic (cookies()) before it reads the env, so
// the build's prerender stops at cookies() instead of failing on the missing env; at run time a
// missing env still fails closed (an error, never a page without a session check).
describe('without Supabase env (F1)',()=>{
  const unset=()=>{vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','');};
  const restore=()=>{vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:59999');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','test-anon-key');};

  it('asks for cookies() before reading the env, so the build only sees the dynamic bail-out',async()=>{
    unset();
    try{
      headerStore.bailOut=new Error('dynamic bail-out');
      await expect(createSupabaseServerClient()).rejects.toThrow('dynamic bail-out');
      await expect(requireUser('/quotes')).rejects.toThrow('dynamic bail-out');
      await expect(requireApiUser()).rejects.toThrow('dynamic bail-out');
    }finally{restore();}
  });

  it('fails closed at run time: an error naming the missing variables, never a session',async()=>{
    unset();
    try{
      await expect(createSupabaseServerClient()).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
      await expect(requireUser('/quotes')).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
      await expect(requireApiUser(new Request('http://127.0.0.1:3000/api/quotes'))).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
    }finally{restore();}
  });
});
