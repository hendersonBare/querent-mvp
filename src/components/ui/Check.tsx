import type {InputHTMLAttributes} from 'react';
import s from './Check.module.css';
import {cx} from './cx';

/**
 * The input and its drawn square, for a row that is a <label>. `fixed` draws the grey "always shown"
 * square (C_QOT2) and disables the input.
 */
export function Check({checked,fixed=false,onChange,...rest}:{checked:boolean;fixed?:boolean;onChange:(checked:boolean)=>void}&Omit<InputHTMLAttributes<HTMLInputElement>,'checked'|'onChange'|'type'>){
  return <>
    <input type="checkbox" className={s.input} checked={checked} disabled={fixed||rest.disabled} onChange={e=>onChange(e.target.checked)} {...rest}/>
    <span data-ui="check" data-checked={String(checked)} className={cx(s.box,checked&&s.checked,fixed&&s.fixed)} aria-hidden="true"/>
  </>;
}
