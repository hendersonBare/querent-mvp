'use client';
import {useEffect,useRef,type RefObject} from 'react';

// A modal dialog's keyboard behaviour (task 3.7), for the send dialog and Confirm send: on mount
// it moves focus into the dialog, Tab and Shift+Tab stay inside it, Escape calls `onEscape`, and
// on unmount focus goes back where it was (the Approve & send button).

const FOCUSABLE='a[href],button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])';

export function useModal(dialog:RefObject<HTMLElement|null>,{onEscape,initialFocus}:{onEscape:()=>void;
  /** What gets focus first; the dialog itself when omitted. */
  initialFocus?:RefObject<HTMLElement|null>}){
  const escape=useRef(onEscape);
  escape.current=onEscape;
  const first=useRef(initialFocus);
  useEffect(()=>{
    const before=document.activeElement instanceof HTMLElement?document.activeElement:null;
    (first.current?.current??dialog.current)?.focus();
    const keydown=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();escape.current();return;}
      const box=dialog.current;
      if(event.key!=='Tab'||!box)return;
      const inside=[...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el=>!el.closest('[hidden]'));
      if(!inside.length){event.preventDefault();box.focus();return;}
      const at=document.activeElement;
      if(event.shiftKey&&(at===inside[0]||at===box||!box.contains(at))){event.preventDefault();inside.at(-1)!.focus();}
      else if(!event.shiftKey&&(at===inside.at(-1)||!box.contains(at))){event.preventDefault();inside[0].focus();}
    };
    document.addEventListener('keydown',keydown);
    return()=>{document.removeEventListener('keydown',keydown);before?.focus?.();};
  },[dialog]);
}
