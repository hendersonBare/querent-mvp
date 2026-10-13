import type {KeyboardEvent} from 'react';

// Keeps Tab and Shift+Tab inside an open panel or sheet (Appendix H: "dropdowns and sheets trap and
// restore focus"; no frame, decision 52). The panel takes focus when it opens and gives it back when it
// closes (./Popover, ./Sheet); this wraps Tab from the last control to the first and Shift+Tab from the
// first (or the panel itself) to the last. A panel inside another traps first; the outer one then
// leaves the key alone.

const FOCUSABLE='a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function trapTab(event:KeyboardEvent<HTMLElement>){
  if(event.key!=='Tab'||event.defaultPrevented)return;
  const panel=event.currentTarget;
  const focusable=[...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el=>!el.closest('[hidden]'));
  const active=document.activeElement;
  if(!focusable.length){event.preventDefault();panel.focus({preventScroll:true});return;}
  const first=focusable[0],last=focusable[focusable.length-1];
  if(event.shiftKey&&(active===first||active===panel)){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&active===last){event.preventDefault();first.focus();}
}
