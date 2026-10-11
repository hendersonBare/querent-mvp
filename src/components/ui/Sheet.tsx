'use client';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import s from './Sheet.module.css';

/**
 * A side sheet (plan U0; C_QOB5 quote preview): a modal dialog on the right with a title, an optional
 * subtitle and the "x" close button. Escape, the close button or a press on the backdrop closes it.
 * It renders into <body> inside a .ui-root layer, so it keeps the new UI's base styles.
 */
export function Sheet({open,title,subtitle,onClose,children}:{open:boolean;title:string;subtitle?:ReactNode;onClose:()=>void;children?:ReactNode}){
  const [mounted,setMounted]=useState(false);
  const ref=useRef<HTMLElement>(null);
  const close=useRef(onClose);
  const id=useId();
  useEffect(()=>{close.current=onClose;});
  useEffect(()=>setMounted(true),[]);
  useEffect(()=>{
    if(!open)return;
    const before=document.activeElement as HTMLElement|null;
    ref.current?.focus({preventScroll:true});
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close.current();};
    document.addEventListener('keydown',key);
    return ()=>{document.removeEventListener('keydown',key);before?.focus({preventScroll:true});};
  },[open,mounted]);
  if(!open||!mounted)return null;
  return createPortal(<div className={`ui-root ${s.layer}`}>
    <div data-ui="sheet-backdrop" data-testid="sheet-backdrop" className={s.backdrop} onMouseDown={onClose}/>
    <aside ref={ref} data-ui="sheet" role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} className={s.sheet}>
      <div className={s.head}>
        <div>
          <h2 id={id} className={s.title}>{title}</h2>
          {subtitle&&<div data-ui="subtitle" className={s.subtitle}>{subtitle}</div>}
        </div>
        <button type="button" data-ui="close" aria-label="Close" className={s.close} onClick={onClose}>x</button>
      </div>
      {children}
    </aside>
  </div>,document.body);
}
