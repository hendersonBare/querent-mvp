import type {Metadata} from 'next';
import {AuthCard} from '@/features/auth/AuthCard';
import {ResetPasswordForm} from '@/features/auth/ResetPasswordForm';

export const metadata:Metadata={title:'Reset password'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;

// /reset-password: ask for a reset link. ?error=expired after a bad or used link (/auth/confirm);
// ?sent=1 (or ?error=email) after a no-JavaScript request.
export default async function ResetPasswordPage({searchParams}:{searchParams:SearchParams}){
  const params=await searchParams;
  return <AuthCard title="Reset your password" lead="Enter your work email and we will send you a link to choose a new password.">
    <ResetPasswordForm expired={first(params.error)==='expired'} emailMissing={first(params.error)==='email'} sent={first(params.sent)==='1'}/>
  </AuthCard>;
}
