'use client';
import {useId,useLayoutEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {Icon} from './Icon';
import s from './CustomerPicker.module.css';
import {cx} from './cx';

// The page-local customer picker (plan U0; frames C_QOB1 open, C_QOT7 typed). The box shows the picked
// customer, "All customers" by default. Focus opens the list: "All customers" first, then the customers
// in the order given; five rows show and the rest scroll. Typing narrows the list by name or account
// number. Arrow keys move, Enter or a click picks, Escape closes.

export const PICKER_VISIBLE_ROWS=5;
export const ALL_CUSTOMERS='All customers';

export interface PickerCustomer {id:string;name:string;account_number:string}
interface Option {id:string|null;name:string;code:string}

const matches=(n:number)=>`${n} ${n===1?'match':'matches'}`;

export function CustomerPicker({customers,value,onChange,label='Customer'}:{
  customers:readonly PickerCustomer[];value:string|null;onChange:(customerId:string|null)=>void;label?:string;
}){
  const [open,setOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [active,setActive]=useState(0);
  const list=useRef<HTMLDivElement>(null);
  const id=useId();
  const picked=customers.find(c=>c.id===value);
  const shownLabel=picked?.name??ALL_CUSTOMERS;
  const options=useMemo<Option[]>(()=>{
    const q=query.trim().toLowerCase();
    const all=customers.map(c=>({id:c.id,name:c.name,code:c.account_number}));
    return q?all.filter(o=>o.name.toLowerCase().includes(q)||o.code.toLowerCase().includes(q)):[{id:null,name:ALL_CUSTOMERS,code:''},...all];
  },[customers,query]);
  const hint=query.trim()?matches(options.length)
    :options.length>PICKER_VISIBLE_ROWS?`Showing ${PICKER_VISIBLE_ROWS} of ${options.length}. Scroll to see more or type to search.`:null;

  // Five rows tall, measured from a drawn row so the list follows the row's own size.
  useLayoutEffect(()=>{
    const el=list.current;
    const row=el?.firstElementChild as HTMLElement|null;
    if(el)el.style.maxHeight=row?.offsetHeight?`${row.offsetHeight*PICKER_VISIBLE_ROWS}px`:'';
  },[open,options.length]);
  useLayoutEffect(()=>{
    (list.current?.children[active] as HTMLElement|undefined)?.scrollIntoView?.({block:'nearest'});
  },[active]);

  const show=()=>{
    if(open)return;
    setActive(Math.max(0,options.findIndex(o=>o.id===(value??null))));
    setOpen(true);
  };
  const close=()=>{setOpen(false);setQuery('');};
  const pick=(option:Option)=>{onChange(option.id);close();};
  function key(event:KeyboardEvent){
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      if(!open){show();return;}
      setActive(a=>Math.min(options.length-1,Math.max(0,a+(event.key==='ArrowDown'?1:-1))));
    }else if(event.key==='Enter'&&open){
      event.preventDefault();
      if(options[active])pick(options[active]);
    }else if(event.key==='Escape'&&open){
      event.preventDefault();
      close();
    }
  }
  return <div className={cx(s.box,open&&s.open)} data-ui="picker">
    <Icon name="search" size={17} stroke="#585F5B" className={s.icon}/>
    {!query&&<span className={s.label} aria-hidden="true">{shownLabel}</span>}
    <input className={s.input} role="combobox" aria-label={`${label}, ${shownLabel}`} aria-expanded={open} aria-controls={`${id}-list`}
      aria-autocomplete="list" aria-activedescendant={open&&options[active]?`${id}-${active}`:undefined} autoComplete="off" spellCheck={false}
      value={query} onFocus={show} onClick={show} onBlur={close} onKeyDown={key}
      onChange={e=>{setQuery(e.target.value);setActive(0);setOpen(true);}}/>
    {open&&<div className={s.panel} data-ui="picker-panel">
      <div ref={list} id={`${id}-list`} role="listbox" aria-label={label} className={s.list}>
        {options.map((o,i)=><div key={o.id??'all'} id={`${id}-${i}`} role="option" aria-selected={i===active} className={cx(s.option,i===active&&s.active)}
          onMouseDown={e=>{e.preventDefault();pick(o);}} onMouseEnter={()=>setActive(i)}>
          <span className={s.name}>{o.name}</span><span className={s.code}>{o.code}</span>
        </div>)}
      </div>
      {hint&&<div className={s.hint}>{hint}</div>}
    </div>}
  </div>;
}
