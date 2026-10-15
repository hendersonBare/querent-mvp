import type {CookieOptions} from '@supabase/ssr';

// The session cookies' options, shared by the proxy (./session-proxy.ts) and the server clients
// (./server.ts) so every write of a cookie uses the same attributes.

/** HttpOnly (no browser code reads them; there is no browser Supabase client), SameSite=Lax, Secure over HTTPS. */
export function authCookieOptions(secure:boolean):CookieOptions{
  return {path:'/',sameSite:'lax',httpOnly:true,secure};
}

/** Whether the browser reached the app over HTTPS (behind a TLS-terminating proxy too). */
export function isHttps(requestHeaders:Headers,url?:string):boolean{
  const forwarded=requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if(forwarded)return forwarded==='https';
  return url?new URL(url).protocol==='https:':false;
}
