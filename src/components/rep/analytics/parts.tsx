'use client';
import {useEffect,useId,useState,type KeyboardEvent,type ReactNode} from 'react';
import Link from 'next/link';
import {cx} from '@/components/ui/cx';
import s from './Analytics.module.css';

// Pieces the Analytics frames repeat. The frames draw headings, tabs, segments and the "i" as spans; the
// app keeps the span (so the look is the frame's own) and gives it the role it plays.

/** A white card with the dark title bar (C_ANBase "Quotes and wins by week", C_AN6 "Leaderboard"...). */
export function Card({title,note,right,className,children}:{title:string;note?:ReactNode;right?:ReactNode;className?:string;children:ReactNode}){
  const id=useId();
  return <section className={cx(s.card,className)} aria-labelledby={id}>
    <div className={s.bar}>
      <span id={id} role="heading" aria-level={2} className={s.barTitle}>{title}</span>
      {note}
      {right}
    </div>
    {children}
  </section>;
}

/**
 * The "i" beside a number (C_ANBase stat cards, C_AN2 query cards): how it is calculated (spec §4). Its
 * tip has no frame ("States not drawn"): it shows on hover or focus and hides on Escape, blur or leave.
 */
export function InfoDot({topic,side='right',children}:{topic:string;side?:'left'|'right';children:ReactNode}){
  const [open,setOpen]=useState(false);
  const id=useId();
  useEffect(()=>{
    if(!open)return;
    const escape=(event:globalThis.KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};
    window.addEventListener('keydown',escape);
    return ()=>window.removeEventListener('keydown',escape);
  },[open]);
  return <span className={s.infoWrap} onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}>
    <span role="button" tabIndex={0} aria-label={`How ${topic} is calculated`} aria-describedby={open?id:undefined} className={s.info}
      onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onClick={()=>setOpen(o=>!o)} onMouseEnter={()=>setOpen(true)}>i</span>
    {open&&<span id={id} role="tooltip" className={cx(s.tip,side==='left'&&s.tipLeft)}>{children}</span>}
  </span>;
}

/**
 * A count (C_AN6, C_AN7, C_AN8): green, gray when zero, red for overdue. "Pick a count to see its quotes"
 * (C_AN6): a count above zero links to those quotes; the link's name says what it counts ("3 declined").
 */
export function Count({n,word,href,red=false}:{n:number;word?:string;href?:string|null;red?:boolean}){
  const attrs={className:s.count,'data-zero':n===0||undefined,'data-red':(red&&n>0)||undefined};
  return n>0&&href?<Link href={href} prefetch={false} aria-label={word?`${n} ${word}`:undefined} {...attrs}>{n}</Link>:<span {...attrs}>{n}</span>;
}

/** Roving keys for a row of choices (tabs, segments): arrows move, Home and End jump. */
function moveKey<V>(event:KeyboardEvent,values:readonly V[],current:V,pick:(value:V)=>void){
  const i=values.indexOf(current);
  const next=({ArrowRight:i+1,ArrowDown:i+1,ArrowLeft:i-1,ArrowUp:i-1,Home:0,End:values.length-1} as Record<string,number>)[event.key];
  if(next===undefined)return;
  event.preventDefault();
  const value=values[(next+values.length)%values.length];
  pick(value);
  const row=(event.currentTarget as HTMLElement).parentElement;
  (row?.children[values.indexOf(value)] as HTMLElement|undefined)?.focus();
}

/** The tab strip (C_ANBase): the picked tab bold with a green underline. */
export function Tabs<V extends string>({tabs,value,onChange,idFor}:{tabs:readonly {value:V;label:string}[];value:V;onChange:(value:V)=>void;idFor:(value:V)=>string}){
  const values=tabs.map(t=>t.value);
  return <div role="tablist" aria-label="Analytics" className={cx('ui-root',s.tabs)}>
    {tabs.map(t=><span key={t.value} id={idFor(t.value)} role="tab" aria-selected={t.value===value} tabIndex={t.value===value?0:-1}
      className={cx(s.tab,t.value===value&&s.tabOn)} onClick={()=>onChange(t.value)}
      onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onChange(t.value);}else moveKey(e,values,value,onChange);}}>{t.label}</span>)}
  </div>;
}

/** The segmented window in the leaderboard's title bar (C_AN6 "Created": 7 days, 30 days, 90 days, Custom). */
export function BarSegments<V extends string>({label,options,value,onChange}:{label:string;options:readonly {value:V;label:string}[];value:V;onChange:(value:V)=>void}){
  const id=useId();
  const values=options.map(o=>o.value);
  return <span className={s.windowSeg}>
    <span id={id} className={s.barNote}>{label}</span>
    <span role="radiogroup" aria-labelledby={id} className={s.segs}>
      {options.map(o=><span key={o.value} role="radio" aria-checked={o.value===value} tabIndex={o.value===value?0:-1}
        className={cx(s.seg,o.value===value&&s.segOn)} onClick={()=>onChange(o.value)}
        onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onChange(o.value);}else moveKey(e,values,value,onChange);}}>{o.label}</span>)}
    </span>
  </span>;
}
