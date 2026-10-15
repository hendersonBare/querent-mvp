'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import type {PriceBasis} from '@/domain';
import {BASIS_LABELS,type PriceOption} from '@/server/pricing';
import {day,money} from './format';
import s from './QuoteDetail.module.css';

// The price source under a line's unit price (plan U4; C_QEBase, C_QE10): the current basis, underlined,
// opens a list under the price cell. The list starts with the current basis and "-", then every basis
// the line has a price for (Contract, Customer, List, Last paid) with its dollar value, and Custom last
// ("Type a price"). The current one is marked with the accent edge, its price in bold, and its note
// (the contract number, or "Paid Aug 28" for last paid); Querent's pick carries QUERENT'S PICK.
// Choosing a basis prices the line at it; Custom keeps the typed price. A listbox, so it works from the
// keyboard: arrows move, Enter chooses, Escape closes.

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

export function PriceBasisSelect({options:all,value,onChange,label,disabled,asOf}:PriceBasisSelectProps){
  // A basis with no price for this line isn't offered (C_QE10 lists none); Custom always is.
  const options=all.filter(o=>o.price!==null||o.basis==='custom');
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(0);
  const wrap=useRef<HTMLSpanElement>(null),button=useRef<HTMLButtonElement>(null),list=useRef<HTMLDivElement>(null);
  const listId=useId();
  const usable=(i:number)=>!!options[i]&&(options[i].available||options[i].basis==='custom');
  const current=value?BASIS_LABELS[value]:'Choose basis';

  useEffect(()=>{
    if(!open)return;
    list.current?.focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{if(!wrap.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[open]);

  function show(){
    const selected=options.findIndex(o=>o.basis===value);
    setActive(selected>=0?selected:Math.max(0,options.findIndex((_,i)=>usable(i))));
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
    else if(event.key==='Home'){event.preventDefault();setActive(options.findIndex((_,i)=>usable(i)));}
    else if(event.key==='End'){event.preventDefault();setActive(options.length-1);}
    else if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(active);}
    else if(event.key==='Escape'){event.preventDefault();close();}
    else if(event.key==='Tab')close(false);
  }
  function onButtonKey(event:KeyboardEvent){
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show();}
  }

  return <span className={s.basis} ref={wrap}>
    <button ref={button} type="button" className={s.basisButton} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined}
      aria-label={`${label}: ${current}`} disabled={disabled} onClick={()=>open?close():show()} onKeyDown={onButtonKey}>{current}</button>
    {open&&<div ref={list} id={listId} className={s.basisList} role="listbox" aria-label={label} tabIndex={-1}
      aria-activedescendant={`${listId}-${active}`} onKeyDown={onListKey}>
      <div className={s.basisHead} role="presentation"><span>{current}</span><span>-</span></div>
      {options.map((option,i)=>{
        const selected=option.basis===value;
        const note=selected?optionNote(option,asOf):null;
        return <div key={option.basis} role="presentation" className={s.contents}>
          {i>0&&<div className={s.basisGap}/>}
          <div id={`${listId}-${i}`} role="option" aria-selected={selected} aria-disabled={!usable(i)||undefined}
            data-active={(i===active&&!selected)||undefined} data-suggested={option.suggested||undefined} className={s.basisOption}
            onPointerDown={event=>event.preventDefault()} onClick={()=>choose(i)} onPointerEnter={()=>usable(i)&&setActive(i)}>
            <span className={s.contents}>
              {selected||option.suggested
                ?<div>
                  <div className={s.basisPicked}><span>{option.label}</span>{option.suggested&&<span className={s.pick}>QUERENT&apos;S PICK</span>}</div>
                  {note&&<div className={s.basisNote}>{note}</div>}
                </div>
                :<span className={s.basisName}>{option.label}</span>}
            </span>
            <span className={s.basisPrice}>{optionPrice(option)}</span>
          </div>
        </div>;
      })}
    </div>}
  </span>;
}

/** The contract number, or "Paid Aug 12" for last paid. */
function optionNote(option:PriceOption,asOf?:string){
  if(!option.note)return null;
  return option.basis==='last_paid'?`Paid ${day(option.note,asOf??option.note)}`:option.note;
}

/** An option's dollar value: "$38.95", or "Type a price" for Custom with none. */
function optionPrice(option:PriceOption){
  if(option.price!==null)return money(option.price);
  return option.basis==='custom'?'Type a price':'-';
}
