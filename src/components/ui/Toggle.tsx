'use client';
import s from './Toggle.module.css';
import {cx} from './cx';

/** An on/off switch (plan U0; C_S4). `label` is its accessible name; the visible label is the page's. */
export function Toggle({checked,onChange,label,disabled=false}:{checked:boolean;onChange:(checked:boolean)=>void;label:string;disabled?:boolean}){
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
    className={cx(s.track,checked&&s.on)} onClick={()=>onChange(!checked)}><span className={s.knob}/></button>;
}
