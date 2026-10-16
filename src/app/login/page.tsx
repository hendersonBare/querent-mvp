import type {Metadata} from 'next';
import {AuthCard} from '@/features/auth/AuthCard';
import {LoginForm} from '@/features/auth/LoginForm';
import {safeNext} from '@/features/auth/paths';

export const metadata:Metadata={title:'Sign in'};

type SearchParams=Promise<Record<string,string|string[]|undefined>>;
const first=(value:string|string[]|undefined)=>Array.isArray(value)?value[0]:value;

// /login: open without a session (a signed-in user is sent to the app by the proxy). `next` is where
// to go afterwards (same-origin paths only); `error` is set when a no-JavaScript sign-in failed.
export default async function LoginPage({searchParams}:{searchParams:SearchParams}){
  const params=await searchParams;
  return <AuthCard title="Sign in" lead="Use your work email and password." foot="Accounts are set up by your administrator.">
    <LoginForm next={safeNext(first(params.next))} initialError={first(params.error)!==undefined}/>
  </AuthCard>;
}
