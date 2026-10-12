'use client';
import {Fragment,useEffect,useId,useRef,useState,type ReactNode} from 'react';
import s from './QuoteDetail.module.css';

// A menu under one of the editor's icon buttons (plan U4): Export (C_QE2, under its button's left edge,
// 300 wide) and More actions (C_QE3, under its right edge, 250 wide). Each item is a bold label with an
// optional muted line under it; a rule can sit above an item. Arrow keys move through every item,
// disabled ones included, so a disabled item's reason can be read (WAI-ARIA menu pattern); a disabled
// item never runs. Escape or a click outside closes it.

export interface MenuItem {
  label:string;
  /** A second line in muted text. */
  hint?:string;
  onSelect:()=>void;
  disabled?:boolean;
  /** Tooltip, e.g. why an item is disabled. */
  title?:string;
  /**
   * A tooltip drawn by the menu (e.g. why the item is disabled): shown on hover, on keyboard focus
   * and when the item is tapped, and read as the item's description. No frame draws it.
   */
  tooltip?:string;
  /** A rule above the item (C_QE2: before Copy quote summary; C_QE3: before Reset sample quote). */
  separator?:boolean;
}

export interface ActionMenuProps {
  /** The button's content (its icon). */
  children:ReactNode;
  /** The button's accessible name. */
  label:string;
  /** The menu's name. */
  menuLabel:string;
  items:readonly MenuItem[];
  /** Which edge of the button the menu hangs from. */
  align?:'left'|'right';
  buttonClassName?:string;
}

export function ActionMenu({children,label,menuLabel,items,align='left',buttonClassName}:ActionMenuProps){
  const [open,setOpen]=useState(false);
  const wrap=useRef<HTMLDivElement>(null),button=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null);
  const menuId=useId();
  useEffect(()=>{
    if(!open)return;
    (menu.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')??menu.current)?.focus({preventScroll:true});
    const outside=(event:PointerEvent)=>{if(!wrap.current?.contains(event.target as Node))setOpen(false);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setOpen(false);button.current?.focus();}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[open]);
  function moveFocus(step:number){
    const entries=[...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')??[])];
    if(!entries.length)return;
    const at=entries.indexOf(document.activeElement as HTMLElement);
    entries[(at+step+entries.length)%entries.length].focus();
  }
  return <div className={s.actionWrap} ref={wrap}>
    <button ref={button} type="button" className={buttonClassName} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?menuId:undefined}
      onClick={()=>setOpen(o=>!o)}>{children}</button>
    {open&&<div ref={menu} id={menuId} className={s.menu} data-align={align} role="menu" aria-label={menuLabel} tabIndex={-1}
      onKeyDown={event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();moveFocus(event.key==='ArrowDown'?1:-1);}}}>
      {items.map((item,i)=><Fragment key={item.label}>
        {item.separator&&i>0&&<div className={s.menuRule} role="separator"/>}
        <MenuEntry item={item} tooltipId={`${menuId}-tip-${i}`} onChosen={()=>setOpen(false)}/>
      </Fragment>)}
    </div>}
  </div>;
}

function MenuEntry({item,tooltipId,onChosen}:{item:MenuItem;tooltipId:string;onChosen:()=>void}){
  const [tipOpen,setTipOpen]=useState(false);
  const entry=<button type="button" role="menuitem" className={s.menuItem} aria-disabled={item.disabled||undefined} title={item.title} aria-describedby={item.tooltip?tooltipId:undefined}
    onClick={()=>{
      if(item.disabled){if(item.tooltip)setTipOpen(o=>!o);return;}
      onChosen();item.onSelect();
    }}>
    <div className={s.menuLabel}>{item.label}</div>{item.hint&&<div className={s.menuHint}>{item.hint}</div>}
  </button>;
  if(!item.tooltip)return entry;
  return <div role="none" className={s.menuTipWrap} data-open={tipOpen||undefined}>
    {entry}<span role="tooltip" id={tooltipId} className={s.menuTip}>{item.tooltip}</span>
  </div>;
}
