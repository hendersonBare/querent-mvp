'use client';
import {useId,useRef,useState,type CSSProperties,type InputHTMLAttributes,type ReactNode} from 'react';
import {Check} from './Check';
import {Icon} from './Icon';
import {Popover} from './Popover';
import s from './FilterButton.module.css';
import {cx} from './cx';

// The page header's Filter button and its panel (plan U0; frames C_QOB2 open, C_CU2 applied with the
// count badge, C_CU1 and C_AN4 for the description and segmented control). The panel edits a draft of
// the applied filters: "Apply filters" applies it and closes, "Clear all" empties it, and closing any
// other way drops the edits. Defaults are C_QOB2's: 390 wide, 12px under the title, 14px above the actions.

export interface FilterButtonProps<T> {
  /** The panel's title, also its accessible name ("Filter quotes"). */
  title:string;
  /** One line under the title (C_CU1), only where a new user could misread the filter. */
  description?:string;
  /** The applied filters; the draft starts from them each time the panel opens. */
  value:T;
  /** The filters with nothing picked: what "Clear all" sets the draft to. */
  empty:T;
  /** How many filters are applied; the badge shows when above 0. */
  count:number;
  onApply:(value:T)=>void;
  children:(draft:T,setDraft:(next:T)=>void)=>ReactNode;
  width?:number;
  titleGap?:number;
  actionsGap?:number;
  /** bar: the button on a card's dark title bar (C_TRBase: 38px, transparent, a #5A615D line, white text). */
  tone?:'default'|'bar';
  /** right: the panel opens under the button's right edge (a button at the page's right end). */
  align?:'left'|'right';
  /** For the wrapper, so a page can place it (C_TRBase pushes it right with margin-left: auto). */
  className?:string;
  /** Added to the panel, for a frame that draws its own line or shadow (C_S1a). */
  panelClassName?:string;
  /** Replaces the count badge's look, for a frame that draws its own (C_S1b). */
  countClassName?:string;
  /** false: the button keeps its plain line while filters are applied, as C_S1b draws it (C_CU2 draws the green line). */
  highlightApplied?:boolean;
}

export function FilterButton<T>({title,description,value,empty,count,onApply,children,width=390,titleGap,actionsGap=14,tone='default',align='left',className,panelClassName,countClassName,highlightApplied=true}:FilterButtonProps<T>){
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState(value);
  const wrap=useRef<HTMLDivElement>(null);
  const toggle=()=>{if(!open)setDraft(value);setOpen(!open);};
  return <div ref={wrap} className={cx(s.wrap,className)} data-ui="filter">
    <button type="button" className={cx(s.button,tone==='bar'&&s.bar,(open||(highlightApplied&&count>0))&&s.active)} aria-expanded={open} aria-haspopup="dialog"
      aria-label={count>0?`Filter, ${count} applied`:undefined} onClick={toggle}>
      <Icon name="filter" size={15}/>Filter{count>0&&<span data-ui="count" className={countClassName??s.count}>{count}</span>}
    </button>
    <Popover open={open} label={title} onClose={()=>setOpen(false)} ignore={wrap} className={cx(s.panel,align==='right'&&s.panelRight,panelClassName)} style={{width}}>
      <div className={cx(s.title,description&&s.titleTight)} style={titleGap===undefined?undefined:{marginBottom:titleGap}}>{title}</div>
      {description&&<div className={s.description}>{description}</div>}
      {children(draft,setDraft)}
      <div className={s.actions} style={{marginTop:actionsGap}}>
        <button type="button" className={s.clear} onClick={()=>setDraft(empty)}>Clear all</button>
        <button type="button" className={s.apply} onClick={()=>{onApply(draft);setOpen(false);}}>Apply filters</button>
      </div>
    </Popover>
  </div>;
}

/** A small grey group label ("Status", "Only show"). C_QOB2's first label sits 2px above its rows. */
export function FilterLabel({children,margin='0 0 2px',id}:{children:ReactNode;margin?:string;id?:string}){
  return <div id={id} className={s.label} style={{margin}}>{children}</div>;
}

/** A labelled group of rows: in a grid of `columns` (C_QOB2 status: 2, gap 0 12px), or one per line. */
export function FilterGroup({label,columns=1,gap='0 12px',labelMargin,children}:{label:string;columns?:number;gap?:string;labelMargin?:string;children:ReactNode}){
  const id=useId();
  return <div role="group" aria-labelledby={id} style={{display:'contents'}}>
    <FilterLabel id={id} margin={labelMargin}>{label}</FilterLabel>
    {columns>1?<div className={s.grid} style={{gridTemplateColumns:`repeat(${columns}, 1fr)`,gap}}>{children}</div>:children}
  </div>;
}

/** One checkbox row, with an optional count on the right (C_CU1, C_ST1). */
export function FilterCheckbox({label,checked,onChange,count}:{label:string;checked:boolean;onChange:(checked:boolean)=>void;count?:number}){
  return <label className={s.row}>
    <Check checked={checked} onChange={onChange}/>
    <span>{label}</span>
    {count!==undefined&&<span className={s.rowCount}>{count}</span>}
  </label>;
}

/** Empty space between groups, as the frames draw it (C_QOB2: 8px). */
export function FilterSpacer({height}:{height:number}){
  return <div style={{height}}/>;
}

/** A labelled field ("Rep", "Requested from"): the label 4px above the control, 10px under the field. */
export function FilterField({label,children}:{label:string;children:(labelId:string)=>ReactNode}){
  const id=useId();
  return <div className={s.field}>
    <div id={id} className={cx(s.label,s.fieldLabel)}>{label}</div>
    {children(id)}
  </div>;
}

/** Two fields side by side (C_QOB2 "Requested from" and "Requested to"). */
export function FilterPair({children}:{children:ReactNode}){
  return <div className={s.pair}>{children}</div>;
}

/** A text or date input in the field box (38px, 1px #D6D9D7, radius 8). */
export function FilterInput({style,...rest}:InputHTMLAttributes<HTMLInputElement>&{style?:CSSProperties}){
  return <input className={s.input} style={style} {...rest}/>;
}

/** A segmented choice (C_AN4 "Break the numbers down by", C_S1a): one option is always picked. */
export function FilterSegmented<V extends string>({label,value,options,onChange,labelMargin='6px 0 2px',padding}:{
  label:string;value:V;options:readonly {value:V;label:string}[];onChange:(value:V)=>void;labelMargin?:string;padding?:string;
}){
  const id=useId();
  return <>
    <FilterLabel id={id} margin={labelMargin}>{label}</FilterLabel>
    <div role="radiogroup" aria-labelledby={id} className={s.segmented}>
      {options.map(o=><button key={o.value} type="button" role="radio" aria-checked={o.value===value}
        className={cx(s.segment,o.value===value&&s.segmentOn)} style={padding?{padding}:undefined} onClick={()=>onChange(o.value)}>{o.label}</button>)}
    </div>
  </>;
}
