import type {NextRequest} from 'next/server';
import {crossOriginResponse,isSameOrigin} from '@/features/auth/api';
import {COPY,MIN_PASSWORD_LENGTH} from '@/features/auth/copy';
import {json,readBody,seeOther,text} from '@/features/auth/http';
import {APP_HOME,UPDATE_PASSWORD_PATH} from '@/features/auth/paths';
import {createRequestClient,unauthorizedResponse} from '@/features/auth/server';

// POST /api/auth/update-password: sets a new password for the signed-in user, normally right after a
// reset link signed them in (/auth/confirm). Needs that session: without one, 401. The password must
// be at least 8 characters (bcrypt reads at most 72 bytes) and match its confirmation.

const MAX_PASSWORD_BYTES=72;
type Problem='short'|'long'|'mismatch'|'same'|'failed';
const MESSAGES:Record<Problem,string>={
  short:COPY.passwordTooShort,
  long:COPY.passwordTooLong,
  mismatch:COPY.passwordMismatch,
  same:COPY.passwordSame,
  failed:COPY.passwordFailed,
};

export async function POST(request:NextRequest){
  if(!isSameOrigin(request))return crossOriginResponse();
  const {fields,form}=await readBody(request);
  const fail=(problem:Problem)=>form?seeOther(`${UPDATE_PASSWORD_PATH}?error=${problem}`):json({error:MESSAGES[problem]},400);

  const {db,applyCookies}=createRequestClient(request);
  const {data:{user}}=await db.auth.getUser().catch(()=>({data:{user:null}}));
  if(!user)return form?seeOther('/reset-password?error=expired'):unauthorizedResponse(COPY.linkExpired);

  const password=text(fields.password),confirm=text(fields.confirm);
  if(password.length<MIN_PASSWORD_LENGTH)return fail('short');
  if(new TextEncoder().encode(password).length>MAX_PASSWORD_BYTES)return fail('long');
  if(password!==confirm)return fail('mismatch');

  const {error}=await db.auth.updateUser({password}).catch(()=>({error:{code:'failed'}}));
  if(error)return applyCookies(fail(error.code==='same_password'?'same':'failed'));
  return applyCookies(form?seeOther(APP_HOME):json({ok:true,redirectTo:APP_HOME}));
}
