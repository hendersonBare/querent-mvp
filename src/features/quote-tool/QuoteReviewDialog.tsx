'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent as ReactKeyboardEvent,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import d from '@/components/ui/Dialog.module.css';
import {trapTab} from '@/components/ui/focus';
import {saveQuote as defaultSave,searchCatalog as defaultSearch} from './client';
import {QUOTE_COPY} from '@/features/quotes/copy';
import {formatSimilarity} from '@/features/quotes/format';
import {
  blockersMessage,editQuantity,quantityChecks,quantityChecksMessage,formatMoney,initialReview,lineHint,priceError,quantityAside,quantityError,quantityFlag,listPriceLabel,parseQuantity,reviewLineCents,saveBlockers,toSaveRequest,totalCents,withItem,
  type ReviewLine,
} from './review';
import type {MatchRun,SaveQuoteRequest,ScoredItem} from './types';
import {perUnitLabel,unitLabel} from './units';
import s from './QuoteReviewDialog.module.css';

// The review dialog (docs/boxt/plan.md B5), in the old item pop-up's visual language (Dialog.module.css).
// Matched lines: what the customer wrote, the item, SKU, pack, the web list price as a reference label,
// qty (flagged when unclear), an empty unit price, the line total, Swap and Remove (with Undo until
// save). Qty and unit price are both in the item's pricing unit ("250 each", "$ per each"; ./units.ts),
// with a note when the customer's quantity was converted ("Customer asked for 10 bundles = 250 each")
// or a flag when it could not be. Unmatched lines: "Could not detect a match" and the closest items
// behind a toggle, each with its similarity and "Use this item". Customer name, reference, total; Save quote stays disabled until every matched line
// has a price and a quantity, and says why. Saving only saves: nothing is sent to anyone.

export interface QuoteReviewDialogProps {
  run:MatchRun;
  onClose:()=>void;
  /** Called with the new quote's id after it saved. */
  onSaved:(id:string)=>void;
  save?:(body:SaveQuoteRequest)=>Promise<{id:string}>;
  /** The Swap search; `line` is the line's description, which each result is accounted against. */
  search?:(q:string,line:string)=>Promise<ScoredItem[]>;
}

const plural=(n:number,one:string,many=`${one}s`)=>`${n} ${n===1?one:many}`;
const QUANTITY=new Intl.NumberFormat('en-US',{maximumFractionDigits:3});

export function QuoteReviewDialog({run,onClose,onSaved,save=body=>defaultSave(body),search=(q,line)=>defaultSearch(q,{line})}:QuoteReviewDialogProps){
  const [lines,setLines]=useState<ReviewLine[]>(()=>initialReview(run));
  const [customerName,setCustomerName]=useState('');
  const [reference,setReference]=useState('');
  const [edited,setEdited]=useState(false);
  const [confirming,setConfirming]=useState(false);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const [swapKey,setSwapKey]=useState<number|null>(null);
  const [openMisses,setOpenMisses]=useState<ReadonlySet<number>>(new Set());
  const dialog=useRef<HTMLDivElement>(null);
  const titleId=useId(),introId=useId(),matchedId=useId(),unmatchedId=useId();
  const [mounted,setMounted]=useState(false);
  /** The control to focus after the next render, by its data-focus name ("price-3", "undo-3", "swap-3"): an action that unmounts the control it was started from moves focus there instead of losing it to the page. */
  const [focusTarget,setFocusTarget]=useState<string|null>(null);

  useEffect(()=>{
    setMounted(true);
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return ()=>{document.body.style.overflow=overflow;previous?.focus?.();};
  },[]);
  useEffect(()=>{if(mounted)dialog.current?.focus();},[mounted]);
  useEffect(()=>{
    if(!focusTarget)return;
    dialog.current?.querySelector<HTMLElement>(`[data-focus="${focusTarget}"]`)?.focus();
    setFocusTarget(null);
  },[focusTarget,lines,swapKey]);

  // Escape works even if focus somehow left the dialog (to the page body): it is still the open modal.
  const escape=useRef<()=>void>(()=>{});
  escape.current=()=>{if(confirming)setConfirming(false);else requestClose();};
  useEffect(()=>{
    const onDocumentKey=(event:KeyboardEvent)=>{
      if(event.key!=='Escape'||event.defaultPrevented)return;
      if(dialog.current&&event.target instanceof Node&&dialog.current.contains(event.target))return;
      escape.current();
      dialog.current?.focus();
    };
    document.addEventListener('keydown',onDocumentKey);
    return ()=>document.removeEventListener('keydown',onDocumentKey);
  },[]);

  const change=(key:number,next:(line:ReviewLine)=>ReviewLine)=>{
    setLines(ls=>ls.map(l=>l.key===key?next(l):l));
    setEdited(true);
    setError('');
  };
  const update=(key:number,patch:Partial<ReviewLine>)=>change(key,l=>({...l,...patch}));
  const markEdited=()=>{setEdited(true);setError('');};

  function requestClose(){
    if(saving)return;
    if(edited)setConfirming(true);else onClose();
  }

  function onKeyDown(event:ReactKeyboardEvent<HTMLDivElement>){
    if(event.key==='Escape'){
      event.stopPropagation();
      escape.current();
      return;
    }
    trapTab(event);
  }

  const matched=lines.filter(l=>l.status==='matched');
  const unmatched=lines.filter(l=>l.status==='unmatched');
  const inMatchedSection=lines.filter(l=>l.status==='matched'||(l.status==='removed'&&l.restoreTo==='matched'));
  const inUnmatchedSection=lines.filter(l=>l.status==='unmatched'||(l.status==='removed'&&l.restoreTo==='unmatched'));
  const blockers=saveBlockers(lines);
  const why=blockersMessage(blockers);
  const canSave=!saving&&why===null;
  const toCheck=quantityChecksMessage(quantityChecks(lines));

  async function onSave(){
    if(!canSave)return;
    setSaving(true);setError('');
    try{
      const {id}=await save(toSaveRequest(lines,{customerName,reference,level:run.level}));
      onSaved(id);
    }catch(e){
      setError(e instanceof Error&&e.message?e.message:'The quote could not be saved. Try again.');
      setSaving(false);
    }
  }

  function promote(line:ReviewLine,choice:ScoredItem){
    change(line.key,l=>withItem(l,choice,'rep'));
    setFocusTarget(`price-${line.key}`);
  }

  if(!mounted)return null;

  return createPortal(<div className={d.backdrop} onMouseDown={event=>{if(event.target===event.currentTarget)requestClose();}}>
    <div className={`${d.dialog} ${s.dialog}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={introId}
      tabIndex={-1} ref={dialog} onKeyDown={onKeyDown}>
      <header className={`${d.head} ${s.head}`}>
        <div>
          <h2 id={titleId} className={d.title}>Review quote</h2>
          <p id={introId} className={`${d.intro} ${s.intro}`}>
            <strong className={s.summary}>{matched.length} matched, {unmatched.length} could not be matched.</strong>
            {' '}Add your unit price to each matched line. The web list price is shown for reference only.
          </p>
        </div>
        <button type="button" className={s.close} aria-label="Close" onClick={requestClose} disabled={saving}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </button>
      </header>

      <div className={d.body}>
        <div className={s.fields}>
          <label className={s.field}>
            <span className={s.label}>Customer name</span>
            <input className={s.text} value={customerName} maxLength={200} autoComplete="off" disabled={saving}
              onChange={e=>{setCustomerName(e.target.value);markEdited();}}/>
          </label>
          <label className={s.field}>
            <span className={s.label}>Reference <span className={s.optional}>(optional)</span></span>
            <input className={s.text} value={reference} maxLength={200} autoComplete="off" disabled={saving}
              onChange={e=>{setReference(e.target.value);markEdited();}}/>
          </label>
        </div>

        <section className={s.section} aria-labelledby={matchedId}>
          <h3 id={matchedId} className={d.sectionTitle}>Matched ({matched.length})</h3>
          {inMatchedSection.length===0
            ?<p className={d.note}>No lines matched. Use a close item from the unmatched lines below, or save them as they are.</p>
            :<ul className={s.lines}>
              <li className={`${s.line} ${s.lineHead}`} aria-hidden="true"><span>Item</span><span>Qty</span><span>Unit price</span><span className={s.right}>Line total</span><span/></li>
              {inMatchedSection.map(line=>line.status==='removed'
                ?<li key={line.key} className={s.removed} data-testid={`line-${line.key}`}>
                  <span>Removed: {line.item?.description} <span className={d.sku}>{line.item?.sku}</span></span>
                  <button type="button" className={s.link} disabled={saving} data-focus={`undo-${line.key}`}
                    onClick={()=>{update(line.key,{status:line.restoreTo});setFocusTarget(`price-${line.key}`);}}>Undo</button>
                </li>
                :<MatchedLine key={line.key} line={line} saving={saving}
                  swapping={swapKey===line.key}
                  onQuantity={value=>change(line.key,l=>editQuantity(l,value))}
                  onPrice={value=>update(line.key,{price:value})}
                  onSwap={()=>setSwapKey(key=>key===line.key?null:line.key)}
                  onRemove={()=>{update(line.key,{status:'removed',restoreTo:'matched'});if(swapKey===line.key)setSwapKey(null);setFocusTarget(`undo-${line.key}`);}}
                  picker={swapKey===line.key&&<SwapPicker line={line} search={search}
                    onCancel={()=>{setSwapKey(null);setFocusTarget(`swap-${line.key}`);}}
                    onPick={choice=>{change(line.key,l=>withItem(l,choice,'rep'));setSwapKey(null);setFocusTarget(`price-${line.key}`);}}/>}
                />)}
            </ul>}
        </section>

        <section className={s.section} aria-labelledby={unmatchedId}>
          <h3 id={unmatchedId} className={d.sectionTitle}>Unmatched ({unmatched.length})</h3>
          {inUnmatchedSection.length===0
            ?<p className={d.note}>Every line matched an item.</p>
            :<>
              <p className={s.sectionNote}>These lines are saved with the quote as the customer wrote them, flagged as unmatched.</p>
              <ul className={s.lines}>
                {inUnmatchedSection.map(line=>{
                  const open=openMisses.has(line.key);
                  const quantity=parseQuantity(line.quantity);
                  return <li key={line.key} className={s.uline} data-testid={`line-${line.key}`}>
                    <div className={s.utop}>
                      <div className={d.item}>
                        <span className={s.wroteLabel}>Customer wrote</span>
                        <span className={s.original}>{line.rawText}</span>
                        <span className={s.nomatch}>Could not detect a match</span>
                        {line.reason&&lineHint(line.reason,line.blockers)&&<span className={s.hint}>{lineHint(line.reason,line.blockers)}</span>}
                      </div>
                      <span className={s.uqty}>{quantity===null?'No quantity':`Qty ${QUANTITY.format(quantity)}${line.unit?` ${unitLabel(quantity,line.unit)}`:''}`}</span>
                      {line.nearMisses.length>0
                        ?<button type="button" className={s.toggle} aria-expanded={open} disabled={saving}
                          onClick={()=>setOpenMisses(set=>{const next=new Set(set);if(next.has(line.key))next.delete(line.key);else next.add(line.key);return next;})}>
                          {open?'Hide closest items':`Show ${plural(line.nearMisses.length,'closest item')}`}
                        </button>
                        :<span className={s.none}>No similar items in the catalog</span>}
                    </div>
                    {open&&<ul className={s.misses} aria-label="Closest items">
                      {line.nearMisses.map(miss=><li key={miss.sku} className={s.miss} data-testid="near-miss">
                        <div className={d.item}>
                          <span className={d.desc}>{miss.description}</span>
                          <span className={d.id}>
                            <span className={d.sku}>{miss.sku}</span>
                            {miss.pack&&<span className={d.pack}>{miss.pack}</span>}
                            {listPriceLabel(miss)&&<span className={d.pack}>{listPriceLabel(miss)}</span>}
                          </span>
                        </div>
                        <Similarity score={miss.score}/>
                        <button type="button" className={d.add} disabled={saving} onClick={()=>promote(line,miss)}>Use this item</button>
                      </li>)}
                    </ul>}
                  </li>;
                })}
              </ul>
            </>}
        </section>
      </div>

      <footer className={`${d.foot} ${s.foot}`}>
        {confirming
          ?<>
            <p className={s.confirm} role="status">Discard this review? The prices and changes you made will be lost.</p>
            <div className={d.actions}>
              <button type="button" className={d.secondary} onClick={()=>setConfirming(false)} autoFocus>Keep reviewing</button>
              <button type="button" className={`${d.primary} ${s.danger}`} onClick={onClose}>Discard</button>
            </div>
          </>
          :<>
            <div className={s.totalBlock}>
              <span className={s.totalLabel}>Total</span>
              <span className={s.totalValue} data-testid="quote-total">{formatMoney(totalCents(lines))}</span>
            </div>
            <div className={s.saveBlock}>
              <div className={d.actions}>
                <button type="button" className={d.secondary} onClick={requestClose} disabled={saving}>Cancel</button>
                <button type="button" className={d.primary} onClick={()=>void onSave()} disabled={!canSave}>{saving?'Saving…':'Save quote'}</button>
              </div>
              {error?<p className={s.error} role="alert">{error}</p>:why&&<p className={s.why}>{why}</p>}
              {toCheck&&<p className={s.toCheck}>{toCheck}</p>}
            </div>
          </>}
      </footer>
    </div>
  </div>,document.body);
}

/** How closely an item's description fits the line: a neutral label and bar, never a claim that it matches. */
function Similarity({score}:{score:number}){
  const value=formatSimilarity(score)??'0%';
  return <span className={s.similarity} title="How closely the item's description fits the line">
    <span className={s.similarityText}>Similarity {value}</span>
    <span className={s.similarityBar} aria-hidden="true"><span style={{width:value}}/></span>
  </span>;
}

interface MatchedLineProps {
  line:ReviewLine;saving:boolean;swapping:boolean;picker:ReactNode;
  onQuantity:(value:string)=>void;onPrice:(value:string)=>void;onSwap:()=>void;onRemove:()=>void;
}

function MatchedLine({line,saving,swapping,picker,onQuantity,onPrice,onSwap,onRemove}:MatchedLineProps){
  const item=line.item!;
  const cents=reviewLineCents(line);
  const badPrice=priceError(line.price);
  const badQuantity=quantityError(line.quantity);
  const label=listPriceLabel(item);
  const flag=badQuantity?null:quantityFlag(line);
  const aside=quantityAside(line);
  const qtyUnit=unitLabel(parseQuantity(line.quantity),line.unit);
  const priceUnit=perUnitLabel(line.unit);
  return <li className={`${s.line} ${flag||aside?s.withNotes:''}`} data-testid={`line-${line.key}`}>
    <div className={d.item}>
      <span className={s.wrote}>Customer wrote: {line.rawText}</span>
      <span className={d.desc}>{item.description}</span>
      <span className={d.id}>
        <span className={d.sku}>{item.sku}</span>
        {item.pack&&<span className={d.pack}>{item.pack}</span>}
        {label&&<span className={s.listPrice}>{label}</span>}
        {line.matchedBy==='rep'&&<span className={s.tag}>{QUOTE_COPY.matchedByRep}</span>}
      </span>
    </div>
    <div className={s.cell}>
      <span className={s.withUnit}>
        <input className={`${d.input} ${s.qtyInput}`} value={line.quantity} inputMode="decimal" autoComplete="off" aria-label={`Quantity for ${item.sku}`}
          aria-invalid={badQuantity!==null} disabled={saving} onChange={e=>onQuantity(e.target.value)}/>
        {qtyUnit&&<span className={s.unit} data-testid="qty-unit">{qtyUnit}</span>}
      </span>
      {badQuantity&&<span className={d.fieldError}>{badQuantity}</span>}
    </div>
    <div className={s.cell}>
      <span className={s.withUnit}>
        <span className={s.money}>
          <span className={s.dollar} aria-hidden="true">$</span>
          <input className={`${d.input} ${s.priceInput}`} value={line.price} inputMode="decimal" autoComplete="off" aria-label={`Unit price for ${item.sku}`} data-focus={`price-${line.key}`}
            aria-invalid={badPrice!==null} disabled={saving} onChange={e=>onPrice(e.target.value)}/>
        </span>
        {priceUnit&&<span className={s.unit} data-testid="price-unit">{priceUnit}</span>}
      </span>
      {badPrice&&<span className={d.fieldError}>{badPrice}</span>}
    </div>
    <div className={s.lineTotal}>{cents===null?<span className={s.muted}>No price</span>:formatMoney(cents)}</div>
    <div className={s.lineActions}>
      <button type="button" className={s.link} aria-expanded={swapping} disabled={saving} data-focus={`swap-${line.key}`} onClick={onSwap}>Swap</button>
      <button type="button" className={`${s.link} ${s.linkDanger}`} disabled={saving} onClick={onRemove}>Remove</button>
    </div>
    {(flag||aside)&&<div className={s.qtyNotes}>
      {flag&&<span className={s.flag}>{flag}</span>}
      {aside&&<span className={s.aside}>{aside}</span>}
    </div>}
    {picker}
  </li>;
}

function SwapPicker({line,search,onPick,onCancel}:{line:ReviewLine;search:(q:string,line:string)=>Promise<ScoredItem[]>;onPick:(choice:ScoredItem)=>void;onCancel:()=>void}){
  const [q,setQ]=useState('');
  const [results,setResults]=useState<ScoredItem[]|null>(null);
  const [status,setStatus]=useState<'idle'|'loading'|'error'>('idle');
  const input=useRef<HTMLInputElement>(null);
  const current=line.item?.sku;
  const others=line.candidates.filter(c=>c.sku!==current);

  useEffect(()=>{input.current?.focus();},[]);
  useEffect(()=>{
    const query=q.trim();
    if(query.length<2){setResults(null);setStatus('idle');return;}
    let cancelled=false;
    const timer=setTimeout(()=>{
      setStatus('loading');
      search(query,line.description).then(items=>{if(!cancelled){setResults(items);setStatus('idle');}},()=>{if(!cancelled){setResults(null);setStatus('error');}});
    },300);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[q,search,line.description]);

  const option=(choice:ScoredItem)=><li key={choice.sku} className={s.option}>
    <div className={d.item}>
      <span className={d.desc}>{choice.description}</span>
      <span className={d.id}>
        <span className={d.sku}>{choice.sku}</span>
        {choice.pack&&<span className={d.pack}>{choice.pack}</span>}
        <span className={d.pack}>Similarity {formatSimilarity(choice.score)}</span>
      </span>
    </div>
    <button type="button" className={d.add} aria-label={`Use ${choice.sku}, ${choice.description}`} onClick={()=>onPick(choice)}>Use</button>
  </li>;

  const found=(results??[]).filter(r=>r.sku!==current);
  return <div className={s.picker} role="group" aria-label="Swap item"
    onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();onCancel();}}}>
    <div className={s.pickerHead}>
      <span className={s.pickerTitle}>Swap {current} for another item</span>
      <button type="button" className={s.link} onClick={onCancel}>Cancel</button>
    </div>
    {others.length>0&&<>
      <p className={s.pickerLabel}>Other close items</p>
      <ul className={s.options}>{others.map(option)}</ul>
    </>}
    <input ref={input} type="search" className={`${s.text} ${s.search}`} aria-label="Search the catalog" placeholder="Search the catalog: size, type, material or SKU"
      value={q} onChange={e=>setQ(e.target.value)}/>
    {status==='loading'&&<p className={s.pickerNote}>Searching…</p>}
    {status==='error'&&<p className={s.pickerNote}>The search did not work. Try again.</p>}
    {status==='idle'&&results!==null&&(found.length
      ?<ul className={s.options} aria-label="Search results">{found.map(option)}</ul>
      :<p className={s.pickerNote}>No catalog items match that search.</p>)}
  </div>;
}
