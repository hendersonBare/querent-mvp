'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {useRouter} from 'next/navigation';
import {cx} from '@/components/ui/cx';
import type {AddToQuoteTarget} from '@/server/rep/add-to-quote';
import type {ItemRow} from '@/server/rep/reference';
import {REP_STATUS} from '../quotes/labels';
import {count,money} from '../reference/format';
import s from './AddToQuote.module.css';

// Add to quote (plan U5; C_ST3), from a Stock row or the item page: pick one of the rep's own drafts
// (the first is picked), set the quantity, and add. Adding uses the existing add-line route
// (POST /api/rep/quotes/<number>/lines {itemId, qty}), so the engine prices the line and the server
// refuses a quote that can't be edited; pricing and matching are untouched (Appendix F).
//
// No frame (docs/plans/status.md, to ask): after adding, the quote opens; a refusal shows the server's
// reason in one red line; "Start a new quote" is drawn and can be picked, but no route starts a quote
// from Stock yet, so its button stays disabled; the picked look of that row.

const NEW='new';

export function AddToQuoteDialog({item,targets,onClose}:{item:ItemRow;targets:readonly AddToQuoteTarget[];onClose:()=>void}){
  const router=useRouter();
  const [picked,setPicked]=useState<string>(targets[0]?.quote_number??NEW);
  const [qty,setQty]=useState('1');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [mounted,setMounted]=useState(false);
  const ref=useRef<HTMLDivElement>(null);
  const close=useRef(onClose);
  const titleId=useId();
  useEffect(()=>{close.current=onClose;});
  useEffect(()=>setMounted(true),[]);
  useEffect(()=>{
    if(!mounted)return;
    const before=document.activeElement as HTMLElement|null;
    ref.current?.focus({preventScroll:true});
    return ()=>before?.focus({preventScroll:true});
  },[mounted]);

  const amount=/^\d+$/.test(qty.trim())?Number(qty.trim()):0;
  const choices=[...targets.map(t=>t.quote_number),NEW];
  const startNew=picked===NEW;
  async function add(){
    if(startNew||amount<1||busy)return;
    setBusy(true);setError(null);
    try{
      const response=await fetch(`/api/rep/quotes/${encodeURIComponent(picked)}/lines`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemId:item.id,qty:amount})});
      if(!response.ok){
        const body=await response.json().catch(()=>null) as {detail?:string}|null;
        setError(body?.detail??`Unable to add to ${picked}.`);
        return;
      }
      router.push(`/rep/quotes/${encodeURIComponent(picked)}`);
    }catch{setError(`Unable to add to ${picked}.`);}
    finally{setBusy(false);}
  }
  function key(event:KeyboardEvent){
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close.current();return;}
    if(event.key!=='Tab')return;
    // Tab and Shift+Tab stay inside the dialog.
    const focusable=[...(ref.current?.querySelectorAll<HTMLElement>('[tabindex="0"],input,button:not([disabled])')??[])];
    const first=focusable[0],last=focusable.at(-1);
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  function move(event:KeyboardEvent,value:string){
    if(event.key===' '||event.key==='Enter'){event.preventDefault();setPicked(value);return;}
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;
    event.preventDefault();
    const next=choices[Math.min(choices.length-1,Math.max(0,choices.indexOf(value)+(event.key==='ArrowDown'?1:-1)))];
    setPicked(next);
    (ref.current?.querySelector(`[data-choice="${next}"]`) as HTMLElement|null)?.focus();
  }

  if(!mounted)return null;
  return createPortal(<div className={`ui-root ${s.layer}`}>
    <div className={s.backdrop} data-ui="add-to-quote-backdrop" onMouseDown={onClose}/>
    <div ref={ref} className={s.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onKeyDown={key} data-ui="add-to-quote">
      <div id={titleId} className={s.title}>Add to quote</div>
      <div className={s.item}>
        <div className={s.itemName}>{item.description}</div>
        <div className={s.itemFacts}><span className={s.mono}>{item.sku}</span>{`, ${item.pack}, list price ${money(item.list_price)}, ${item.total_available} in stock`}</div>
      </div>
      <div className={s.label} id={`${titleId}-which`}>Which quote?</div>
      <div role="radiogroup" aria-labelledby={`${titleId}-which`}>
        {targets.map(t=>{
          const on=picked===t.quote_number;
          return <div key={t.quote_number} role="radio" aria-checked={on} tabIndex={on?0:-1} data-choice={t.quote_number}
            className={cx(s.choice,on&&s.picked)} onClick={()=>setPicked(t.quote_number)} onKeyDown={e=>move(e,t.quote_number)}>
            <span className={cx(s.dot,on&&s.dotOn)}>{on&&<span className={s.dotFill}/>}</span>
            <div className={s.choiceText}>
              <div className={s.choiceName}><span className={s.mono}>{t.quote_number}</span>{`, ${t.customer_name}`}</div>
              <div className={s.choiceFacts}>{`${REP_STATUS[t.status].label}, ${count(t.line_count,'line')}`}</div>
            </div>
            <span className={s.choiceTotal}>{t.total===null?'Not sent':money(t.total)}</span>
          </div>;
        })}
        <div role="radio" aria-checked={startNew} tabIndex={startNew?0:-1} data-choice={NEW} className={cx(s.newQuote,startNew&&s.newPicked)}
          onClick={()=>setPicked(NEW)} onKeyDown={e=>move(e,NEW)}><span className={s.plus}>+</span>Start a new quote</div>
      </div>
      <div className={s.footer}>
        <div>
          <label className={s.qtyLabel} htmlFor={`${titleId}-qty`}>Quantity</label>
          <input id={`${titleId}-qty`} className={s.qty} type="text" inputMode="numeric" autoComplete="off" value={qty}
            onChange={e=>{setQty(e.target.value);setError(null);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void add();}}}/>
        </div>
        <div className={s.note}>The customer price applies once it is on the quote. You can change it there.</div>
      </div>
      {error&&<div role="alert" className={s.error}>{error}</div>}
      <div className={s.actions}>
        <button type="button" className={s.cancel} onClick={onClose}>Cancel</button>
        <button type="button" className={s.add} disabled={startNew||amount<1||busy} onClick={()=>void add()}>{startNew?'Start a new quote':`Add to ${picked}`}</button>
      </div>
    </div>
  </div>,document.body);
}
