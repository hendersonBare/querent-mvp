'use client';
import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {Info} from 'lucide-react';
import s from './Analytics.module.css';

const GUTTER=16,GAP=8,MAX_WIDTH=300;

/**
 * The "i" next to an Analytics number (spec §4: every number says how it's calculated). Hover,
 * focus or tap shows the explanation; Escape, blur, scrolling or leaving hides it. The text is
 * also the button's accessible description, so a screen reader hears it on focus.
 *
 * The tip is position: fixed and clamped to the viewport, so it never widens the page at 390px.
 */
export function InfoTip({topic,children}:{
  /** What it explains, for the button's name: "How {topic} is calculated". */
  topic:string;
  children:ReactNode;
}){
  const [open,setOpen]=useState(false);
  const [place,setPlace]=useState<{top:number;left:number;width:number}|null>(null);
  const button=useRef<HTMLButtonElement>(null),tip=useRef<HTMLSpanElement>(null);
  const id=useId();

  const show=useCallback(()=>{
    const rect=button.current?.getBoundingClientRect();
    if(rect){
      const viewport=document.documentElement.clientWidth||window.innerWidth;
      const width=Math.min(MAX_WIDTH,viewport-2*GUTTER);
      const left=Math.max(GUTTER,Math.min(rect.left+rect.width/2-width/2,viewport-GUTTER-width));
      setPlace({top:rect.bottom+GAP,left,width});
    }
    setOpen(true);
  },[]);
  const hide=useCallback(()=>setOpen(false),[]);

  // Not enough room below: show it above the button instead.
  useLayoutEffect(()=>{
    if(!open||!place||!tip.current||!button.current)return;
    const height=tip.current.offsetHeight,rect=button.current.getBoundingClientRect(),above=rect.top-GAP-height;
    if(rect.bottom+GAP+height>window.innerHeight-GAP&&above>=GAP)setPlace(p=>p&&p.top!==above?{...p,top:above}:p);
  },[open,place]);

  useEffect(()=>{
    if(!open)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')hide();};
    window.addEventListener('keydown',escape);window.addEventListener('scroll',hide,true);window.addEventListener('resize',hide);
    return()=>{window.removeEventListener('keydown',escape);window.removeEventListener('scroll',hide,true);window.removeEventListener('resize',hide);};
  },[open,hide]);

  return <span className={s.tipAnchor} onMouseEnter={show} onMouseLeave={hide}>
    <button ref={button} type="button" className={s.tipButton} aria-label={`How ${topic} is calculated`} aria-describedby={id}
      onClick={show} onFocus={show} onBlur={hide}>
      <Info aria-hidden="true" size={15} strokeWidth={1.9}/>
    </button>
    <span ref={tip} id={id} role="tooltip" className={s.tip} hidden={!open} style={place?{top:place.top,left:place.left,width:place.width}:undefined}>{children}</span>
  </span>;
}
