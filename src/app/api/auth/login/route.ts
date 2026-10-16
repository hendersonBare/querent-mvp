import type {NextRequest} from 'next/server';
import {logActivity} from '@/server/repository';
import {LOGIN_METADATA} from '@/features/auth/activity';
import {crossOriginResponse,isSameOrigin} from '@/features/auth/api';
import {COPY} from '@/features/auth/copy';
import {json,readBody,seeOther,text} from '@/features/auth/http';
import {LOGIN_PATH,safeNext} from '@/features/auth/paths';
import {createRequestClient} from '@/features/auth/server';

// POST /api/auth/login: email and password (JSON from the login form, or a plain form post). One answer
// for every failure, "Email or password is incorrect.", so it never tells whether an account exists.
// On success the session cookies are set on the response and a `login` row is logged.
export async function POST(request:NextRequest){
  if(!isSameOrigin(request))return crossOriginResponse();
  const {fields,form}=await readBody(request);
  const next=safeNext(fields.next);
  const email=text(fields.email).trim(),password=text(fields.password);

  const {db,applyCookies}=createRequestClient(request);
  let signedIn=false;
  if(email&&password){
    try{
      const {data,error}=await db.auth.signInWithPassword({email,password});
      signedIn=!error&&!!data.user;
    }catch{
      signedIn=false;
    }
  }
  if(!signedIn)return form?seeOther(`${LOGIN_PATH}?error=1&next=${encodeURIComponent(next)}`):json({error:COPY.loginFailed},401);

  await logActivity(db,'login',LOGIN_METADATA);
  return applyCookies(form?seeOther(next):json({ok:true,redirectTo:next}));
}
