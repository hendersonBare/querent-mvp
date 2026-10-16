import {readdirSync,readFileSync} from 'node:fs';
import {join,posix,relative,sep} from 'node:path';
import {expect,request as playwrightRequest,test,type APIRequestContext} from '@playwright/test';
import {SIGNED_OUT,adminQuery,exampleQuoteId} from './support/helpers';
import {ROOT} from './support/stack';

// Access control (docs/boxt/plan.md product rule 7, B8): without a session every page sends the
// browser to /login and every API answers 401; there is no sign-up anywhere; and the anon key alone
// reads nothing from the database. Pages and route handlers are read from src/app at test time, so a
// new route is covered without touching this spec.

test.use({storageState:SIGNED_OUT});

const APP=join(ROOT,'src/app');
const METHODS=['GET','HEAD','POST','PUT','PATCH','DELETE','OPTIONS'] as const;
const SOME_ID='00000000-0000-4000-8000-000000000000';

/** Every file named `name` under src/app, as its URL path (route groups dropped) and its source. */
function appFiles(name:RegExp,dir=APP):{path:string;source:string}[]{
  return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const file=join(dir,entry.name);
    if(entry.isDirectory())return appFiles(name,file);
    if(!name.test(entry.name))return [];
    const segments=relative(APP,dir).split(sep).filter(part=>part&&!/^\(.*\)$/.test(part));
    return [{path:posix.join('/',...segments),source:readFileSync(file,'utf8')}];
  });
}

/** The HTTP methods a route file exports (export const GET=…, export async function POST, export {GET}). */
function exportedMethods(source:string):string[]{
  const named=[...source.matchAll(/export\s+(?:const|let|(?:async\s+)?function)\s+([A-Z]+)\b/g)].map(m=>m[1]);
  const listed=[...source.matchAll(/export\s*\{([^}]*)\}/g)].flatMap(m=>m[1].split(',').map(part=>part.trim().split(/\s+as\s+/).pop()!));
  return [...new Set([...named,...listed])].filter(name=>(METHODS as readonly string[]).includes(name));
}

const fill=(path:string,id:string)=>path.replace(/\[\[?\.{0,3}[^\]]+\]\]?/g,id);
/** A Location header (absolute or relative) as path and query. */
const target=(location:string|undefined)=>{const url=new URL(location??'',`http://app.invalid`);return `${url.pathname}${url.search}`;};

const PAGES=appFiles(/^page\.(t|j)sx?$/);
const ROUTES=appFiles(/^route\.(t|j)sx?$/).flatMap(({path,source})=>exportedMethods(source).map(method=>({method,path})));

/** Pages open without a session, and what each answers then. */
const PUBLIC_PAGES:Record<string,{status:number;location?:string}>={
  '/login':{status:200},
  '/reset-password':{status:200},
  // Needs the session a reset link creates; without one it sends the visitor to ask for a new link.
  '/update-password':{status:307,location:'/reset-password?error=expired'},
};

/** Route handlers open without a session, and what each answers to an empty request. */
const PUBLIC_ROUTES:Record<string,{status:number;body?:unknown;location?:string}>={
  'POST /api/auth/login':{status:401,body:{error:'Email or password is incorrect.'}},
  'POST /api/auth/reset':{status:400,body:{error:'Enter your email address.'}},
  'POST /api/auth/signout':{status:303,location:'/login'},
  'GET /auth/confirm':{status:303,location:'/reset-password?error=expired'},
};

test('src/app has the pages and APIs this spec must cover',()=>{
  expect(PAGES.map(p=>p.path)).toEqual(expect.arrayContaining(['/','/quote-tool','/quotes','/quotes/[id]','/settings','/login']));
  expect(ROUTES.map(r=>`${r.method} ${r.path}`)).toEqual(expect.arrayContaining([
    'POST /api/quote-tool/match','GET /api/catalog/search','GET /api/quotes','POST /api/quotes',
    'GET /api/quotes/[id]','PATCH /api/quotes/[id]','DELETE /api/quotes/[id]','GET /api/settings','PUT /api/settings',
    ...Object.keys(PUBLIC_ROUTES),
  ]));
  expect(ROUTES.length).toBeGreaterThanOrEqual(14);
});

test('every page sends a visitor without a session to /login, carrying the page as next',async({page,request})=>{
  const example=await exampleQuoteId();
  for(const {path:route} of PAGES){
    const path=fill(route,example);
    const response=await request.get(path,{maxRedirects:0});
    const open=PUBLIC_PAGES[path];
    if(open){
      expect(response.status(),path).toBe(open.status);
      if(open.location)expect(target(response.headers().location),path).toBe(open.location);
      continue;
    }
    expect(response.status(),path).toBe(307);
    expect(target(response.headers().location),path).toBe(`/login?next=${encodeURIComponent(path)}`);
  }

  // And in a browser: the example quote's page ends on the sign-in form, showing nothing of the quote.
  await page.goto(`/quotes/${example}`);
  await expect(page).toHaveURL(new RegExp(`/login\\?next=%2Fquotes%2F${example}$`));
  await expect(page.getByRole('button',{name:'Sign in'})).toBeVisible();
  await expect(page.getByText('Example')).toHaveCount(0);
});

test('every API answers 401 without a session; the auth APIs answer as public endpoints',async({request})=>{
  const checked:string[]=[];
  for(const {method,path:route} of ROUTES){
    const path=fill(route,SOME_ID);
    const key=`${method} ${route}`;
    const response=await request.fetch(path,{method,maxRedirects:0,...(method==='GET'||method==='HEAD'?{}:{data:{}})});
    const open=PUBLIC_ROUTES[key];
    if(open){
      expect(response.status(),key).toBe(open.status);
      if(open.body)expect(await response.json(),key).toEqual(open.body);
      if(open.location)expect(target(response.headers().location),key).toBe(open.location);
    }else{
      expect(response.status(),key).toBe(401);
      if(method!=='HEAD')expect(await response.json(),key).toEqual({error:'Sign in to continue.'});
    }
    checked.push(key);
  }
  expect(checked.length).toBe(ROUTES.length);

  // Paths that only look like files are still APIs (follow-up F2), and unknown APIs are closed too.
  for(const path of ['/api/quotes/x.png','/api/quotes/x.svg','/api/settings/a.jpg','/api','/api/nothing-here']){
    const response=await request.get(path,{maxRedirects:0});
    expect(response.status(),path).toBe(401);
  }
});

test('there is no sign-up: no page, no link, and Supabase refuses it',async({page,request,baseURL})=>{
  const paths=['/signup','/sign-up','/register','/auth/signup'];
  for(const path of paths){
    const response=await request.get(path,{maxRedirects:0});
    expect(response.status(),path).toBe(307);
    expect(target(response.headers().location),path).toBe(`/login?next=${encodeURIComponent(path)}`);
  }
  expect((await request.post('/api/auth/signup',{data:{}})).status()).toBe(401);

  // Signed in, they are simply not there.
  const signedIn:APIRequestContext=await playwrightRequest.newContext({baseURL,storageState:'e2e/.auth/rep.json'});
  try{
    expect((await signedIn.get('/api/settings')).status(),'the stored session works').toBe(200);
    for(const path of paths)expect((await signedIn.get(path,{maxRedirects:0})).status(),path).toBe(404);
    expect((await signedIn.post('/api/auth/signup',{data:{}})).status()).toBe(404);
  }finally{
    await signedIn.dispose();
  }

  await page.goto('/login');
  await expect(page.getByRole('link',{name:/sign.?up|register|create.+account/i})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/sign.?up|register|create.+account/i})).toHaveCount(0);

  // The Auth server itself: password sign-up and an OTP that would create a user are both refused.
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const email=`e2e-signup-${Date.now()}@boxt.test`;
  const headers={apikey:anonKey,'content-type':'application/json'};
  const signup=await fetch(`${url}/auth/v1/signup`,{method:'POST',headers,body:JSON.stringify({email,password:'e2e-signup-password-1'})});
  expect(signup.status).toBe(422);
  expect((await signup.json()).error_code).toBe('signup_disabled');
  const otp=await fetch(`${url}/auth/v1/otp`,{method:'POST',headers,body:JSON.stringify({email,create_user:true})});
  expect(otp.status).toBe(422);
  expect(await adminQuery('select id from auth.users where email=$1',[email])).toEqual([]);
});

test('RLS: the anon key with no session reads and writes nothing in any table, view or function',async()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!,anonKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const headers={apikey:anonKey,authorization:`Bearer ${anonKey}`,'content-type':'application/json'};
  const relations=await adminQuery("select table_name as name, table_type as type from information_schema.tables where table_schema='public' order by 1");
  expect(relations.map(r=>r.name)).toEqual(expect.arrayContaining(['activity_log','catalog_items','org_settings','quote_lines','quote_summaries','quotes']));

  /** Refused (permission denied) or answered with no rows. */
  const nothing=async(response:Response,what:string)=>{
    const body=await response.json().catch(()=>null);
    if(response.ok)expect(body,what).toEqual([]);
    else{
      expect([401,403],what).toContain(response.status);
      expect(body?.code,what).toBe('42501');
    }
  };
  /** Refused outright: 401/403 with permission denied (42501). */
  const denied=async(response:Response,what:string)=>{
    const body=await response.json().catch(()=>null);
    expect([401,403],what).toContain(response.status);
    expect(body?.code,what).toBe('42501');
    expect(String(body?.message),what).toMatch(/permission denied/i);
  };
  // One real column per table, so the UPDATE names something it would change.
  const columns=await adminQuery("select table_name as name, min(column_name) as col from information_schema.columns where table_schema='public' and column_name<>'id' group by table_name");
  const columnOf=new Map(columns.map(c=>[c.name as string,c.col as string]));
  const tables=relations.filter(r=>r.type==='BASE TABLE');
  expect(tables.length).toBeGreaterThanOrEqual(5);
  for(const {name,type} of relations){
    await nothing(await fetch(`${url}/rest/v1/${name}?select=*&limit=5`,{headers}),`select ${name}`);
    if(type==='BASE TABLE'){
      await denied(await fetch(`${url}/rest/v1/${name}`,{method:'POST',headers,body:JSON.stringify({})}),`insert ${name}`);
      const column=columnOf.get(name as string);
      expect(column,`a column of ${name}`).toBeTruthy();
      const update=await fetch(`${url}/rest/v1/${name}?id=not.is.null`,{method:'PATCH',headers:{...headers,prefer:'return=representation'},body:JSON.stringify({[column!]:null})});
      await nothing(update,`update ${name}`);
      const remove=await fetch(`${url}/rest/v1/${name}?id=not.is.null`,{method:'DELETE',headers:{...headers,prefer:'return=representation'}});
      await nothing(remove,`delete ${name}`);
    }
  }

  const functions=await adminQuery("select p.proname as name, coalesce(p.proargnames,'{}') as args from pg_proc p where p.pronamespace='public'::regnamespace and p.prorettype<>'trigger'::regtype");
  expect(functions.length).toBeGreaterThan(0);
  for(const {name,args} of functions){
    const body=Object.fromEntries((args as string[]).map(arg=>[arg,null]));
    const response=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers,body:JSON.stringify(body)});
    expect(response.ok,`rpc ${name}`).toBe(false);
    expect((await response.json()).code,`rpc ${name}`).toBe('42501');
  }

  // Nothing above changed anything: the seed is intact.
  expect(Number((await adminQuery('select count(*) from public.catalog_items'))[0].count)).toBeGreaterThan(1000);
  expect(await adminQuery('select id from public.quotes where is_example')).toHaveLength(1);
});
