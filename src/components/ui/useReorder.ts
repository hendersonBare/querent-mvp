'use client';
import {useLayoutEffect,useRef,useState,type DragEvent,type KeyboardEvent} from 'react';
import {moveItem} from './table-prefs';

// Drag to reorder, with a keyboard alternative (plan U0; frames C_QOT6 table header, C_QOB8 board
// lanes): drag an item onto another to move it to that place, or press Alt with the arrow keys on a
// focused item to move it one place. Focus stays on the moved item.

export interface ReorderState {dragging:string|null;over:string|null}

export function useReorder({ids,onMove,orientation}:{ids:readonly string[];onMove:(from:number,to:number)=>void;orientation:'horizontal'|'vertical'}){
  const [state,setState]=useState<ReorderState>({dragging:null,over:null});
  const refocus=useRef<string|null>(null);
  const nodes=useRef(new Map<string,HTMLElement>());
  useLayoutEffect(()=>{
    if(refocus.current===null)return;
    const node=nodes.current.get(refocus.current);
    refocus.current=null;
    const target=node&&(node.tabIndex>=0?node:node.querySelector<HTMLElement>('input,button,[tabindex]'));
    if(target&&document.activeElement!==target)target.focus({preventScroll:true});
  });
  const [back,forward]=orientation==='horizontal'?['ArrowLeft','ArrowRight']:['ArrowUp','ArrowDown'];
  const end=()=>setState({dragging:null,over:null});

  function itemProps(id:string){
    return {
      draggable:true as const,
      ref:(node:HTMLElement|null)=>{if(node)nodes.current.set(id,node);else nodes.current.delete(id);},
      onDragStart(event:DragEvent){
        event.dataTransfer.effectAllowed='move';
        event.dataTransfer.setData('text/plain',id);
        setState({dragging:id,over:null});
      },
      onDragOver(event:DragEvent){
        if(state.dragging===null)return;
        event.preventDefault();
        event.dataTransfer.dropEffect='move';
        if(state.over!==id)setState(s=>({...s,over:id}));
      },
      onDrop(event:DragEvent){
        event.preventDefault();
        const from=state.dragging===null?-1:ids.indexOf(state.dragging);
        const to=ids.indexOf(id);
        end();
        if(from>=0&&to>=0&&from!==to)onMove(from,to);
      },
      onDragEnd:end,
      onKeyDown(event:KeyboardEvent){
        if(!event.altKey||(event.key!==back&&event.key!==forward))return;
        event.preventDefault();
        const from=ids.indexOf(id);
        const to=from+(event.key===back?-1:1);
        if(from<0||to<0||to>=ids.length)return;
        refocus.current=id;
        onMove(from,to);
      },
    };
  }
  return {...state,itemProps};
}

/** Where a dragged item would land, for drawing: the index it is over and the index it came from. */
export function dropSlot(ids:readonly string[],{dragging,over}:ReorderState){
  const from=dragging===null?-1:ids.indexOf(dragging);
  const to=over===null?-1:ids.indexOf(over);
  return from<0||to<0||from===to?null:{from,to};
}

export {moveItem};
