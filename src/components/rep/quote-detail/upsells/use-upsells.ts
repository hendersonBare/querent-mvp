'use client';
import {useEffect,useState} from 'react';
import type {RepUpsell,RepUpsells} from '@/server/rep/quote-upsells';
import type {UpsellsStatus} from './upsell-view';

// The chips for "Suggested by Querent" (task 3.6): GET /api/rep/quotes/<id>/upsells when the page
// opens and again after every save (`version` is the server's copy of the quote), so a chip taken,
// a qty changed or an Undo shows the rules' answer for the quote as it is now. Claude may be
// wording them in live mode, so the list loads after the page; a failed refresh keeps the list.

/** Saves often come in bursts (typing, several chips): ask once they settle. */
export const REFRESH_DELAY_MS=120;

export interface UpsellsState {status:UpsellsStatus;upsells:RepUpsell[]}

const OFF:UpsellsState={status:'ready',upsells:[]};

export function useUpsells(quoteId:string,editable:boolean,version:unknown):UpsellsState{
  const [state,setState]=useState<UpsellsState>({status:'loading',upsells:[]});
  useEffect(()=>{
    if(!editable)return;
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      try{
        const response=await fetch(`/api/rep/quotes/${encodeURIComponent(quoteId)}/upsells`,{cache:'no-store',signal:controller.signal});
        if(!response.ok)throw new Error(`Suggestions answered ${response.status}.`);
        const body=await response.json() as RepUpsells;
        if(!controller.signal.aborted)setState({status:'ready',upsells:body.editable?body.upsells:[]});
      }catch{
        if(!controller.signal.aborted)setState(current=>({status:current.upsells.length?'ready':'error',upsells:current.upsells}));
      }
    },REFRESH_DELAY_MS);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[quoteId,editable,version]);
  return editable?state:OFF;
}
