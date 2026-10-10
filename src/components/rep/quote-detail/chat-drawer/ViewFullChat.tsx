'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {MessagesSquare} from 'lucide-react';
import {TRANSCRIPT_ERROR,fetchTranscript,type TranscriptMessage} from './api';
import {ChatDrawer,messageCount} from './ChatDrawer';
import s from './ChatDrawer.module.css';

// "View full chat" under the customer's request (B1; decision 26; spec §6, §9). The first page
// loads with the page, so the button can show "N messages"; opening the drawer reuses it, and
// "Load earlier" adds the older pages of 50 above it.

interface Transcript {total:number|null;messages:TranscriptMessage[];next:string|null;loading:boolean;error:string|null}

function useTranscript(quoteId:string){
  const [state,setState]=useState<Transcript>({total:null,messages:[],next:null,loading:true,error:null});
  const busy=useRef(false);
  const load=useCallback(async(before:string|null)=>{
    if(busy.current)return;
    busy.current=true;
    setState(current=>({...current,loading:true,error:null}));
    try{
      const page=await fetchTranscript(quoteId,before);
      // An older page goes above what is shown; the first page replaces it.
      setState(current=>({total:page.total,messages:before?[...page.messages,...current.messages]:page.messages,next:page.next_before,loading:false,error:null}));
    }catch(caught){
      setState(current=>({...current,loading:false,error:caught instanceof Error?caught.message:TRANSCRIPT_ERROR}));
    }finally{busy.current=false;}
  },[quoteId]);
  useEffect(()=>{void load(null);},[load]);
  return {...state,loadEarlier:useCallback(()=>load(state.next),[load,state.next]),retry:useCallback(()=>load(null),[load])};
}

export function ViewFullChat({quoteId,customer}:{quoteId:string;
  /** "Dana Ortiz": the contact, else the company. */
  customer:string}){
  const transcript=useTranscript(quoteId);
  const [open,setOpen]=useState(false);
  const close=useCallback(()=>setOpen(false),[]);
  // Focus goes back to the button on close, even where a click doesn't focus it (Safari).
  const button=useRef<HTMLButtonElement>(null),wasOpen=useRef(false);
  useEffect(()=>{
    if(wasOpen.current&&!open)button.current?.focus();
    wasOpen.current=open;
  },[open]);
  return <>
    <button ref={button} type="button" className={s.view} onClick={()=>setOpen(true)} aria-haspopup="dialog"
      aria-label={transcript.total===null?undefined:`View full chat, ${messageCount(transcript.total)}`}>
      <MessagesSquare aria-hidden="true" size={14} strokeWidth={2}/><span>View full chat</span>
      {transcript.total!==null&&<span className={s.count}>{messageCount(transcript.total)}</span>}
    </button>
    {open&&<ChatDrawer customer={customer} total={transcript.total} messages={transcript.messages} hasEarlier={transcript.next!==null}
      loading={transcript.loading} error={transcript.error} onLoadEarlier={transcript.loadEarlier} onRetry={transcript.retry} onClose={close}/>}
  </>;
}
