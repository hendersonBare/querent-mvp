import type {NextRequest} from 'next/server';
import {crossOriginResponse,isSameOrigin} from '@/features/auth/api';
import {COPY} from '@/features/auth/copy';
import {appOrigin,json,readBody,seeOther,text} from '@/features/auth/http';
import {CONFIRM_PATH,RESET_PATH,UPDATE_PASSWORD_PATH} from '@/features/auth/paths';
import {createRequestClient} from '@/features/auth/server';

// POST /api/auth/reset: asks Supabase to mail a reset link. The answer is the same whether or not an
// account exists, and whatever Supabase said (rate limits included), so it cannot be used to find
// accounts. The link (supabase/templates/recovery.html) opens /auth/confirm, which signs the user in
// for the recovery and sends them to /update-password.
export async function POST(request:NextRequest){
  if(!isSameOrigin(request))return crossOriginResponse();
  const {fields,form}=await readBody(request);
  const email=text(fields.email).trim();
  if(!email||email.length>320||!email.includes('@'))return form?seeOther(`${RESET_PATH}?error=email`):json({error:COPY.emailRequired},400);

  const {db,applyCookies}=createRequestClient(request);
  try{
    await db.auth.resetPasswordForEmail(email,{redirectTo:`${appOrigin(request)}${CONFIRM_PATH}?next=${UPDATE_PASSWORD_PATH}`});
  }catch{
    // Same answer either way.
  }
  // The cookies hold the PKCE verifier for a `code` link; the template's token_hash link does not need it.
  return applyCookies(form?seeOther(`${RESET_PATH}?sent=1`):json({ok:true,message:COPY.resetSent}));
}
