import 'server-only';
import type {NextRequest} from 'next/server';
import {COPY} from './copy';
import {requireApiUser,type ApiSession} from './server';

// Helpers for route handlers (B5 to B7 wrap themselves in one line):
//
//   export const GET=withApiUser(async(request,{user,db})=>Response.json(await listQuotes(db)));
//   export const PATCH=withApiUser(async(request,{db},{params}:{params:Promise<{id:string}>})=>…);
//
// withApiUser refuses a cross-origin state-changing request (403), then answers 401 without a session,
// and only then runs the handler, with the user and their RLS-scoped client. Refreshed session cookies
// are added to the handler's response.

const STATE_CHANGING=new Set(['POST','PUT','PATCH','DELETE']);

/**
 * CSRF check for a state-changing request: true when the browser says it came from this app (its
 * Origin is the app's host, behind a reverse proxy the forwarded host), or when there is no Origin at
 * all (not a browser form or fetch; a browser always sends one on POST). An opaque "null" origin or a
 * cross-site fetch is refused.
 */
export function isSameOrigin(request:Request):boolean{
  if(request.headers.get('sec-fetch-site')==='cross-site')return false;
  const origin=request.headers.get('origin');
  if(origin===null)return true;
  let originHost:string;
  try{originHost=new URL(origin).host;}catch{return false;}
  if(!originHost)return false;
  const appHost=request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()||request.headers.get('host')||new URL(request.url).host;
  return originHost===appHost;
}

export function crossOriginResponse():Response{
  return Response.json({error:COPY.crossOrigin},{status:403,headers:{'cache-control':'no-store'}});
}

export type ApiHandler<Context>=(request:NextRequest,session:ApiSession,context:Context)=>Response|Promise<Response>;

export function withApiUser<Context=unknown>(handler:ApiHandler<Context>){
  return async(request:NextRequest,context:Context):Promise<Response>=>{
    if(STATE_CHANGING.has(request.method)&&!isSameOrigin(request))return crossOriginResponse();
    const session=await requireApiUser(request);
    if(session instanceof Response)return session;
    return session.applyCookies(await handler(request,session,context));
  };
}
