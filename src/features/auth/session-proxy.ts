import {NextResponse,type NextRequest} from 'next/server';
import {createServerClient} from '@supabase/ssr';
import {COPY} from './copy';
import {supabaseEnv} from './env';
import {APP_HOME,isStaticAsset,loginPath,routeDecision} from './paths';
import {authCookieOptions,isHttps} from './cookie-options';

// What src/proxy.ts runs on every matched request (docs/boxt/plan.md "Layout": src/proxy.ts):
//   1. refresh the Supabase session: the @supabase/ssr pattern, reading the request's cookies and
//      writing refreshed ones both onto the request (so this request's pages and handlers see them)
//      and onto the response (so the browser keeps them);
//   2. gate by routeDecision (./paths.ts): pages without a session → 307 /login?next=<path>,
//      /api/* → 401 JSON, a signed-in user on /login → /quote-tool.
// The user is validated with getUser() (the Auth server checks the token), so a revoked session is
// treated as none here exactly as requireUser() treats it, and the two can never disagree into a loop.
// If Supabase is unreachable or not configured, the request counts as signed out (fail closed).

export {routeDecision} from './paths';

/** Copies the cookies (and cache headers) the session refresh wrote onto another response. */
function carry(from:NextResponse,to:NextResponse):NextResponse{
  for(const cookie of from.cookies.getAll())to.cookies.set(cookie);
  for(const key of ['cache-control','expires','pragma']){const value=from.headers.get(key);if(value)to.headers.set(key,value);}
  return to;
}

export async function updateSession(request:NextRequest):Promise<NextResponse>{
  const {pathname,search}=request.nextUrl;
  if(isStaticAsset(pathname))return NextResponse.next();

  let response=NextResponse.next({request});
  let hasUser=false;
  try{
    const {url,anonKey}=supabaseEnv();
    const supabase=createServerClient(url,anonKey,{
      cookieOptions:authCookieOptions(isHttps(request.headers,request.url)),
      cookies:{
        getAll:()=>request.cookies.getAll(),
        setAll(list,cacheHeaders){
          for(const {name,value} of list)request.cookies.set(name,value);
          response=NextResponse.next({request});
          for(const {name,value,options} of list)response.cookies.set(name,value,options);
          for(const [key,value] of Object.entries(cacheHeaders))response.headers.set(key,value);
        },
      },
    });
    // Nothing may run between creating the client and this call (see @supabase/ssr's guidance).
    const {data,error}=await supabase.auth.getUser();
    hasUser=!error&&!!data.user;
  }catch{
    hasUser=false;
  }

  switch(routeDecision(pathname,hasUser)){
    case 'allow':return response;
    case 'redirect-app':return carry(response,NextResponse.redirect(new URL(APP_HOME,request.url)));
    case 'redirect-login':return carry(response,NextResponse.redirect(new URL(loginPath(pathname,search),request.url)));
    case 'unauthorized':return carry(response,NextResponse.json({error:COPY.signInToContinue},{status:401,headers:{'cache-control':'no-store'}}));
  }
}
