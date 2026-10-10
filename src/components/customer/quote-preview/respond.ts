'use client';
import type {CustomerQuotePreview,DeclineReason} from '@/domain';

// Accept and Request changes' requests (task 5.2), and Decline's (A1): POST
// /api/query/customer/quotes/<id>/accept, /request-changes or /decline with the revision on screen, plus an Idempotency-Key so a retry of the same
// click can't answer twice (as Approve & send does, task 3.7). A lost session goes back to the
// workspace chooser.

export type ResponseAction='accept'|'request-changes'|'decline';
export interface AcceptBody {revision:number;day:string;time:string;po:string}
export interface ChangesBody {revision:number;note:string}
/** No reason is a decline too (decision 14); the note goes only with reason 'other'. */
export interface DeclineBody {revision:number;reason:DeclineReason|null;note?:string}
export interface ResponseAnswer {quote:CustomerQuotePreview;replayed:boolean}

/** The server answered with a refusal: 400 (the form's input), 404, or 409 (expired, already answered, a newer revision). */
export class ResponseRefused extends Error{
  constructor(message:string,readonly status:number,readonly code:string|null){
    super(message);
    this.name='ResponseRefused';
  }
}

/** Sends the answer. Rejects with ResponseRefused when the server says no, or a TypeError when there is no answer at all. */
export async function postResponse(quoteId:string,action:'accept',body:AcceptBody,idempotencyKey:string):Promise<ResponseAnswer>;
export async function postResponse(quoteId:string,action:'request-changes',body:ChangesBody,idempotencyKey:string):Promise<ResponseAnswer>;
export async function postResponse(quoteId:string,action:'decline',body:DeclineBody,idempotencyKey:string):Promise<ResponseAnswer>;
export async function postResponse(quoteId:string,action:ResponseAction,body:AcceptBody|ChangesBody|DeclineBody,idempotencyKey:string):Promise<ResponseAnswer>{
  const response=await fetch(`/api/query/customer/quotes/${encodeURIComponent(quoteId)}/${action}`,{method:'POST',cache:'no-store',
    headers:{'content-type':'application/json','idempotency-key':idempotencyKey},body:JSON.stringify(body)});
  if(response.status===401){window.location.assign('/');throw new ResponseRefused('Choose a demo workspace.',401,null);}
  const json=await response.json().catch(()=>null);
  if(!response.ok)throw new ResponseRefused(typeof json?.detail==='string'?json.detail:'That didn’t go through. Try again.',response.status,typeof json?.code==='string'?json.code:null);
  return json as ResponseAnswer;
}

/** A fresh Idempotency-Key. */
export const newResponseKey=()=>typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'?crypto.randomUUID()
  :`answer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`;
