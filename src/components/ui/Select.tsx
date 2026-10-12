'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import s from './Select.module.css';
import {cx} from './cx';

export interface SelectOption<V extends string> {value:V;label:string}

/**
 * A choice in a filter panel (plan U0; C_QOB2 "Rep", "Customer"): a field box that opens a list. Arrow
 * keys move, Enter or a click picks, Escape closes (and only the list, not the panel around it).
 * `filled` gives the box a white background, as some frames draw it (C_CU1). `boxText` is what the closed
 * box shows when it is not the picked option's label (C_QOB2's date fields: "Sep 1", nothing for any day).
 */
export function Select<V extends string>({label,labelledBy,value,options,onChange,filled=false,boxText,className}:{
  label:string;labelledBy?:string;value:V;options:readonly SelectOption<V>[];onChange:(value:V)=>void;filled?:boolean;boxText?:string;
  /** Added to the box, for a field drawn in another frame's type (C_TR6 "Inside another team": the body size). */
  className?:string;
}){
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(0);
  const list=useRef<HTMLDivElement>(null);
  const wrap=useRef<HTMLDivElement>(null);
  const button=useRef<HTMLButtonElement>(null);
  const id=useId();
  const current=options.find(o=>o.value===value)??options[0];
  useEffect(()=>{
    if(!open)return;
    list.current?.focus({preventScroll:true});
    const press=(event:MouseEvent)=>{if(!wrap.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('mousedown',press);
    return ()=>document.removeEventListener('mousedown',press);
  },[open]);
  // A long list (a day list) keeps the active row in view as it opens and as the arrow keys move.
  useEffect(()=>{if(open)document.getElementById(`${id}-${active}`)?.scrollIntoView?.({block:'nearest'});},[open,active,id]);
  const pick=(option:SelectOption<V>)=>{onChange(option.value);setOpen(false);button.current?.focus({preventScroll:true});};
  function key(event:KeyboardEvent){
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      setActive(a=>Math.min(options.length-1,Math.max(0,a+(event.key==='ArrowDown'?1:-1))));
    }else if(event.key==='Enter'||event.key===' '){
      event.preventDefault();
      pick(options[active]);
    }else if(event.key==='Escape'){
      event.preventDefault();
      event.stopPropagation();
      // The app's React root is the document, where the panel's own Escape listener also sits: stop that one too.
      event.nativeEvent.stopImmediatePropagation();
      setOpen(false);
      button.current?.focus({preventScroll:true});
    }
  }
  return <div ref={wrap} className={s.wrap}>
    <button ref={button} type="button" className={cx(s.box,filled&&s.filled,className)} aria-haspopup="listbox" aria-expanded={open}
      aria-label={`${label}: ${current?.label??''}`} aria-describedby={labelledBy}
      onClick={()=>{setActive(Math.max(0,options.indexOf(current)));setOpen(!open);}}>{boxText??current?.label}</button>
    {open&&<div ref={list} role="listbox" tabIndex={-1} aria-label={label} className={s.list} onKeyDown={key}
      aria-activedescendant={`${id}-${active}`}>
      {options.map((o,i)=><div key={o.value} id={`${id}-${i}`} role="option" aria-selected={i===active} className={cx(s.option,i===active&&s.active)}
        onMouseDown={e=>{e.preventDefault();pick(o);}} onMouseEnter={()=>setActive(i)}>{o.label}</div>)}
    </div>}
  </div>;
}
