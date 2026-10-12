'use client';
import {useEffect,useId,useRef,type ReactNode} from 'react';
import {SiteIcon,type SiteIconName} from './icons';
import s from './site.module.css';

/**
 * A side sheet of the customer site (plan U10; C_CVL2 Orders, C_CVL3 My rep): 400 wide on the right,
 * under the strip, over a green-black backdrop. Its icon, title, an optional count, and the close
 * button. Escape, the close button or a press on the backdrop closes it; focus moves in and comes back.
 */
export function SiteSheet({title,icon,count,onClose,children}:{title:string;icon:SiteIconName;count?:number;onClose:()=>void;children:ReactNode}){
  const ref=useRef<HTMLElement>(null);
  const close=useRef(onClose);
  const id=useId();
  useEffect(()=>{close.current=onClose;});
  useEffect(()=>{
    const before=document.activeElement as HTMLElement|null;
    ref.current?.focus({preventScroll:true});
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close.current();};
    document.addEventListener('keydown',key);
    return ()=>{document.removeEventListener('keydown',key);before?.focus({preventScroll:true});};
  },[]);
  return <>
    <div className={s.sheetBackdrop} data-ui="site-sheet-backdrop" onMouseDown={onClose}/>
    <aside ref={ref} className={s.sheet} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} data-ui="site-sheet">
      <div className={s.sheetHead}>
        <span className={s.sheetIcon}><SiteIcon name={icon} size={20}/></span>
        <span id={id} className={s.sheetTitle}>{title}</span>
        {count!==undefined&&<span className={s.count}>{count}</span>}
        <button type="button" aria-label="Close" className={s.close} onClick={onClose}><SiteIcon name="close" size={17}/></button>
      </div>
      <div className={s.sheetBody}>{children}</div>
    </aside>
  </>;
}
