'use client';
import {useEffect} from 'react';
import s from './MoreMenu.module.css';

// A short message at the bottom of the screen (mockup .toast): "Duplicating Q-24817…",
// "Duplicated Q-24817 as Q-24830", "Sample quote reset". The live region is always in the page,
// so screen readers hear each message; a failure is an alert that stays until dismissed.

export interface ToastMessage {
  text:string;
  /** progress: stays while the action runs; done: hides after a few seconds; error: stays until dismissed. */
  tone:'progress'|'done'|'error';
}

/** How long a "done" message stays (the mockup's toast). */
export const TOAST_MS=3200;

export function QuoteToast({message,onDismiss}:{message:ToastMessage|null;onDismiss:()=>void}){
  useEffect(()=>{
    if(message?.tone!=='done')return;
    const timer=setTimeout(onDismiss,TOAST_MS);
    return()=>clearTimeout(timer);
  },[message,onDismiss]);
  const error=message?.tone==='error';
  return <div className={s.region}>
    <div role="status" aria-live="polite">{message&&!error&&<p className={s.toast}>{message.text}</p>}</div>
    {error&&<p className={s.toast} data-tone="error" role="alert">{message.text}<button type="button" onClick={onDismiss}>Dismiss</button></p>}
  </div>;
}
