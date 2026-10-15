import type {NextRequest} from 'next/server';
import {seeOther} from '@/features/auth/http';
import {APP_HOME,RESET_PATH,UPDATE_PASSWORD_PATH,safeNext} from '@/features/auth/paths';
import {createRequestClient} from '@/features/auth/server';

// GET /auth/confirm: where a password-reset email's link lands. Two link shapes:
//   ?token_hash=…&type=recovery&next=/update-password  (supabase/templates/recovery.html) → verifyOtp
//   ?code=…&next=/update-password                       (Supabase's PKCE redirect)        → exchangeCodeForSession
// Either signs the user in for the recovery and redirects to `next` (same-origin paths only; for a
// recovery the default is /update-password, else /quote-tool). Only recovery links are accepted: there is
// no sign-up, magic-link or e-mail OTP sign-in. A bad, used or expired link goes to
// /reset-password?error=expired, which says so and offers a new link.
export async function GET(request:NextRequest){
  const params=request.nextUrl.searchParams;
  const tokenHash=params.get('token_hash'),type=params.get('type'),code=params.get('code');
  const expired=()=>seeOther(`${RESET_PATH}?error=expired`);

  const {db,applyCookies}=createRequestClient(request);
  let ok=false;
  try{
    if(tokenHash&&type==='recovery')ok=!(await db.auth.verifyOtp({type:'recovery',token_hash:tokenHash})).error;
    else if(code&&!tokenHash)ok=!(await db.auth.exchangeCodeForSession(code)).error;
  }catch{
    ok=false;
  }
  if(!ok)return expired();
  const fallback=type==='recovery'||code?UPDATE_PASSWORD_PATH:APP_HOME;
  return applyCookies(seeOther(safeNext(params.get('next'),fallback)));
}
