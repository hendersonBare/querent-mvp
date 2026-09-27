'use client';
import {useEffect,useId,useRef,useState,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {createPortal} from 'react-dom';
import {Check,ListChecks,X} from 'lucide-react';
import type {Fulfillment,ItemPopupPayload} from '@/domain';
import type {API,ItemPopupContext,QuoteRequestInput,QuoteRequestResult} from '@/lib/contracts';

// The item pop-up (spec §3, task 2.3). Querent opens it once every requested line is matched: each
// line's item, SKU, qty and stock at the chosen branch, never a price. The customer can change a
// qty, remove a line, choose pickup or delivery and the branch, then press Request quote, which
// drafts the quote for the rep (POST customer/quote-requests) and adds the chat's confirmation.
// Stock is read when the pop-up opens (GET customer/item-popup), not stored with the list.
//
// In the chat bubble, a button reopens the pop-up while its list can still be quoted; once quoted
// the bubble names the quote instead.

export const MAX_QTY=9999;

interface Line {sku:string;qty:string}
type Stock={tone:'ok'|'short'|'out';text:string;note?:string};

/** A qty as typed: a whole number from 1 to 9999, else null. */
export function parseQty(value:string){
  const n=Number(value.trim());
  return value.trim()!==''&&Number.isInteger(n)&&n>=1&&n<=MAX_QTY?n:null;
}

/** How a line's stock reads at the branch ("64 at SLC"), with a note when it can't fill the qty. */
export function stockAt(available:number,qty:number|null,branchCode:string):Stock{
  if(available<=0)return {tone:'out',text:`None at ${branchCode}`,note:'Out of stock'};
  if(qty!==null&&available<qty)return {tone:'short',text:`${available} at ${branchCode}`,note:`Short ${qty-available}`};
  return {tone:'ok',text:`${available} at ${branchCode}`};
}

const FOCUSABLE='button:not([disabled]),input:not([disabled]),select:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])';
const plural=(n:number,one:string)=>`${n} ${one}${n===1?'':'s'}`;

interface DialogProps {
  api:API;conversationId:string;payload:ItemPopupPayload;
  onClose:()=>void;onRequested:(result:QuoteRequestResult)=>void;
}

function ItemPopupDialog({api,conversationId,payload,onClose,onRequested}:DialogProps){
  const [lines,setLines]=useState<Line[]>(()=>payload.lines.map(l=>({sku:l.sku,qty:String(l.qty)})));
  const [fulfillment,setFulfillment]=useState<Fulfillment>(payload.fulfillment);
  const [branchId,setBranchId]=useState(payload.branch_id);
  const [context,setContext]=useState<ItemPopupContext|null>(null);
  const [loadError,setLoadError]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const dialog=useRef<HTMLDivElement>(null);
  const title=useId(),intro=useId();

  // Stock is read now, for every branch, so switching branch needs no second request.
  useEffect(()=>{
    let cancelled=false;
    const skus=payload.lines.map(l=>l.sku).join(',');
    api.get<ItemPopupContext>(`customer/item-popup?skus=${encodeURIComponent(skus)}`)
      .then(result=>{if(!cancelled)setContext(result);})
      .catch(e=>{if(!cancelled)setLoadError(e instanceof Error?e.message:'Stock could not be loaded.');});
    return ()=>{cancelled=true;};
  },[api,payload]);

  useEffect(()=>{dialog.current?.focus();},[]);

  function onKeyDown(event:ReactKeyboardEvent){
    if(event.key==='Escape'){event.stopPropagation();onClose();return;}
    if(event.key!=='Tab'||!dialog.current)return;
    const focusable=[...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if(!focusable.length)return;
    const first=focusable[0],last=focusable[focusable.length-1];
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog.current)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  }

  const items=new Map(context?.items.map(i=>[i.sku.toUpperCase(),i]));
  const branch=context?.branches.find(b=>b.id===branchId);
  const code=branch?.code??branchId.toUpperCase();
  const rep=context?.rep_name?.split(/\s+/)[0]??'Your rep';
  const qtys=lines.map(l=>parseQty(l.qty));
  const noShipTo=fulfillment==='delivery'&&context!==null&&!context.ship_to;
  const canRequest=!busy&&lines.length>0&&qtys.every(q=>q!==null)&&!noShipTo&&context!==null;

  async function request(){
    if(!canRequest)return;
    setBusy(true);setError('');
    const body:QuoteRequestInput={conversation_id:conversationId,fulfillment,branch_id:branchId,lines:lines.map((l,i)=>({sku:l.sku,qty:qtys[i]!}))};
    try{onRequested(await api.send<QuoteRequestResult>('customer/quote-requests','POST',body));}
    catch(e){setError(e instanceof Error?e.message:'The quote could not be requested. Try again.');setBusy(false);}
  }

  return <div className="ip-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)onClose();}}>
    <div className="ip-dialog" role="dialog" aria-modal="true" aria-labelledby={title} aria-describedby={intro} tabIndex={-1} ref={dialog} onKeyDown={onKeyDown}>
      <header className="ip-head">
        <h2 id={title}>Review your list</h2>
        <p id={intro} className="ip-intro">Check each quantity and where you want it. {rep} prices the quote and sends it to you here in chat.</p>
      </header>

      <div className="ip-body">
        <div className="ip-where">
          <div className="ip-segment" role="radiogroup" aria-label="Pickup or delivery">
            {([['will_call','Pickup'],['delivery','Delivery']] as const).map(([value,label])=><label key={value} className="ip-option">
              <input type="radio" name={`${title}-fulfillment`} value={value} checked={fulfillment===value} onChange={()=>setFulfillment(value)} disabled={busy}/>
              <span>{label}</span>
            </label>)}
          </div>
          <label className="ip-branch">
            <span aria-hidden="true">{fulfillment==='will_call'?'at':'from'}</span>
            <select aria-label="Branch" value={branchId} onChange={e=>setBranchId(e.target.value)} disabled={busy||!context}>
              {(context?.branches??[{id:branchId,code,name:code}]).map(b=><option key={b.id} value={b.id}>{b.code===b.name?b.code:`${b.code}, ${b.name}`}</option>)}
            </select>
          </label>
        </div>
        {fulfillment==='delivery'&&context&&(context.ship_to
          ?<p className="ip-shipto">Delivers to {context.ship_to}. Any freight is on the quote.</p>
          :<p className="ip-shipto ip-warn" role="alert">We have no delivery address on file for your account. Choose pickup, or ask {rep} to add one.</p>)}

        {lines.length===0
          ?<p className="ip-empty">Your list is empty. Close this and ask for items in the chat.</p>
          :<ul className="ip-lines" aria-label="Items">
            <li className="ip-line ip-line-head" aria-hidden="true"><span>Item</span><span>Qty</span><span>Stock at {code}</span><span/></li>
            {lines.map((line,i)=>{
              const item=items.get(line.sku.toUpperCase());
              const available=item?.stock?.find(s=>s.branch_id===branchId)?.available;
              const stock=available===undefined?null:stockAt(available,qtys[i],code);
              const bad=qtys[i]===null;
              return <li key={line.sku} className="ip-line">
                <div className="ip-item">
                  <span className="ip-desc">{item?.description??line.sku}</span>
                  <span className="ip-id"><span className="ip-sku">{line.sku}</span>{item&&<span className="ip-pack">{item.pack}</span>}</span>
                </div>
                <div className="ip-qty">
                  <input type="number" inputMode="numeric" min={1} max={MAX_QTY} step={1} value={line.qty} aria-label={`Qty for ${line.sku}`} aria-invalid={bad}
                    disabled={busy} onChange={e=>setLines(ls=>ls.map((l,j)=>j===i?{...l,qty:e.target.value}:l))}/>
                  {bad&&<span className="ip-qty-error">1 to {MAX_QTY}</span>}
                </div>
                <div className={`ip-stock${stock?` ip-stock-${stock.tone}`:''}`}>
                  {!context&&!loadError?<span className="muted">Checking…</span>
                    :stock?<><span className="ip-dot" aria-hidden="true"/><span>{stock.text}</span>{stock.note&&<span className="ip-stock-note">{stock.note}</span>}</>
                    :<><span className="muted" aria-hidden="true">—</span><span className="ip-sr">Not shown</span></>}
                </div>
                <button type="button" className="icon-button ip-remove" aria-label={`Remove ${line.sku}`} disabled={busy}
                  onClick={()=>setLines(ls=>ls.filter((_,j)=>j!==i))}><X size={16}/></button>
              </li>;
            })}
          </ul>}
        {context&&!context.stock_shown&&<p className="ip-note">Stock isn’t shown for your account. {rep} confirms availability on the quote.</p>}
        {loadError&&<p className="ip-note">Stock couldn’t be loaded ({loadError}). You can still request the quote.</p>}
        {error&&<p className="error" role="alert">{error}</p>}
      </div>

      <footer className="ip-foot">
        <span className="ip-count">{plural(lines.length,'item')}</span>
        <div className="ip-actions">
          <button type="button" className="ip-secondary" onClick={onClose} disabled={busy}>Close</button>
          <button type="button" className="ip-primary" onClick={()=>void request()} disabled={!canRequest}>{busy?'Requesting…':'Request quote'}</button>
        </div>
      </footer>
    </div>
  </div>;
}

export interface ItemPopupProps {
  api:API;conversationId:string;payload:ItemPopupPayload;
  /** The list can still be quoted: the latest pop-up in the chat, with no quote yet. */
  active:boolean;
  /** The quote this list became, once requested. */
  requested?:string|null;
  /** Open as soon as it appears (a reply that just arrived, not one reloaded from history). */
  autoOpen?:boolean;
  onRequested:(result:QuoteRequestResult)=>void;
}

/** The pop-up's place in the chat bubble: the button that opens it, or the quote it became. */
export function ItemPopup({api,conversationId,payload,active,requested,autoOpen=false,onRequested}:ItemPopupProps){
  const [open,setOpen]=useState(autoOpen&&active);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(!active)setOpen(false);},[active]);
  function close(){setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());}
  if(requested)return <p className="ip-requested"><Check size={16} aria-hidden="true"/>Quote {requested} requested</p>;
  if(!active)return null;
  return <>
    <div className="ip-inline">
      <button type="button" ref={trigger} className="ip-open" onClick={()=>setOpen(true)} aria-haspopup="dialog">
        <ListChecks size={17} aria-hidden="true"/>Review list and request quote
      </button>
    </div>
    {open&&createPortal(<ItemPopupDialog api={api} conversationId={conversationId} payload={payload} onClose={close}
      onRequested={result=>{setOpen(false);onRequested(result);}}/>,document.body)}
  </>;
}
