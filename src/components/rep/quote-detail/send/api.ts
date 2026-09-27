'use client';
import type {SendBlocker} from '@/server/quotes';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import type {SendBody,SentQuote} from '@/server/rep/quote-send';
import {EditError} from '../use-quote-editor';

// Approve & send's request (task 3.7): POST /api/rep/quotes/<id>/send with the message, Attach
// PDF, and the revision and total Confirm send showed, plus an Idempotency-Key so a retry of the
// same click can't send twice. Like every rep save, a lost session goes back to the workspace
// chooser.

/** The server answered with a refusal. `status` 404/409 makes the editor reload the quote. */
export class SendRefused extends EditError{
  constructor(message:string,status:number,readonly code:string|null,readonly blockers:readonly SendBlocker[]){
    super(message,status);
    this.name='SendRefused';
  }
}

export interface SendAnswer {detail:QuoteDetail;sent:SentQuote['sent'];replayed:boolean}

/** Sends the quote. Rejects with SendRefused when the server says no, or a TypeError when there is no answer at all. */
export async function postSend(quoteId:string,body:Required<SendBody>,idempotencyKey:string):Promise<SendAnswer>{
  const response=await fetch(`/api/rep/quotes/${encodeURIComponent(quoteId)}/send`,{method:'POST',cache:'no-store',
    headers:{'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify(body)});
  if(response.status===401||response.status===403){window.location.assign('/');throw new SendRefused('Choose a demo workspace.',response.status,null,[]);}
  const json=await response.json().catch(()=>null);
  if(!response.ok)throw new SendRefused(typeof json?.detail==='string'?json.detail:'The quote wasn’t sent. Try again.',response.status,
    typeof json?.code==='string'?json.code:null,Array.isArray(json?.blockers)?json.blockers:[]);
  return json as SendAnswer;
}

/** A fresh Idempotency-Key. */
export const newSendKey=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID()
  :`send-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
