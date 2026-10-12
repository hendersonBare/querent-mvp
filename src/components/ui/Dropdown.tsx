'use client';
import {cloneElement,isValidElement,useRef,type KeyboardEvent,type MouseEvent,type ReactElement,type ReactNode} from 'react';
import {Popover} from './Popover';
import s from './Dropdown.module.css';
import {cx} from './cx';

/**
 * A short list under a header button (plan U0; C_QOB3 caution, C_QOB4 bell). Opening it never
 * navigates: each row calls `onSelect`, and the page decides what that does. Escape or a press
 * outside closes it.
 */
export function Dropdown({open,onOpenChange,title,trigger,children}:{
  open:boolean;onOpenChange:(open:boolean)=>void;title:string;trigger:ReactElement<{onClick?:(e:MouseEvent)=>void;'aria-expanded'?:boolean;'aria-haspopup'?:string}>;children:ReactNode;
}){
  const wrap=useRef<HTMLDivElement>(null);
  const button=isValidElement(trigger)?cloneElement(trigger,{onClick:()=>onOpenChange(!open),'aria-expanded':open,'aria-haspopup':'dialog'}):trigger;
  return <div ref={wrap} className={s.wrap}>
    {button}
    <Popover open={open} label={title} onClose={()=>onOpenChange(false)} ignore={wrap} className={s.panel} data-ui="dropdown-panel">
      <div className={s.head}>{title}</div>
      {children}
    </Popover>
  </div>;
}

/** One row: a bold title, an optional tag on the right (red for a problem), and one line under it. A title too long for the panel stays on one line with an ellipsis, its full text in a tooltip (decision 60). */
export function DropdownItem({title,tag,tone='plain',onSelect,children}:{title:string;tag?:string;tone?:'plain'|'problem';onSelect:()=>void;children?:ReactNode}){
  const key=(event:KeyboardEvent)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect();}};
  return <div role="button" tabIndex={0} className={s.item} onClick={onSelect} onKeyDown={key}>
    <div className={s.line}><span className={s.title} title={title}>{title}</span><span className={cx(s.tag,tone==='problem'&&s.problem)}>{tag}</span></div>
    {children&&<div className={s.body}>{children}</div>}
  </div>;
}
