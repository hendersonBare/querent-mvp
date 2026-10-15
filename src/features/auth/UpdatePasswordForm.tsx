'use client';
import {useState,type FormEvent} from 'react';
import {COPY,MIN_PASSWORD_LENGTH} from './copy';
import {APP_HOME,safeNext} from './paths';
import s from './Auth.module.css';

// The new-password form, reached from a reset link (/auth/confirm signs the user in for the recovery).
// It checks length and confirmation here, then posts to /api/auth/update-password, which checks them
// again and sets the password; then the app opens.

const assign=(url:string)=>window.location.assign(url);
const KNOWN=new Set<string>(Object.values(COPY));

export function UpdatePasswordForm({initialError,navigate=assign}:{initialError?:string;navigate?:(url:string)=>void}){
  const [password,setPassword]=useState('');
  const [confirm,setConfirm]=useState('');
  const [problem,setProblem]=useState<string|null>(initialError??null);
  const [pending,setPending]=useState(false);

  async function onSubmit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(password.length<MIN_PASSWORD_LENGTH){setProblem(COPY.passwordTooShort);return;}
    if(password!==confirm){setProblem(COPY.passwordMismatch);return;}
    setPending(true);
    setProblem(null);
    try{
      const response=await fetch('/api/auth/update-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password,confirm})});
      const body=await response.json().catch(()=>({}));
      if(response.ok){navigate(safeNext(body.redirectTo,APP_HOME));return;}
      setProblem(typeof body.error==='string'&&KNOWN.has(body.error)?body.error:COPY.passwordFailed);
    }catch{
      setProblem(COPY.passwordFailed);
    }
    setPending(false);
  }

  return <form className={s.form} method="post" action="/api/auth/update-password" onSubmit={onSubmit} noValidate>
    {problem?<p className={s.alert} role="alert">{problem}</p>:null}
    <div className={s.field}>
      <label className={s.label} htmlFor="new-password">New password</label>
      <input className={s.input} id="new-password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} autoFocus aria-describedby="new-password-hint" value={password} onChange={e=>setPassword(e.target.value)}/>
      <span className={s.hint} id="new-password-hint">At least {MIN_PASSWORD_LENGTH} characters.</span>
    </div>
    <div className={s.field}>
      <label className={s.label} htmlFor="confirm-password">Confirm new password</label>
      <input className={s.input} id="confirm-password" name="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e=>setConfirm(e.target.value)}/>
    </div>
    <button className={s.primary} type="submit" disabled={pending}>{pending?'Saving…':'Set new password'}</button>
  </form>;
}
