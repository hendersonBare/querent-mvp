'use client';
import {useState,type FormEvent} from 'react';
import {COPY} from './copy';
import {RESET_PATH,safeNext} from './paths';
import s from './Auth.module.css';

// The sign-in form. It posts to /api/auth/login with fetch, and without JavaScript as a plain form post
// (the API then redirects). Every failure shows the same message, whatever the server said, so the
// form never tells whether an account exists.

/** A full page load, so the server renders the app with the new session cookie. */
const assign=(url:string)=>window.location.assign(url);

export function LoginForm({next,initialError=false,navigate=assign}:{next:string;initialError?:boolean;navigate?:(url:string)=>void}){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [failed,setFailed]=useState(initialError);
  const [pending,setPending]=useState(false);

  async function onSubmit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    setPending(true);
    setFailed(false);
    try{
      const response=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email,password,next})});
      if(response.ok){
        const body=await response.json().catch(()=>({}));
        navigate(safeNext(body.redirectTo,next));
        return;
      }
    }catch{
      // Shown as the same failure below.
    }
    setFailed(true);
    setPending(false);
  }

  return <form className={s.form} method="post" action="/api/auth/login" onSubmit={onSubmit} noValidate>
    {failed?<p className={s.alert} role="alert">{COPY.loginFailed}</p>:null}
    <input type="hidden" name="next" value={next}/>
    <div className={s.field}>
      <label className={s.label} htmlFor="login-email">Email</label>
      <input className={s.input} id="login-email" name="email" type="email" autoComplete="username" required autoFocus value={email} onChange={e=>setEmail(e.target.value)}/>
    </div>
    <div className={s.field}>
      <div className={s.labelRow}>
        <label className={s.label} htmlFor="login-password">Password</label>
        <a className={s.link} href={RESET_PATH}>Forgot password?</a>
      </div>
      <input className={s.input} id="login-password" name="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/>
    </div>
    <button className={s.primary} type="submit" disabled={pending}>{pending?'Signing in…':'Sign in'}</button>
  </form>;
}
