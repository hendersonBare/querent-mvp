'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {CheckIcon} from '../icons';
import s from '../QuoteDetail.module.css';

// A short message at the bottom centre of the screen (plan U4, C_QE11 "Draft saved at 10:26 PM"): the
// charcoal toast with the check, for something done ("Exported Q-24817 customer quote.pdf", "Duplicated
// Q-24817 as Q-24830"). No frame draws the others, which use the same toast without the check: a
// running action ("Duplicating Q-24817…") and a failure, an alert that stays until dismissed. The quote
// editor keeps one stack for them (TOAST_STACK), so two never overlap; the live region is always in the
// page, so screen readers hear each message.

export interface ToastMessage {
  text:string;
  /** progress: stays while the action runs; done: hides after a few seconds; error: stays until dismissed. */
  tone:'progress'|'done'|'error';
}

/** How long a "done" message stays. */
export const TOAST_MS=3200;

/** The id of the editor's toast stack (QuoteDetailView renders it). */
export const TOAST_STACK='quote-toasts';

/** Renders into the editor's toast stack once it is in the page; on its own (a test, another page) where it is. */
export function ToastSlot({children}:{children:ReactNode}){
  const [stack,setStack]=useState<HTMLElement|null>(null);
  useEffect(()=>setStack(document.getElementById(TOAST_STACK)),[]);
  return stack?createPortal(children,stack):<div className={s.toasts}>{children}</div>;
}

export function QuoteToast({message,onDismiss}:{message:ToastMessage|null;onDismiss:()=>void}){
  useEffect(()=>{
    if(message?.tone!=='done')return;
    const timer=setTimeout(onDismiss,TOAST_MS);
    return()=>clearTimeout(timer);
  },[message,onDismiss]);
  const error=message?.tone==='error';
  return <ToastSlot>
    <div role="status" aria-live="polite">{message&&!error&&<Toast text={message.text} done={message.tone==='done'}/>}</div>
    {error&&<div className={s.toast} data-tone="error" role="alert"><span className={s.toastText}>{message.text}</span>
      <button type="button" className={s.toastAction} onClick={onDismiss}>Dismiss</button></div>}
  </ToastSlot>;
}

/** One toast: the check (when done) and its text, and an optional action (Undo). */
export function Toast({text,done=false,action}:{text:string;done?:boolean;action?:ReactNode}){
  return <div className={s.toast}>
    {done&&<span className={s.toastIcon}><CheckIcon/></span>}
    <span className={s.toastText}>{text}</span>
    {action}
  </div>;
}
