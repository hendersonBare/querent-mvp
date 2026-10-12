'use client';
import {useRef,useState} from 'react';
import {initials} from '@/lib/initials';
import {Popover} from '@/components/ui/Popover';
import {SiteIcon} from './icons';
import s from './site.module.css';

/**
 * The account chip (plan U10; C_CVL1): the customer's initials and name, "Signed in" and a chevron.
 * It opens a menu with Sign out (no frame: the minimum needed to sign out, listed under "No frame" in
 * docs/plans/status.md), which returns to the visitor box.
 */
export function AccountChip({name,signOut}:{name:string;signOut:()=>void}){
  const [open,setOpen]=useState(false);
  const wrap=useRef<HTMLDivElement>(null);
  return <div ref={wrap} className={s.chipWrap}>
    <button type="button" className={s.chip} aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(o=>!o)}>
      <div className={s.chipAvatar}>{initials(name)}</div>
      <div className={s.chipName}>{name}<div className={s.chipState}>Signed in</div></div>
      <SiteIcon name="chevron" size={14} stroke="#A9AEAB"/>
    </button>
    <Popover open={open} label="Account" onClose={()=>setOpen(false)} ignore={wrap} className={s.menu} data-ui="account-menu">
      <button type="button" className={s.menuItem} onClick={()=>{setOpen(false);signOut();}}>Sign out</button>
    </Popover>
  </div>;
}
