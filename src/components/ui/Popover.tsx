'use client';
import {useEffect,useRef,type CSSProperties,type ReactNode,type RefObject} from 'react';
import s from './Popover.module.css';
import {cx} from './cx';

/**
 * An opened panel anchored inside a positioned parent (plan U0): a labelled dialog that takes focus
 * when it opens, gives it back when it closes, and closes on Escape or a press outside it. A press
 * inside `ignore` (the control that opens it) is not "outside", so that control can toggle it.
 */
export function Popover({open,label,onClose,ignore,className,style,children,...rest}:{
  open:boolean;label:string;onClose:()=>void;ignore?:RefObject<HTMLElement|null>;className?:string;style?:CSSProperties;children:ReactNode;
}&{'data-ui'?:string}){
  const ref=useRef<HTMLDivElement>(null);
  const close=useRef(onClose);
  useEffect(()=>{close.current=onClose;});
  useEffect(()=>{
    if(!open)return;
    const before=document.activeElement as HTMLElement|null;
    ref.current?.focus({preventScroll:true});
    // The event's path as dispatched: a press on a row that the press itself removed (a Select option
    // picked inside the panel) is still inside.
    const press=(event:MouseEvent)=>{
      const path=event.composedPath();
      const inside=(el:HTMLElement|null|undefined)=>!!el&&(path.includes(el)||el.contains(event.target as Node));
      if(inside(ref.current)||inside(ignore?.current))return;
      close.current();
    };
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close.current();};
    document.addEventListener('mousedown',press);
    document.addEventListener('keydown',key);
    const panel=ref.current;
    return ()=>{
      document.removeEventListener('mousedown',press);
      document.removeEventListener('keydown',key);
      if(panel?.contains(document.activeElement)||document.activeElement===document.body)before?.focus({preventScroll:true});
    };
  },[open,ignore]);
  if(!open)return null;
  return <div ref={ref} role="dialog" aria-label={label} tabIndex={-1} className={cx(s.popover,className)} style={style} data-ui={rest['data-ui']??'popover'}>{children}</div>;
}
