'use client';
import {useEffect,useId,useRef} from 'react';
import d from '@/components/ui/Dialog.module.css';
import {QUOTE_COPY} from './copy';
import s from './Quotes.module.css';

// "Delete this quote?" (docs/boxt/plan.md B6): a centered confirm in the shared dialog look
// (src/components/ui/Dialog.module.css) with a neutral Cancel and a red "Delete quote". Cancel, Escape
// or a click outside closes it while nothing is in flight; the refusal, if any, shows inside it.

export function DeleteQuoteDialog({busy,error,onCancel,onConfirm}:{busy:boolean;error:string|null;onCancel:()=>void;onConfirm:()=>void}){
  const titleId=useId(),introId=useId();
  const cancelRef=useRef<HTMLButtonElement>(null);
  useEffect(()=>{cancelRef.current?.focus();},[]);
  const close=()=>{if(!busy)onCancel();};
  return <div className={d.backdrop} onMouseDown={event=>{if(event.target===event.currentTarget)close();}}>
    <div className={`${d.dialog} ${s.confirm}`} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={introId} tabIndex={-1}
      onKeyDown={event=>{
        if(event.key==='Escape'){event.stopPropagation();close();return;}
        if(event.key!=='Tab')return;
        // Keep focus inside the dialog.
        const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        if(buttons.length===0){event.preventDefault();return;}
        const first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }}>
      <header className={d.head}>
        <h2 className={d.title} id={titleId}>{QUOTE_COPY.deleteTitle}</h2>
        <p className={d.intro} id={introId}>{QUOTE_COPY.deleteIntro}</p>
        {error&&<p className={s.dialogError} role="alert">{error}</p>}
      </header>
      <footer className={`${d.foot} ${s.confirmFoot}`}>
        <div className={d.actions}>
          <button type="button" ref={cancelRef} className={d.secondary} onClick={close} disabled={busy}>{QUOTE_COPY.cancel}</button>
          <button type="button" className={s.dangerButton} onClick={onConfirm} disabled={busy}>{busy?QUOTE_COPY.deleting:QUOTE_COPY.deleteConfirm}</button>
        </div>
      </footer>
    </div>
  </div>;
}
