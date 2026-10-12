'use client';
import {Icon} from '@/components/ui/Icon';
import type {FilterChip} from './filters';
import s from './Records.module.css';

// The list pages' own controls (plan U5): the search box (C_CUBase, C_STBase) and the applied filters
// row (C_CU2).

/**
 * The page-local search: the frame's box with its grey placeholder line, and a search input over it.
 * Typing narrows the list as you type (no frame for a typed state: the input shows what was typed).
 */
export function SearchBox({label,value,onChange,width}:{label:string;value:string;onChange:(value:string)=>void;width:number}){
  return <div className={s.search} style={{width}} data-ui="search">
    <Icon name="search" size={17}/>
    {!value&&<span className={s.placeholder} aria-hidden="true">{label}</span>}
    <input type="search" className={s.searchInput} aria-label={label} value={value} autoComplete="off" spellCheck={false}
      onChange={e=>onChange(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'&&value){e.preventDefault();onChange('');}}}/>
  </div>;
}

/** C_CU2: one chip per applied filter group with an "x" that clears it, then "Clear all". */
export function AppliedFilters<G extends string>({chips,onRemove,onClear}:{chips:readonly FilterChip<G>[];onRemove:(group:G)=>void;onClear:()=>void}){
  if(!chips.length)return null;
  return <div className={s.chips} data-ui="applied-filters">
    {chips.map(chip=><span key={chip.group} className={s.chip}>{chip.label}
      <button type="button" className={s.chipRemove} aria-label={`Remove ${chip.label}`} onClick={()=>onRemove(chip.group)}>x</button></span>)}
    <button type="button" className={s.clearAll} onClick={onClear}>Clear all</button>
  </div>;
}
