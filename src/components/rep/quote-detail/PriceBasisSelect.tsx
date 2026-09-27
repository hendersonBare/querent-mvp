'use client';
import {useEffect,useId,useRef,useState,type CSSProperties,type KeyboardEvent} from 'react';
import {ChevronDown} from 'lucide-react';
import type {PriceBasis} from '@/domain';
import {BASIS_LABELS,type PriceOption} from '@/server/pricing';
import {day,money} from './format';
import s from './QuoteDetail.module.css';

// The price-basis dropdown (spec §4, task 3.3): Contract / Customer / List / Last paid / Custom,
// each with its dollar value, and Querent's pick in bold. A listbox rather than a <select>, since
// an <option> can't reliably show bold text. Choosing a basis prices the line at it; Custom keeps
// the typed price. A basis the line has no price for is listed but can't be chosen.
// The list is fixed to the viewport under its button (above it near the bottom of the screen),
// so the grid's scroll container neither clips it nor scrolls when it opens. It follows the
// button when the page scrolls or resizes: closing on scroll would race the scroll that brought
// the button into view.

/** The list's width, for keeping it on screen. */
const LIST_WIDTH=264;
/** Below this much room under the button, the list opens upward. */
const LIST_ROOM=250;

function placeUnder(button:HTMLElement):CSSProperties{
  const rect=button.getBoundingClientRect(),width=window.innerWidth,height=window.innerHeight;
  const right=Math.max(8,Math.min(width-rect.right,width-LIST_WIDTH-8));
  return height-rect.bottom<LIST_ROOM&&rect.top>height-rect.bottom?{right,bottom:height-rect.top+4}:{right,top:rect.bottom+4};
}

export interface PriceBasisSelectProps {
  options:readonly PriceOption[];
  /** The line's current basis (null while unpriced). */
  value:PriceBasis|null;
  onChange:(basis:PriceBasis)=>void;
  /** "Price basis for HCS-12-13-2G8". */
  label:string;
  disabled?:boolean;
  /** When the page was read: a last-paid day in another year shows its year. */
  asOf?:string;
}

export function PriceBasisSelect({options,value,onChange,label,disabled,asOf}:PriceBasisSelectProps){
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(0);
  const [place,setPlace]=useState<CSSProperties>({});
  const wrap=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),list=useRef<HTMLUListElement>(null);
  const listId=useId();
  const usable=(i:number)=>options[i]?.available;
  const current=value?BASIS_LABELS[value]:'Choose basis';

  useEffect(()=>{
    if(!open)return;
    list.current?.focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{if(!wrap.current?.contains(event.target as Node))setOpen(false);};
    let frame=0;
    const follow=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{if(button.current)setPlace(placeUnder(button.current));});
    };
    document.addEventListener('pointerdown',outside);
    window.addEventListener('scroll',follow,{capture:true,passive:true});window.addEventListener('resize',follow);
    return()=>{
      cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown',outside);window.removeEventListener('scroll',follow,{capture:true});window.removeEventListener('resize',follow);
    };
  },[open]);

  function show(){
    const selected=options.findIndex(o=>o.basis===value);
    setActive(selected>=0?selected:Math.max(0,options.findIndex(o=>o.available)));
    if(button.current)setPlace(placeUnder(button.current));
    setOpen(true);
  }
  function close(refocus=true){setOpen(false);if(refocus)button.current?.focus();}
  function choose(i:number){
    if(!usable(i))return;
    close();
    if(options[i].basis!==value||options[i].basis==='custom')onChange(options[i].basis);
  }
  function move(step:number){
    for(let i=1;i<=options.length;i++){
      const next=(active+step*i+options.length*i)%options.length;
      if(usable(next)){setActive(next);return;}
    }
  }
  function onListKey(event:KeyboardEvent){
    if(event.key==='ArrowDown'){event.preventDefault();move(1);}
    else if(event.key==='ArrowUp'){event.preventDefault();move(-1);}
    else if(event.key==='Home'){event.preventDefault();setActive(options.findIndex(o=>o.available));}
    else if(event.key==='End'){event.preventDefault();setActive(options.length-1-[...options].reverse().findIndex(o=>o.available));}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(active);}
    else if(event.key==='Escape'){event.preventDefault();close();}
    else if(event.key==='Tab')close(false);
  }
  function onButtonKey(event:KeyboardEvent){
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show();}
  }

  return <div className={s.basis} ref={wrap}>
    <button ref={button} type="button" className={s.basisButton} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined}
      aria-label={`${label}: ${current}`} disabled={disabled} onClick={()=>open?close():show()} onKeyDown={onButtonKey}>
      {current}<ChevronDown aria-hidden="true" size={12} strokeWidth={2}/>
    </button>
    {open&&<ul ref={list} id={listId} className={s.basisList} style={place} role="listbox" aria-label={label} tabIndex={-1}
      aria-activedescendant={`${listId}-${active}`} onKeyDown={onListKey}>
      {options.map((option,i)=>{
        const detail=optionNote(option,asOf);
        return <li key={option.basis} id={`${listId}-${i}`} role="option" aria-selected={option.basis===value} aria-disabled={!option.available||undefined}
          data-active={i===active||undefined} data-suggested={option.suggested||undefined} className={s.basisOption}
          onPointerDown={event=>event.preventDefault()} onClick={()=>choose(i)} onPointerEnter={()=>option.available&&setActive(i)}>
          <span className={s.basisName}>{option.suggested?<strong>{option.label}</strong>:option.label}
            {option.suggested&&<span className={s.pick}>Querent’s pick</span>}
            {detail&&<small>{detail}</small>}
          </span>
          <span className={s.basisPrice}>{option.suggested?<strong>{optionPrice(option)}</strong>:optionPrice(option)}</span>
        </li>;
      })}
    </ul>}
  </div>;
}

/** The contract number, or "Paid Aug 12" for last paid. */
function optionNote(option:PriceOption,asOf?:string){
  if(!option.note)return null;
  return option.basis==='last_paid'?`Paid ${day(option.note,asOf??option.note)}`:option.note;
}

/** An option's dollar value: "$38.95"; "Type a price" for Custom with none; "—" when the basis has no price. */
function optionPrice(option:PriceOption){
  if(option.price!==null)return money(option.price);
  return option.basis==='custom'?'Type a price':'—';
}
