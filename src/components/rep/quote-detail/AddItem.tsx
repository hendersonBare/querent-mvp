'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {Plus} from 'lucide-react';
import type {QuoteItemMatch} from '@/server/rep/quote-edits';
import {money} from './format';
import s from './QuoteDetail.module.css';

// "Add item by SKU or name" (spec §4, mockup .additem; task 3.3): a combobox over the catalog
// (GET /api/rep/quotes/<id>/items?q=). Each match shows the price it would start at and stock at
// the quote's branch; items already on the quote are listed but can't be added twice from here.

/** How long typing pauses before the search runs. */
export const SEARCH_DELAY_MS=200;

async function searchItems(quoteId:string,query:string,signal:AbortSignal):Promise<QuoteItemMatch[]>{
  const response=await fetch(`/api/rep/quotes/${encodeURIComponent(quoteId)}/items?q=${encodeURIComponent(query)}`,{cache:'no-store',signal});
  if(response.status===401||response.status===403){window.location.assign('/');return [];}
  if(!response.ok)throw new Error('Search isn’t available right now.');
  return (await response.json()).items;
}

export function AddItem({quoteId,onAdd,busy}:{quoteId:string;onAdd:(item:QuoteItemMatch)=>void;busy:boolean}){
  const [query,setQuery]=useState('');
  const [open,setOpen]=useState(false);
  const [matches,setMatches]=useState<QuoteItemMatch[]|null>(null);
  const [active,setActive]=useState(0);
  const [problem,setProblem]=useState<string|null>(null);
  const listId=useId();
  const input=useRef<HTMLInputElement>(null);

  useEffect(()=>{
    const words=query.trim();
    if(!words){setMatches(null);return;}
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      searchItems(quoteId,words,controller.signal).then(found=>{setMatches(found);setActive(Math.max(0,found.findIndex(m=>!m.on_quote)));setProblem(null);},
        error=>{if(!controller.signal.aborted)setProblem(error instanceof Error?error.message:'Search failed.');});
    },SEARCH_DELAY_MS);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,quoteId]);

  const shown=open&&query.trim().length>0;
  function pick(i:number){
    const item=matches?.[i];
    if(!item||item.on_quote)return;
    onAdd(item);
    setQuery('');setMatches(null);setOpen(false);
  }
  function onKey(event:KeyboardEvent){
    const count=matches?.length??0;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();setOpen(true);
      if(count)setActive(a=>(a+(event.key==='ArrowDown'?1:-1)+count)%count);
    }else if(event.key==='Enter'){event.preventDefault();pick(active);}
    else if(event.key==='Escape'){setOpen(false);}
  }

  return <div className={s.addItem}>
    <Plus aria-hidden="true" size={15} strokeWidth={2.4} className={s.addIcon}/>
    <input ref={input} type="text" role="combobox" aria-label="Add item by SKU or name" placeholder="Add item by SKU or name" autoComplete="off"
      aria-expanded={shown} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={shown&&matches?.length?`${listId}-${active}`:undefined}
      value={query} onChange={event=>{setQuery(event.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={()=>setOpen(false)} onKeyDown={onKey}/>
    {busy&&<span className={s.addBusy} role="status">Adding…</span>}
    <div className={s.addList} id={listId} role="listbox" aria-label="Matching items" hidden={!shown}>
      {problem?<p className={s.addNone}>{problem}</p>
        :matches===null?<p className={s.addNone}>Searching…</p>
        :!matches.length?<p className={s.addNone}>No items match “{query.trim()}”. Try a SKU or a word like “strap”.</p>
        :matches.map((m,i)=><div key={m.id} id={`${listId}-${i}`} role="option" aria-selected={i===active} aria-disabled={m.on_quote||undefined} className={s.addOption}
          onPointerDown={event=>event.preventDefault()} onClick={()=>pick(i)} onPointerEnter={()=>setActive(i)}>
          <span className={s.addDesc}>{m.description}</span>
          <span className={s.addPrice}>{m.on_quote?'On quote':money(m.price)}</span>
          <span className={s.addMeta}><span className={s.sku}>{m.sku}</span> · {m.available} at {m.branch_code}</span>
        </div>)}
    </div>
  </div>;
}
