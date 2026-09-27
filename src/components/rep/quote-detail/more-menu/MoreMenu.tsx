'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {useRepScope} from '../../context';
import {ActionMenu,type MenuItem} from '../ActionMenu';
import {setQuoteFlash,takeQuoteFlash} from './flash';
import {QuoteToast,type ToastMessage} from './QuoteToast';
import {reloadPage} from './reload';

// The quote detail's ⋯ menu (spec §4, docs/design/screens/06; task 3.5), in the mockup's order
// without "Reassign to another rep" (quotes are never reassigned):
//   Duplicate quote       a new ready_for_review copy (POST /api/rep/quotes/<id>/duplicate),
//                         then the copy's page opens, keeping the "Viewing" picker (?customer=);
//   Open customer in ERP  disabled until the ERP integration, with that as its tooltip;
//   Reset sample quote    on the sample quote only (POST /api/rep/quotes/<id>/reset), then the
//                         page reloads so every panel shows the seed state again.
// Both actions first wait for the page's queued edits to save, so a copy has the latest draft
// and no edit lands on the sample after its reset. One action runs at a time, and Duplicate
// sends an Idempotency-Key that a retry reuses, so a double click never makes two copies.

export const ERP_TOOLTIP='Available after ERP integration';

export interface MoreMenuProps {
  quote:{id:string;quote_number:string;is_sample:boolean};
  /** Resolves once the page's queued edits are saved (the quote editor's flush). */
  flush:()=>Promise<void>;
  buttonClassName?:string;
}

/** The server answered with a refusal (its `detail`), as opposed to no answer at all. */
class Refused extends Error{}

async function post(url:string,headers?:Record<string,string>){
  const response=await fetch(url,{method:'POST',headers,cache:'no-store'});
  if(response.status===401||response.status===403){window.location.assign('/');throw new Refused('Choose a demo workspace.');}
  const body=await response.json().catch(()=>null);
  if(!response.ok)throw new Refused(typeof body?.detail==='string'?body.detail:'That didn’t work. Reload the page and try again.');
  return body;
}

const newKey=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID():`k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
const quotePath=(id:string)=>`/api/rep/quotes/${encodeURIComponent(id)}`;

export function MoreMenu({quote,flush,buttonClassName}:MoreMenuProps){
  const router=useRouter();
  const scope=useRepScope();
  const [busy,setBusy]=useState<'duplicate'|'reset'|null>(null);
  const [toast,setToast]=useState<ToastMessage|null>(null);
  /** Set synchronously, so a second choice in the same instant can't start a second request. */
  const running=useRef(false);
  /** The key of a Duplicate that got no answer: trying again reuses it, so the server can't make a second copy. */
  const unanswered=useRef<string|null>(null);
  const dismiss=useCallback(()=>setToast(null),[]);

  // A note left by the action that opened this page: "Duplicated Q-24817 as Q-24830", "Sample quote reset".
  useEffect(()=>{
    const note=takeQuoteFlash(quote.id);
    if(note)setToast({text:note,tone:'done'});
  },[quote.id]);

  /** Runs one action at a time; `work` ends by leaving the page, so success keeps the menu busy. */
  async function run(kind:'duplicate'|'reset',progress:string,work:()=>Promise<void>,failed:string){
    if(running.current)return;
    running.current=true;
    setBusy(kind);
    setToast({text:progress,tone:'progress'});
    try{
      await flush();
      await work();
    }catch(error){
      running.current=false;
      setBusy(null);
      setToast({text:error instanceof Refused?error.message:failed,tone:'error'});
    }
  }

  const duplicate=()=>run('duplicate',`Duplicating ${quote.quote_number}…`,async()=>{
    const key=unanswered.current??=newKey();
    let copy:{id:string;quote_number:string};
    try{copy=await post(`${quotePath(quote.id)}/duplicate`,{'idempotency-key':key});}
    catch(error){if(error instanceof Refused)unanswered.current=null;throw error;}
    unanswered.current=null;
    setQuoteFlash(copy.id,`Duplicated ${quote.quote_number} as ${copy.quote_number}`);
    router.push(scope.href(`/rep/quotes/${encodeURIComponent(copy.quote_number)}`));
  },`${quote.quote_number} wasn’t duplicated. Check your connection and try again.`);

  const reset=()=>run('reset','Resetting the sample quote…',async()=>{
    await post(`${quotePath(quote.id)}/reset`);
    setQuoteFlash(quote.id,'Sample quote reset');
    reloadPage();
  },'The sample quote wasn’t reset. Check your connection and try again.');

  const items:MenuItem[]=[
    {label:busy==='duplicate'?'Duplicating…':'Duplicate quote',disabled:busy!==null,onSelect:()=>void duplicate()},
    {label:'Open customer in ERP',disabled:true,tooltip:ERP_TOOLTIP,onSelect:()=>{}},
    ...(quote.is_sample?[{label:busy==='reset'?'Resetting…':'Reset sample quote',disabled:busy!==null,separator:true,onSelect:()=>void reset()}]:[]),
  ];

  return <>
    <ActionMenu buttonClassName={buttonClassName} label="More actions" menuLabel="More actions" items={items} emptyNote="">⋯</ActionMenu>
    <QuoteToast message={toast} onDismiss={dismiss}/>
  </>;
}
