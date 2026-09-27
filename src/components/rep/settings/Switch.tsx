'use client';
import s from './Settings.module.css';

/**
 * An on/off switch. `checked` null is "mixed" (on for some customers): it reads as off to
 * assistive tech, and `describedBy` should say it is mixed. Pressing it turns it on.
 */
export function Switch({checked,label,describedBy,disabled,onToggle}:{checked:boolean|null;label:string;describedBy?:string;disabled?:boolean;onToggle:()=>void}){
  return <button type="button" role="switch" className={s.switch} data-state={checked===null?'mixed':checked?'on':'off'}
    aria-checked={checked===true} aria-label={label} aria-describedby={describedBy} disabled={disabled} onClick={onToggle}>
    <span className={s.knob} aria-hidden="true"/>
  </button>;
}
