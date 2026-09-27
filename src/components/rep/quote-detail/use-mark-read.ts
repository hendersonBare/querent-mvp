'use client';
import {useEffect,useRef} from 'react';
import {useRepPortal} from '../context';

/**
 * Marks the quote read for the rep once its page is on screen (a link prefetch never runs this),
 * then re-reads the nav badge instead of waiting for its poll (tasks 3.1, 3.2: opening a quote
 * calls markQuoteRead(id,'rep') through POST /api/rep/quotes/<id>/read).
 */
export function useMarkQuoteRead(quoteId:string){
  const {refreshBadges}=useRepPortal();
  const refresh=useRef(refreshBadges);
  useEffect(()=>{refresh.current=refreshBadges;},[refreshBadges]);
  useEffect(()=>{
    void fetch(`/api/rep/quotes/${encodeURIComponent(quoteId)}/read`,{method:'POST',cache:'no-store'}).then(response=>{
      if(response.status===401||response.status===403)window.location.assign('/');
      else if(response.ok)refresh.current();
    },()=>{/* Offline: the dot stays until the next visit. */});
  },[quoteId]);
}
