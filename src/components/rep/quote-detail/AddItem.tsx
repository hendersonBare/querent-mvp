'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import type {QuoteItemMatch} from '@/server/rep/quote-edits';
import {money} from './format';
import s from './QuoteDetail.module.css';

// + Add item under the last line (plan U4; C_QEBase closed, C_QE8 open). The dashed button opens a
// search over the catalog (GET /api/rep/quotes/<id>/items?q=) whose results drop down over the page:
// each match with its SKU, stock at the quote's branch and the price it would start at, and "Add", or
// "Already on quote" for an item the quote has (it can't be added twice from here). Under the results,
// "3 matches for "1/2". Type a SKU or name." Enter or a click adds the active match; Escape, or leaving
// the empty search, closes it back to the button.

/** How long typing pauses before the search runs. */
export const SEARCH_DELAY_MS=200;

async function searchItems(quoteId:string,query:string,signal:AbortSignal):Promise<QuoteItemMatch[]>{
  const response=await fetch(`/api/rep/quotes/${encodeURIComponent(quoteId)}/items?q=${encodeURIComponent(query)}`,{cache:'no-store',signal});
  if(response.status===401||response.status===403){window.location.assign('/');return [];}
  if(!response.ok)throw new Error('Search isn’t available right now.');
  return (await response.json()).items;
}

/** '3 matches for "1/2". Type a SKU or name.' */
export const matchesLine=(count:number,query:string)=>`${count} ${count===1?'match':'matches'} for "${query}". Type a SKU or name.`;

export function AddItem({quoteId,onAdd,onOpenChange,flash=false}:{quoteId:string;onAdd:(item:QuoteItemMatch)=>void;
  /** The search is open (the Items card stops clipping its results). */
  onOpenChange?:(open:boolean)=>void;
  /** A send blocker points here (no lines, decision 44). */
  flash?:boolean}){
  const [searching,setSearching]=useState(false);
  const [query,setQuery]=useState('');
  const [matches,setMatches]=useState<QuoteItemMatch[]|null>(null);
  const [active,setActive]=useState(0);
  const [problem,setProblem]=useState<string|null>(null);
  const listId=useId();
  const input=useRef<HTMLInputElement>(null),button=useRef<HTMLButtonElement>(null);
  const reopen=useRef(false);

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

  useEffect(()=>{
    onOpenChange?.(searching);
    if(searching)input.current?.focus();
    else if(reopen.current){reopen.current=false;button.current?.focus();}
  },[searching,onOpenChange]);

  function close(refocus=true){reopen.current=refocus;setSearching(false);setQuery('');setMatches(null);}
  function pick(i:number){
    const item=matches?.[i];
    if(!item||item.on_quote)return;
    onAdd(item);
    close(false);
  }
  function onKey(event:KeyboardEvent){
    const count=matches?.length??0;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();
      if(count)setActive(a=>(a+(event.key==='ArrowDown'?1:-1)+count)%count);
    }else if(event.key==='Enter'){event.preventDefault();pick(active);}
    else if(event.key==='Escape'){event.preventDefault();close();}
  }

  const words=query.trim();
  const shown=words.length>0;
  return <div className={s.addRow} data-flash={flash||undefined}>
    {!searching?<button ref={button} type="button" className={s.addButton} onClick={()=>setSearching(true)}><span className={s.plus} aria-hidden="true">+</span>Add item</button>
      :<div className={s.addWrap}>
        <div className={s.search}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M20 20l-4-4"/></svg>
          <input ref={input} type="text" role="combobox" aria-label="Add item" className={s.searchInput} autoComplete="off"
            aria-expanded={shown} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={shown&&matches?.length?`${listId}-${active}`:undefined}
            value={query} onChange={event=>setQuery(event.target.value)} onBlur={()=>{if(!words)close(false);}} onKeyDown={onKey}/>
        </div>
        {shown&&<div className={s.results}>
          <div id={listId} role="listbox" aria-label="Matching items">
            {(matches??[]).map((m,i)=><div key={m.id} id={`${listId}-${i}`} role="option" aria-selected={i===active} aria-disabled={m.on_quote||undefined}
              data-active={i===active||undefined} className={s.result} onPointerDown={event=>event.preventDefault()} onClick={()=>pick(i)} onPointerEnter={()=>setActive(i)}>
              <div>
                <div className={s.resultName}>{m.description}</div>
                <div className={s.resultMeta}><span className={s.mono}>{m.sku}</span>{`, ${m.available} at ${m.branch_code}, ${money(m.price)}`}</div>
              </div>
              <span className={s.resultAction}>{m.on_quote?'Already on quote':'Add'}</span>
            </div>)}
          </div>
          <div className={s.resultsFoot} role="status">{problem??(matches===null?'Searching…':matchesLine(matches.length,words))}</div>
        </div>}
      </div>}
  </div>;
}
