'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {ChatIcon} from '../icons';
import {TRANSCRIPT_ERROR,fetchTranscript,type TranscriptMessage} from './api';
import {ChatDrawer,messageCount} from './ChatDrawer';

// The Chat icon button under the total box (plan U4; C_QEBase, C_QE6; B1, decision 26). The first page
// of the chat loads with the page, so the button's name can say "Customer chat, 5 messages"; opening the
// drawer reuses it, and "Load earlier" adds the older pages of 50 above it. A quote that didn't come
// from chat has no chat: its button is greyed out ("States not drawn": disabled).

interface Transcript {total:number|null;messages:TranscriptMessage[];next:string|null;loading:boolean;error:string|null}

function useTranscript(quoteId:string,enabled:boolean){
  const [state,setState]=useState<Transcript>({total:null,messages:[],next:null,loading:enabled,error:null});
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
  useEffect(()=>{if(enabled)void load(null);},[load,enabled]);
  return {...state,loadEarlier:useCallback(()=>load(state.next),[load,state.next]),retry:useCallback(()=>load(null),[load])};
}

export function ChatButton({quoteId,customer,hasChat,className}:{quoteId:string;
  /** "Dana Ortiz": the contact, else the company. */
  customer:string;
  /** The quote came from Querent chat (it has a conversation). */
  hasChat:boolean;
  className?:string}){
  const transcript=useTranscript(quoteId,hasChat);
  const [open,setOpen]=useState(false);
  const close=useCallback(()=>setOpen(false),[]);
  // Focus goes back to the button on close, even where a click doesn't focus it (Safari).
  const button=useRef<HTMLButtonElement>(null),wasOpen=useRef(false);
  useEffect(()=>{
    if(wasOpen.current&&!open)button.current?.focus();
    wasOpen.current=open;
  },[open]);
  return <>
    <button ref={button} type="button" className={className} onClick={()=>setOpen(true)} aria-haspopup="dialog" disabled={!hasChat}
      aria-label={transcript.total===null?'Customer chat':`Customer chat, ${messageCount(transcript.total)}`}><ChatIcon/></button>
    {open&&<ChatDrawer customer={customer} total={transcript.total} messages={transcript.messages} hasEarlier={transcript.next!==null}
      loading={transcript.loading} error={transcript.error} onLoadEarlier={transcript.loadEarlier} onRetry={transcript.retry} onClose={close}/>}
  </>;
}
