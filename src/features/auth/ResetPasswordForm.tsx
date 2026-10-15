'use client';
import {useState,type FormEvent} from 'react';
import {COPY} from './copy';
import {LOGIN_PATH} from './paths';
import s from './Auth.module.css';

// "Forgot password?": asks for the email and posts it to /api/auth/reset (fetch, or a plain form post
// without JavaScript). Whatever the answer, it says the same thing, so it never tells whether an
// account exists for the email.

export function ResetPasswordForm({expired=false,emailMissing=false,sent:initiallySent=false}:{expired?:boolean;emailMissing?:boolean;sent?:boolean}){
  const [email,setEmail]=useState('');
  const [sent,setSent]=useState(initiallySent);
  const [problem,setProblem]=useState<string|null>(expired?COPY.linkExpired:emailMissing?COPY.emailRequired:null);
  const [pending,setPending]=useState(false);

  async function onSubmit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!email.trim()){setProblem(COPY.emailRequired);return;}
    setPending(true);
    setProblem(null);
    try{
      await fetch('/api/auth/reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:email.trim()})});
      setSent(true);
    }catch{
      setProblem('The request could not be sent. Check your connection and try again.');
    }finally{
      setPending(false);
    }
  }

  const back=<p className={s.back}><a className={s.link} href={LOGIN_PATH}>Back to sign in</a></p>;
  if(sent)return <>
    <div className={s.form}><p className={s.status} role="status">{COPY.resetSent}</p></div>
    {back}
  </>;
  return <>
    <form className={s.form} method="post" action="/api/auth/reset" onSubmit={onSubmit} noValidate>
      {problem?<p className={s.alert} role="alert">{problem}</p>:null}
      <div className={s.field}>
        <label className={s.label} htmlFor="reset-email">Email</label>
        <input className={s.input} id="reset-email" name="email" type="email" autoComplete="username" required autoFocus value={email} onChange={e=>setEmail(e.target.value)}/>
      </div>
      <button className={s.primary} type="submit" disabled={pending}>{pending?'Sending…':'Send reset link'}</button>
    </form>
    {back}
  </>;
}
