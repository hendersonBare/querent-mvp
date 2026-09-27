'use client';
import {useCallback,useMemo,useRef,useState} from 'react';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import type {NewLine} from '@/server/rep/quote-edits';
import {BASIS_LABELS} from '@/server/pricing';
import {applyPatch,inversePatch,shortName,type DetailLine,type LinePatch} from '@/server/rep/quote-math';
import type {UpsellAction} from '@/server/upsells';
import {money} from './format';

// The quote detail's editing state (task 3.3). Every edit autosaves through the rep API
// (PATCH / DELETE / POST /api/rep/quotes/<id>/lines...), one request at a time and in order, so
// saves can't overtake each other. Until a save comes back the grid already shows it: the lines
// on screen are the server's copy with the queued edits applied by the same functions the server
// uses (applyPatch), plus whatever the rep is typing right now (a draft, not yet queued).
//
// Undo takes back the rep's last edit (a stack, most recent first): a changed qty, basis or
// price, a removed line (put back in its place) or an added one. Undo itself autosaves too.
// Taking a "Suggested by Querent" chip (task 3.6) is one more edit: the server adds its line or
// bumps a qty, and Undo removes that line or puts the qty back.

export type EditOp=
  |{kind:'patch';lineId:string;patch:LinePatch}
  |{kind:'remove';lineId:string}
  /** `preview` shows a restored line in its place before the save comes back. */
  |{kind:'add';itemId:string;qty:number;restore?:NewLine['restore'];preview?:DetailLine}
  /** Takes one of Querent's suggestions (POST .../upsells); `bump` shows a qty bump before the save comes back. */
  |{kind:'upsell';upsellId:string;bump?:{lineId:string;qty:number}};

export interface UndoEntry {
  id:number;
  /** "Removed Ratchet strap 2 in x 27 ft". */
  label:string;
  /** The edit that takes it back; null while an added line's save is in flight (its id isn't known yet). */
  inverse:EditOp|null;
  /** Edits to one field in one focus session share an entry, so Undo returns to where it started. */
  key?:string;
}

interface Pending {id:number;op:EditOp;undoId:number|null}

export class EditError extends Error{
  constructor(message:string,readonly status:number){super(message);this.name='EditError';}
}

/** Sends one edit; the answer is the fresh detail (and, for an added line, its id). */
async function send(quoteId:string,op:EditOp):Promise<{detail:QuoteDetail;line_id?:string}>{
  const base=`/api/rep/quotes/${encodeURIComponent(quoteId)}/lines`;
  const json={'content-type':'application/json'};
  const response=op.kind==='upsell'?await fetch(`/api/rep/quotes/${encodeURIComponent(quoteId)}/upsells`,{method:'POST',headers:json,body:JSON.stringify({upsellId:op.upsellId}),cache:'no-store'})
    :op.kind==='patch'?await fetch(`${base}/${encodeURIComponent(op.lineId)}`,{method:'PATCH',headers:json,body:JSON.stringify(op.patch),cache:'no-store'})
    :op.kind==='remove'?await fetch(`${base}/${encodeURIComponent(op.lineId)}`,{method:'DELETE',cache:'no-store'})
    :await fetch(base,{method:'POST',headers:json,body:JSON.stringify({itemId:op.itemId,qty:op.qty,...(op.restore?{restore:op.restore}:{})}),cache:'no-store'});
  if(response.status===401||response.status===403){window.location.assign('/');throw new EditError('Choose a demo workspace.',response.status);}
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new EditError(body?.detail??'That change wasn’t saved. Try again.',response.status);
  return op.kind==='add'||op.kind==='upsell'?body:{detail:body};
}

async function reload(quoteId:string):Promise<QuoteDetail|null>{
  const response=await fetch(`/api/rep/quotes/${encodeURIComponent(quoteId)}`,{cache:'no-store'}).catch(()=>null);
  return response?.ok?response.json():null;
}

/** The lines on screen: the server's, with queued edits applied in order, then the drafts being typed. */
export function displayLines(lines:readonly DetailLine[],ops:readonly EditOp[],drafts:Readonly<Record<string,LinePatch>>):DetailLine[]{
  let out=[...lines];
  for(const op of ops){
    if(op.kind==='patch')out=out.map(l=>l.id===op.lineId?applyPatch(l,op.patch)??l:l);
    else if(op.kind==='remove')out=out.filter(l=>l.id!==op.lineId);
    else if(op.kind==='upsell'){const {bump}=op;if(bump)out=out.map(l=>l.id===bump.lineId?applyPatch(l,{qty:bump.qty})??l:l);}
    else if(op.preview&&!out.some(l=>l.id===op.preview!.id))out=[...out,op.preview].sort((a,b)=>a.line_no-b.line_no);
  }
  return out.map(l=>drafts[l.id]?applyPatch(l,drafts[l.id])??l:l);
}

/** "Changed qty on Hex cap screw 1/2-13 x 2 in to 12", "Priced … at List", "Changed price on … to $22.00". */
export function patchLabel(line:DetailLine,patch:LinePatch){
  const name=shortName(line.description);
  if(patch.basis&&patch.basis!=='custom')return `Priced ${name} at ${BASIS_LABELS[patch.basis]}`;
  if(patch.unitPrice!==undefined)return patch.unitPrice===null?`Cleared the price on ${name}`:`Changed price on ${name} to ${money(patch.unitPrice)}`;
  if(patch.qty!==undefined)return `Changed qty on ${name} to ${patch.qty}`;
  return `Priced ${name} as Custom`;
}

export function useQuoteEditor(initial:QuoteDetail){
  const [server,setServer]=useState(initial);
  const [pending,setPending]=useState<Pending[]>([]);
  const [drafts,setDrafts]=useState<Record<string,LinePatch>>({});
  const [undoStack,setUndoStack]=useState<UndoEntry[]>([]);
  const [error,setError]=useState<string|null>(null);
  const [savedAt,setSavedAt]=useState<string|null>(null);
  /** An added line to focus once it arrives (its qty field, as in the mockup). */
  const [focusLineId,setFocusLineId]=useState<string|null>(null);
  const chain=useRef<Promise<void>>(Promise.resolve());
  const ids=useRef(0);
  const quoteId=initial.quote.id;

  const lines=useMemo(()=>displayLines(server.lines,pending.map(p=>p.op),drafts),[server.lines,pending,drafts]);
  const linesRef=useRef(lines);
  linesRef.current=lines;
  const undoRef=useRef(undoStack);
  undoRef.current=undoStack;

  const run=useCallback(async(entry:Pending)=>{
    try{
      const result=await send(quoteId,entry.op);
      setServer(result.detail);
      const addedLine=entry.op.kind==='add'||(entry.op.kind==='upsell'&&!entry.op.bump);
      if(addedLine&&entry.undoId!==null&&result.line_id){
        const lineId=result.line_id;
        setUndoStack(stack=>stack.map(u=>u.id===entry.undoId?{...u,inverse:{kind:'remove',lineId}}:u));
        if(entry.op.kind==='add'&&!entry.op.restore)setFocusLineId(lineId);
      }
      setSavedAt(new Date().toISOString());
      setError(null);
    }catch(caught){
      setError(caught instanceof Error?caught.message:'That change wasn’t saved. Try again.');
      if(entry.undoId!==null)setUndoStack(stack=>stack.filter(u=>u.id!==entry.undoId));
      // The quote changed underneath (sent from another tab, a line removed): show it as it is now.
      if(caught instanceof EditError&&(caught.status===404||caught.status===409)){const fresh=await reload(quoteId);if(fresh)setServer(fresh);}
    }finally{
      setPending(queue=>queue.filter(p=>p.id!==entry.id));
    }
  },[quoteId]);

  /** Queues one edit (saved after the ones before it), with the undo entry that takes it back. */
  const enqueue=useCallback((op:EditOp,undo:Omit<UndoEntry,'id'>|null)=>{
    const id=++ids.current;
    let undoId:number|null=null;
    if(undo){
      const top=undoRef.current[0];
      if(undo.key&&top?.key===undo.key)undoId=top.id; // same field, same focus session: keep the first "before"
      else{
        undoId=++ids.current;
        const added={...undo,id:undoId};
        undoRef.current=[added,...undoRef.current];
        setUndoStack(stack=>[added,...stack]);
      }
    }
    const entry={id,op,undoId};
    setPending(queue=>[...queue,entry]);
    chain.current=chain.current.then(()=>run(entry));
  },[run]);

  /** What the rep is typing in a line (live totals and warning), before it is saved. null clears it. */
  const draft=useCallback((lineId:string,patch:LinePatch|null)=>{
    setDrafts(current=>{
      if(!patch){if(!(lineId in current))return current;const {[lineId]:_,...rest}=current;return rest;}
      return {...current,[lineId]:patch};
    });
  },[]);

  /** Saves an edit to a line. `session` groups edits to one field while it keeps focus (one Undo). */
  const edit=useCallback((lineId:string,patch:LinePatch,session?:string)=>{
    const before=linesRef.current.find(l=>l.id===lineId);
    draft(lineId,null);
    if(!before)return;
    // Measure the change against the line without the draft being typed.
    const base=displayLines(server.lines,pending.map(p=>p.op),{}).find(l=>l.id===lineId)??before;
    const after=applyPatch(base,patch);
    if(!after||(after.qty===base.qty&&after.unit_price===base.unit_price&&after.price_basis===base.price_basis))return;
    const field=patch.qty!==undefined?'qty':'price';
    enqueue({kind:'patch',lineId,patch},{label:patchLabel(base,patch),inverse:{kind:'patch',lineId,patch:inversePatch(base,after)},key:session&&`${lineId}:${field}:${session}`});
  },[draft,enqueue,server.lines,pending]);

  const remove=useCallback((lineId:string)=>{
    const line=linesRef.current.find(l=>l.id===lineId);
    if(!line)return;
    draft(lineId,null);
    const restore:NewLine['restore']={lineNo:line.line_no,unitPrice:line.unit_price,basis:line.price_basis,requestedText:line.requested_text,matchScore:line.match_score,addedBy:line.added_by};
    enqueue({kind:'remove',lineId},{label:`Removed ${shortName(line.description)}`,inverse:{kind:'add',itemId:line.item_id,qty:line.qty,restore,preview:line}});
  },[draft,enqueue]);

  const add=useCallback((item:{id:string;description:string},qty=1)=>{
    enqueue({kind:'add',itemId:item.id,qty},{label:`Added ${shortName(item.description)}`,inverse:null});
  },[enqueue]);

  /**
   * Takes one of Querent's suggestions (task 3.6): the server finds the chip again and adds its
   * line or bumps the line's qty. A bump shows at once; Undo puts the qty back, or removes the line.
   */
  const takeUpsell=useCallback((chip:{id:string;action:UpsellAction;item:{description:string}})=>{
    const {action}=chip;
    if(action.type==='add_line'){
      enqueue({kind:'upsell',upsellId:chip.id},{label:`Added ${shortName(chip.item.description)} from Suggested by Querent`,inverse:null});
      return;
    }
    const base=displayLines(server.lines,pending.map(p=>p.op),{}).find(l=>l.id===action.line_id);
    const after=base&&applyPatch(base,{qty:action.to_qty});
    if(!base||!after)return;
    draft(base.id,null);
    enqueue({kind:'upsell',upsellId:chip.id,bump:{lineId:base.id,qty:action.to_qty}},
      {label:`Changed qty on ${shortName(base.description)} to ${action.to_qty} (Suggested by Querent)`,inverse:{kind:'patch',lineId:base.id,patch:inversePatch(base,after)}});
  },[draft,enqueue,server.lines,pending]);

  /** Takes back the most recent edit. */
  const undo=useCallback(()=>{
    const [top,...rest]=undoRef.current;
    if(!top?.inverse)return;
    undoRef.current=rest;
    setUndoStack(rest);
    enqueue(top.inverse,null);
  },[enqueue]);

  /** Resolves once every queued edit is saved (Save draft). */
  const flush=useCallback(()=>chain.current,[]);

  /** Suggestions being taken, until their save comes back. */
  const takingUpsells=useMemo(()=>new Set(pending.flatMap(p=>p.op.kind==='upsell'?[p.op.upsellId]:[])),[pending]);

  return {detail:server,lines,pending:pending.length,adding:pending.some(p=>p.op.kind==='add'&&!p.op.restore),error,savedAt,undoStack,
    draft,edit,remove,add,undo,flush,focusLineId,clearFocus:()=>setFocusLineId(null),dismissError:()=>setError(null),takeUpsell,takingUpsells};
}

export type QuoteEditor=ReturnType<typeof useQuoteEditor>;
