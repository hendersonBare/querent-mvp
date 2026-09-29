'use client';
import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {CircleHelp,Info} from 'lucide-react';
import s from './InfoTip.module.css';

const GUTTER=16,GAP=8,MAX_WIDTH=300;

interface Place {top:number;left:number;width:number}

/**
 * A small "i" or "?" button with a tooltip: next to an Analytics number (spec §4: every number
 * says how it's calculated), and next to Querent's price on a quote line (why that price). Hover,
 * focus or tap shows the explanation; Escape, blur or leaving hides it. The text is also the
 * button's accessible description, so a screen reader hears it on focus.
 *
 * The tip is position: fixed and clamped to the viewport, so it never widens the page at 390px.
 * Scrolling and resizing move it with its button rather than hiding it: tabbing to an "i" below
 * the fold scrolls the page, and that scroll must not close the tip the focus just opened.
 */
export function InfoTip({topic,label,icon='info',size,children}:({
  /** What it explains, for the button's name: "How {topic} is calculated". */
  topic:string;label?:undefined;
}|{
  /** The button's whole name, e.g. "Why Querent suggests $34.05 for HCS-12-13-2G8". */
  label:string;topic?:undefined;
})&{
  /** "i" (the default) or "?". */
  icon?:'info'|'help';
  /** 'sm' for a dense row (the quote line grid). */
  size?:'sm';
  children:ReactNode;
}){
  const Icon=icon==='help'?CircleHelp:Info;
  const [open,setOpen]=useState(false);
  const [place,setPlace]=useState<Place|null>(null);
  const button=useRef<HTMLButtonElement>(null),tip=useRef<HTMLSpanElement>(null);
  const id=useId();

  /** Below the button, or above it when there is no room below; clamped inside the viewport's width. */
  const position=useCallback(()=>{
    const rect=button.current?.getBoundingClientRect();
    if(!rect)return;
    const viewport=document.documentElement.clientWidth||window.innerWidth;
    const width=Math.min(MAX_WIDTH,viewport-2*GUTTER);
    const left=Math.max(GUTTER,Math.min(rect.left+rect.width/2-width/2,viewport-GUTTER-width));
    const height=tip.current?.offsetHeight??0,above=rect.top-GAP-height;
    const top=rect.bottom+GAP+height>window.innerHeight-GAP&&above>=GAP?above:rect.bottom+GAP;
    setPlace(p=>p&&p.top===top&&p.left===left&&p.width===width?p:{top,left,width});
  },[]);
  const show=useCallback(()=>{position();setOpen(true);},[position]);
  const hide=useCallback(()=>setOpen(false),[]);

  // Once the tip is showing (at its width), measure its height and settle above or below.
  useLayoutEffect(()=>{if(open)position();},[open,place?.width,position]);

  useEffect(()=>{
    if(!open)return;
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')hide();};
    window.addEventListener('keydown',escape);window.addEventListener('scroll',position,true);window.addEventListener('resize',position);
    return()=>{window.removeEventListener('keydown',escape);window.removeEventListener('scroll',position,true);window.removeEventListener('resize',position);};
  },[open,hide,position]);

  return <span className={s.tipAnchor} onMouseEnter={show} onMouseLeave={hide}>
    <button ref={button} type="button" className={s.tipButton} data-size={size} aria-label={label??`How ${topic} is calculated`} aria-describedby={id}
      onClick={show} onFocus={show} onBlur={hide}>
      <Icon aria-hidden="true" size={size==='sm'?14:15} strokeWidth={1.9}/>
    </button>
    <span ref={tip} id={id} role="tooltip" className={s.tip} hidden={!open} style={place?{top:place.top,left:place.left,width:place.width}:undefined}>{children}</span>
  </span>;
}
