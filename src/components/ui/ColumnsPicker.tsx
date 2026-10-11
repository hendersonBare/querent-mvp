'use client';
import {useId,type CSSProperties,type RefObject} from 'react';
import {Check} from './Check';
import {Popover} from './Popover';
import s from './ColumnsPicker.module.css';
import {cx} from './cx';
import {useReorder} from './useReorder';

export interface PickerColumn {id:string;label:string;alwaysShown?:boolean}

/**
 * Choose columns (plan U0; frame C_QOT2): every column in the table's order, shown ones on a grey row
 * with a ticked square, an always-shown column with a grey square and "Always shown". Untick to hide,
 * tick to restore; drag a row or press Alt+Up / Alt+Down on it to move the column. "Reset to default"
 * restores the table's own columns; "Done" closes. Every change applies at once.
 */
export function ColumnsPicker({open,onClose,ignore,columns,order,hidden,onToggle,onMove,onReset,style}:{
  open:boolean;onClose:()=>void;ignore?:RefObject<HTMLElement|null>;columns:readonly PickerColumn[];order:readonly string[];hidden:readonly string[];
  onToggle:(id:string,shown:boolean)=>void;onMove:(from:number,to:number)=>void;onReset:()=>void;style?:CSSProperties;
}){
  const reorder=useReorder({ids:order,onMove,orientation:'vertical'});
  const id=useId();
  const byId=new Map(columns.map(c=>[c.id,c]));
  return <Popover open={open} label="Choose columns" onClose={onClose} ignore={ignore} className={s.panel} style={style} data-ui="columns-picker">
    <div className={s.title}>Choose columns</div>
    {order.map(columnId=>{
      const column=byId.get(columnId)!;
      const shown=!hidden.includes(columnId);
      const {ref,...drag}=reorder.itemProps(columnId);
      return <label key={columnId} ref={ref} className={cx(s.row,shown&&s.shown)} {...drag}>
        <span className={s.handle} aria-hidden="true">::</span>
        <Check checked={shown} fixed={column.alwaysShown} onChange={on=>onToggle(columnId,on)} aria-label={column.label}
          aria-describedby={column.alwaysShown?`${id}-${columnId}`:undefined} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"/>
        <span className={s.name}>{column.label}</span>
        {column.alwaysShown&&<span id={`${id}-${columnId}`} className={s.always}>Always shown</span>}
      </label>;
    })}
    <div className={s.actions}>
      <button type="button" className={s.reset} onClick={onReset}>Reset to default</button>
      <button type="button" className={s.done} onClick={onClose}>Done</button>
    </div>
  </Popover>;
}
