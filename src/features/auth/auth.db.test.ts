// @vitest-environment node
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {adminQuery} from '../../../scripts/lib/local-admin';
import {DEV_USERS,devPassword} from '../../../scripts/lib/dev-users';
import {anonClient,signedInClient} from '../../../scripts/lib/test-clients';
import {POST as login} from '@/app/api/auth/login/route';
import {POST as signout} from '@/app/api/auth/signout/route';
import {POST as reset} from '@/app/api/auth/reset/route';
import {POST as updatePassword} from '@/app/api/auth/update-password/route';
import {GET as confirm} from '@/app/auth/confirm/route';
import {requireApiUser} from './server';
import {COPY} from './copy';

// The auth route handlers against the local Supabase stack (npm run test:db): password sign-in sets the
// session cookies and logs `login`; failures are all alike and log nothing; sign-out clears the cookies
// and logs `logout`; a reset request mails a /auth/confirm link (Mailpit), the link signs the user in
// for a recovery, and update-password sets the new password. The handlers are called directly with a
// NextRequest, as Next calls them.

const ORIGIN='http://127.0.0.1:3000';
const MAILPIT=process.env.MAILPIT_URL||'http://127.0.0.1:54324';
const REP=DEV_USERS[0].email,REP2=DEV_USERS[1].email;

/** A cookie jar: Set-Cookie headers in, a Cookie header out. */
class Jar {
  private store=new Map<string,string>();
  take(response:Response){
    for(const line of response.headers.getSetCookie()){
      const [pair,...attributes]=line.split(';');
      const eq=pair.indexOf('=');
      const name=pair.slice(0,eq).trim(),value=pair.slice(eq+1).trim();
      const expired=attributes.some(a=>/^\s*max-age=0\s*$/i.test(a))||value==='';
      if(expired)this.store.delete(name);else this.store.set(name,value);
    }
    return this;
  }
  names(){return [...this.store.keys()];}
  header(){return [...this.store].map(([k,v])=>`${k}=${v}`).join('; ');}
}

const post=(path:string,body:unknown,{jar,headers={},form=false}:{jar?:Jar;headers?:Record<string,string>;form?:boolean}={})=>new NextRequest(`${ORIGIN}${path}`,{
  method:'POST',
  headers:{
    origin:ORIGIN,host:'127.0.0.1:3000',
    'content-type':form?'application/x-www-form-urlencoded':'application/json',
    ...(jar?{cookie:jar.header()}:{}),
    ...headers,
  },
  body:form?new URLSearchParams(body as Record<string,string>).toString():JSON.stringify(body),
});
const get=(path:string,jar?:Jar)=>new NextRequest(`${ORIGIN}${path}`,{headers:{host:'127.0.0.1:3000',...(jar?{cookie:jar.header()}:{})}});

const authCookies=(jar:Jar)=>jar.names().filter(n=>/^sb-.+-auth-token(\.\d+)?$/.test(n));
const userId=async(email:string)=>(await adminQuery('select id from auth.users where email=$1',[email]))[0].id as string;
const activity=(id:string,action:string)=>adminQuery('select metadata from public.activity_log where user_id=$1 and action=$2 order by id',[id,action]);

async function signIn(email=REP,password=devPassword()){
  const response=await login(post('/api/auth/login',{email,password}));
  return {response,jar:new Jar().take(response)};
}

describe('POST /api/auth/login',()=>{
  it('signs in with email and password, sets the session cookies and logs login',async()=>{
    const id=await userId(REP);
    const before=(await activity(id,'login')).length;
    const {response,jar}=await signIn();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ok:true,redirectTo:'/quote-tool'});
    expect(authCookies(jar).length).toBeGreaterThan(0);
    expect(response.headers.get('cache-control')).toMatch(/no-store/);
    const rows=await activity(id,'login');
    expect(rows).toHaveLength(before+1);
    expect(rows.at(-1)!.metadata).toEqual({method:'password'});

    // The cookie jar is a session the guards accept, and RLS lets it read quotes.
    const session=await requireApiUser(get('/api/quotes',jar));
    expect(session).not.toBeInstanceOf(Response);
    if(session instanceof Response)return;
    expect(session.user.email).toBe(REP);
    expect((await session.db.auth.getUser()).data.user?.id).toBe(id);
  });

  it('answers a wrong password and an unknown account alike, sets no session and logs nothing',async()=>{
    const id=await userId(REP);
    const before=(await activity(id,'login')).length;
    const wrong=await login(post('/api/auth/login',{email:REP,password:'not-the-password'}));
    const unknown=await login(post('/api/auth/login',{email:'nobody@boxt.test',password:'not-the-password'}));
    const empty=await login(post('/api/auth/login',{email:'',password:''}));
    for(const response of [wrong,unknown,empty]){
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({error:COPY.loginFailed});
      expect(authCookies(new Jar().take(response))).toEqual([]);
    }
    expect(await activity(id,'login')).toHaveLength(before);
  });

  it('works as a plain form post: 303 to next, or back to /login with the error',async()=>{
    const ok=await login(post('/api/auth/login',{email:REP,password:devPassword(),next:'/quotes'},{form:true}));
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toBe(`${ORIGIN}/quotes`);
    expect(authCookies(new Jar().take(ok)).length).toBeGreaterThan(0);

    const evil=await login(post('/api/auth/login',{email:REP,password:devPassword(),next:'//evil.com'},{form:true}));
    expect(evil.headers.get('location')).toBe(`${ORIGIN}/quote-tool`);

    const bad=await login(post('/api/auth/login',{email:REP,password:'nope',next:'/quotes'},{form:true}));
    expect(bad.status).toBe(303);
    expect(bad.headers.get('location')).toBe(`${ORIGIN}/login?error=1&next=%2Fquotes`);
  });

  it('refuses a cross-origin post',async()=>{
    const response=await login(post('/api/auth/login',{email:REP,password:devPassword()},{headers:{origin:'https://evil.example'}}));
    expect(response.status).toBe(403);
    expect(authCookies(new Jar().take(response))).toEqual([]);
  });
});

describe('POST /api/auth/signout',()=>{
  it('logs logout, clears the session cookies, revokes the session and sends the browser to /login',async()=>{
    const id=await userId(REP);
    const {jar}=await signIn();
    const cookieBefore=jar.header();
    const before=(await activity(id,'logout')).length;
    const response=await signout(post('/api/auth/signout',{},{jar,form:true}));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login`);
    jar.take(response);
    expect(authCookies(jar)).toEqual([]);
    expect(await activity(id,'logout')).toHaveLength(before+1);
    // The old cookies no longer pass the guard: the session is gone on the server too.
    const replay=await requireApiUser(new NextRequest(`${ORIGIN}/api/quotes`,{headers:{cookie:cookieBefore}}));
    expect(replay).toBeInstanceOf(Response);
    expect((replay as Response).status).toBe(401);
  });

  it('without a session it still lands on /login',async()=>{
    const response=await signout(post('/api/auth/signout',{},{form:true}));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${ORIGIN}/login`);
  });

  it('refuses a cross-origin post (a forced sign-out)',async()=>{
    const {jar}=await signIn();
    const response=await signout(post('/api/auth/signout',{},{jar,form:true,headers:{origin:'https://evil.example'}}));
    expect(response.status).toBe(403);
  });
});

describe('sign-up',()=>{
  it('is refused by the stack (sign-ups are off)',async()=>{
    const {data,error}=await anonClient().auth.signUp({email:`b2-${Date.now()}@boxt.test`,password:'a-long-enough-password-1'});
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });
});

describe('password reset',()=>{
  const mailFor=async(email:string,since:number)=>{
    for(let attempt=0;attempt<40;attempt++){
      const list=await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json() as {messages:{ID:string;Created:string;Subject:string}[]};
      const fresh=list.messages.filter(m=>Date.parse(m.Created)>=since-1000);
      if(fresh.length)return (await (await fetch(`${MAILPIT}/api/v1/message/${fresh[0].ID}`)).json()) as {HTML:string;Subject:string};
      await new Promise(r=>setTimeout(r,250));
    }
    throw new Error(`No reset email for ${email} in Mailpit (${MAILPIT}).`);
  };

  afterAll(async()=>{
    // Leave the dev user's password as db:reset set it.
    const {db}=await signedInClient(REP2).catch(()=>({db:null}));
    if(!db){
      const {jar}=await signIn(REP2,'b2-new-password-1');
      await updatePassword(post('/api/auth/update-password',{password:devPassword(),confirm:devPassword()},{jar}));
    }
  });

  it('answers every request alike, mails a confirm link, and the link lets the user set a new password',async()=>{
    const since=Date.now();
    const known=await reset(post('/api/auth/reset',{email:REP2}));
    const unknown=await reset(post('/api/auth/reset',{email:'nobody@boxt.test'}));
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());

    const mail=await mailFor(REP2,since);
    const href=/href="([^"]+)"/.exec(mail.HTML)?.[1].replaceAll('&amp;','&');
    expect(href).toBeDefined();
    const link=new URL(href!);
    expect(link.pathname).toBe('/auth/confirm');
    expect(link.searchParams.get('type')).toBe('recovery');
    expect(link.searchParams.get('token_hash')).toMatch(/\w{20,}/);
    expect(link.searchParams.get('next')).toBe('/update-password');

    // Following the link signs the user in for the recovery and sends them to /update-password.
    const confirmed=await confirm(get(`${link.pathname}${link.search}`));
    expect([303,307]).toContain(confirmed.status);
    expect(confirmed.headers.get('location')).toBe(`${ORIGIN}/update-password`);
    const jar=new Jar().take(confirmed);
    expect(authCookies(jar).length).toBeGreaterThan(0);

    // The link works once.
    const again=await confirm(get(`${link.pathname}${link.search}`));
    expect(again.headers.get('location')).toBe(`${ORIGIN}/reset-password?error=expired`);

    // Too short, or not confirmed: refused, nothing changes.
    expect((await updatePassword(post('/api/auth/update-password',{password:'short',confirm:'short'},{jar}))).status).toBe(400);
    expect((await updatePassword(post('/api/auth/update-password',{password:'b2-new-password-1',confirm:'b2-other-1'},{jar}))).status).toBe(400);

    const updated=await updatePassword(post('/api/auth/update-password',{password:'b2-new-password-1',confirm:'b2-new-password-1'},{jar}));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ok:true,redirectTo:'/quote-tool'});

    expect((await signIn(REP2,devPassword())).response.status).toBe(401);
    const fresh=await signIn(REP2,'b2-new-password-1');
    expect(fresh.response.status).toBe(200);

    // Put the dev password back.
    const restored=await updatePassword(post('/api/auth/update-password',{password:devPassword(),confirm:devPassword()},{jar:fresh.jar}));
    expect(restored.status).toBe(200);
    expect((await signIn(REP2,devPassword())).response.status).toBe(200);
  });

  it('sends a bad or missing link to /reset-password?error=expired',async()=>{
    for(const path of ['/auth/confirm?token_hash=not-a-real-token&type=recovery','/auth/confirm?code=not-a-real-code','/auth/confirm','/auth/confirm?token_hash=x&type=signup','/auth/confirm?token_hash=x&type=magiclink']){
      const response=await confirm(get(path));
      expect(response.headers.get('location'),path).toBe(`${ORIGIN}/reset-password?error=expired`);
      expect(authCookies(new Jar().take(response)),path).toEqual([]);
    }
  });

  it('update-password refuses a request without a session',async()=>{
    const response=await updatePassword(post('/api/auth/update-password',{password:'b2-new-password-1',confirm:'b2-new-password-1'}));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({error:COPY.linkExpired});
  });
});
