import type {Metadata} from 'next';
import {redirect} from 'next/navigation';
import {AuthCard} from '@/features/auth/AuthCard';
import {UpdatePasswordForm} from '@/features/auth/UpdatePasswordForm';
import {COPY} from '@/features/auth/copy';
import {RESET_PATH} from '@/features/auth/paths';
import {createSupabaseServerClient,getSessionUser} from '@/features/auth/server';

export const metadata:Metadata={title:'Choose a new password'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;
/** ?error=… after a no-JavaScript post to /api/auth/update-password. */
const ERRORS:Record<string,string>={short:COPY.passwordTooShort,long:COPY.passwordTooLong,mismatch:COPY.passwordMismatch,same:COPY.passwordSame,failed:COPY.passwordFailed};

// /update-password: the proxy lets it through, and it needs the session a reset link created
// (/auth/confirm). Without one the visitor goes back to /reset-password, which explains the link expired.
export default async function UpdatePasswordPage({searchParams}:{searchParams:SearchParams}){
  const user=await getSessionUser(await createSupabaseServerClient());
  if(!user)redirect(`${RESET_PATH}?error=expired`);
  const error=first((await searchParams).error);
  return <AuthCard title="Choose a new password" lead={<>For <strong>{user.email}</strong>.</>}>
    <UpdatePasswordForm initialError={error?ERRORS[error]:undefined}/>
  </AuthCard>;
}
