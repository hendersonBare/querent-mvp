'use client';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import s from './QuoteDetail.module.css';

// A header menu on the quote (mockup .menu-wrap / .menu): the Export menu (its entries arrive
// with task 4.3) and the ⋯ menu (Duplicate, Reset sample, Open in ERP: task 3.5). Until a task
// adds its items, the menu says what will be there instead of opening empty.

export interface MenuItem {
  label:string;
  /** A second line in muted text. */
  hint?:string;
  onSelect:()=>void;
  disabled?:boolean;
  /** Tooltip, e.g. why an item is disabled. */
  title?:string;
}

export interface ActionMenuProps {
  /** The button's content ("Export ▾", "⋯"). */
  children:ReactNode;
  /** The button's accessible name when its content is only a symbol. */
  label?:string;
  /** The menu's name. */
  menuLabel:string;
  items:readonly MenuItem[];
  /** Shown when there are no items yet. */
  emptyNote:string;
  buttonClassName?:string;
}

export function ActionMenu({children,label,menuLabel,items,emptyNote,buttonClassName}:ActionMenuProps){
  const [open,setOpen]=useState(false);
  const wrap=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
  const menuId=useId();
  useEffect(()=>{
    if(!open)return;
    (menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')??menu.current)?.focus();
    const outside=(event:PointerEvent)=>{if(!wrap.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);button.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  function moveFocus(step:number){
    const entries=[...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')??[])];
    if(!entries.length)return;
    const at=entries.indexOf(document.activeElement as HTMLElement);
    entries[(at+step+entries.length)%entries.length].focus();
  }
  return <div className={s.menuWrap} ref={wrap}>
    <button ref={button} type="button" className={buttonClassName} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?menuId:undefined}
      onClick={()=>setOpen(o=>!o)}>{children}</button>
    {open&&<div ref={menu} id={menuId} className={s.menu} role="menu" aria-label={menuLabel} tabIndex={-1}
      onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();moveFocus(event.key==='ArrowDown'?1:-1);}}}>
      {items.length?items.map(item=><button key={item.label} type="button" role="menuitem" aria-disabled={item.disabled||undefined} title={item.title}
        onClick={()=>{if(item.disabled)return;setOpen(false);item.onSelect();}}>
        {item.label}{item.hint&&<small>{item.hint}</small>}
      </button>):<p className={s.menuNote}>{emptyNote}</p>}
    </div>}
  </div>;
}
