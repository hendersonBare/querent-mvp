'use client';
import type {ReactNode} from 'react';
import s from './Lane.module.css';
import {cx} from './cx';
import {dropSlot,useReorder} from './useReorder';

// Board lanes (plan U0; frames C_QOBoard, C_QOB8 reorder): a row of lanes, each with a "::" handle,
// its label and a count. Drag a lane's header onto another lane, or press Alt+Left / Alt+Right on a
// focused header, to move it.

export interface LaneSlot {
  id:string;
  /** Spread onto the lane's header: drag and keyboard handlers. */
  handle:ReturnType<ReturnType<typeof useReorder>['itemProps']>;
  state:'idle'|'dragging'|'target';
}

export function LaneRow({ids,onMove,label,children}:{ids:readonly string[];onMove:(from:number,to:number)=>void;label:string;children:(lane:LaneSlot)=>ReactNode}){
  const reorder=useReorder({ids,onMove,orientation:'horizontal'});
  const slot=dropSlot(ids,reorder);
  return <div role="group" aria-label={label} className={s.row}>
    {ids.map((id,i)=>children({id,handle:reorder.itemProps(id),state:reorder.dragging===id?'dragging':slot?.to===i?'target':'idle'}))}
  </div>;
}

export function Lane({id,label,count,handle,state,children}:LaneSlot&{label:string;count:number;children?:ReactNode}){
  const {ref,...drag}=handle;
  return <section role="group" aria-label={label} data-lane={id} className={cx(s.lane,state==='dragging'&&s.dragging,state==='target'&&s.target)}>
    <div ref={ref} tabIndex={0} aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight" className={s.head} {...drag}>
      <div className={s.title}><span data-ui="handle" className={s.handle}>{':: '}</span><span>{label}</span></div>
      <span data-ui="count" className={s.count}>{count}</span>
    </div>
    <div className={s.body}>{children}</div>
  </section>;
}
