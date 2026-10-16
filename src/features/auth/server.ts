import 'server-only';
import {cookies,headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {createServerClient,parseCookieHeader,serializeCookieHeader,type CookieOptions} from '@supabase/ssr';
import type {User} from '@supabase/supabase-js';
import type {Database,Db} from '@/server/repository';
import {authCookieOptions,isHttps} from './cookie-options';
import {COPY} from './copy';
import {supabaseEnv} from './env';
import {APP_HOME,loginPath} from './paths';

// Supabase clients and session guards for the server (docs/boxt/plan.md product rule 7).
//
// Every client is built from the project URL, the anon key and the request's session cookies, so what
// it does runs as the signed-in user and RLS applies. Authorization always goes through getUser(),
// which asks the Auth server to validate the token (a signed-out or deleted user fails even while the
// cookie's JWT has not expired); getSession() alone is never trusted on the server.
//
//   Pages and layouts:  const {user,db}=await requireUser('/quotes');   // or redirect to /login?next=…
//   Route handlers:     export const GET=withApiUser(async(request,{user,db})=>…);   (./api.ts)
//                       or: const session=await requireApiUser(request); if(session instanceof Response)return session;

/**
 * For pages, layouts and server actions: the session from next/headers' cookies().
 * cookies() comes first, before the env is read: it makes the page dynamic, so `next build` stops
 * prerendering there and builds without any Supabase env (CI builds before the stack starts;
 * follow-up F1). At run time a missing env still throws (fail closed).
 */
export async function createSupabaseServerClient():Promise<Db>{
  const store=await cookies();
  const secure=isHttps(await headers());
  const {url,anonKey}=supabaseEnv();
  return createServerClient<Database>(url,anonKey,{
    cookieOptions:authCookieOptions(secure),
    cookies:{
      getAll:()=>store.getAll(),
      setAll(list){
        // Server components cannot set cookies; the proxy has already refreshed the session for this
        // request, so a refresh here is only lost, never wrong.
        try{for(const {name,value,options} of list)store.set(name,value,options);}catch{}
      },
    },
  });
}

/** A client for one route-handler request: cookies come from the request; cookie writes wait for applyCookies(response). */
export interface RequestClient {
  db:Db;
  /** Adds the session cookies this request changed (sign-in, refresh, sign-out) and their no-store headers to `response`. */
  applyCookies<R extends Response>(response:R):R;
}

export function createRequestClient(request:Request):RequestClient{
  const {url,anonKey}=supabaseEnv();
  const pending=new Map<string,{value:string;options:CookieOptions}>();
  const pendingHeaders:Record<string,string>={};
  const db=createServerClient<Database>(url,anonKey,{
    cookieOptions:authCookieOptions(isHttps(request.headers,request.url)),
    cookies:{
      getAll:()=>parseCookieHeader(request.headers.get('cookie')??'').map(({name,value})=>({name,value:value??''})),
      setAll(list,cacheHeaders){
        for(const {name,value,options} of list)pending.set(name,{value,options});
        Object.assign(pendingHeaders,cacheHeaders);
      },
    },
  });
  return {
    db,
    applyCookies(response){
      for(const [name,{value,options}] of pending)response.headers.append('Set-Cookie',serializeCookieHeader(name,value,options));
      for(const [key,value] of Object.entries(pendingHeaders))response.headers.set(key,value);
      return response;
    },
  };
}

/** The signed-in user, validated by the Auth server, or null (no session, an invalid one, or Auth unreachable). */
export async function getSessionUser(db:Db):Promise<User|null>{
  try{
    const {data,error}=await db.auth.getUser();
    return error?null:data.user??null;
  }catch{
    return null;
  }
}

export interface Session {user:User;db:Db}

/**
 * For pages and layouts: the signed-in user and their client, or a redirect to /login carrying `next`
 * (the page's own path, so the user comes back to it). The proxy redirects first; this is the second check.
 */
export async function requireUser(next:string=APP_HOME):Promise<Session>{
  const db=await createSupabaseServerClient();
  const user=await getSessionUser(db);
  if(!user)redirect(loginPath(next));
  return {user,db};
}

/** The 401 every API answers without a session. */
export function unauthorizedResponse(message:string=COPY.signInToContinue):Response{
  return Response.json({error:message},{status:401,headers:{'cache-control':'no-store'}});
}

export interface ApiSession extends Session {
  /** Adds refreshed session cookies to the handler's response (a no-op when the client came from cookies()). */
  applyCookies<R extends Response>(response:R):R;
}

/**
 * For route handlers: the signed-in user and their client, or a 401 JSON response
 * `{error:'Sign in to continue.'}` to return as is. With `request` the cookies are read from it (and
 * refreshed cookies go out through applyCookies); without, from next/headers.
 */
export async function requireApiUser(request?:Request):Promise<ApiSession|Response>{
  if(request){
    const {db,applyCookies}=createRequestClient(request);
    const user=await getSessionUser(db);
    return user?{user,db,applyCookies}:unauthorizedResponse();
  }
  const db=await createSupabaseServerClient();
  const user=await getSessionUser(db);
  return user?{user,db,applyCookies:response=>response}:unauthorizedResponse();
}
