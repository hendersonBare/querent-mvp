'use client';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {EditError} from '../use-quote-editor';

// The side panels' saves (task 3.4): PATCH .../fulfillment, PUT|DELETE .../freight,
// PATCH .../terms and POST .../notes on /api/rep/quotes/<id>. Each answers the fresh detail.
// Like the line edits, a lost session goes back to the workspace chooser.

export type PanelEndpoint='fulfillment'|'freight'|'terms'|'notes';
export type PanelMethod='PATCH'|'PUT'|'DELETE'|'POST';

/** Sends one panel edit; resolves to the fresh detail, or rejects with an EditError carrying the server's message. */
export async function savePanel(quoteId:string,endpoint:PanelEndpoint,method:PanelMethod,body?:unknown):Promise<QuoteDetail>{
  const response=await fetch(`/api/rep/quotes/${encodeURIComponent(quoteId)}/${endpoint}`,{method,cache:'no-store',
    ...(body===undefined?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(body)})});
  if(response.status===401||response.status===403){window.location.assign('/');throw new EditError('Choose a demo workspace.',response.status);}
  const json=await response.json().catch(()=>null);
  if(!response.ok)throw new EditError(json?.detail??'That change wasn’t saved. Try again.',response.status);
  return json as QuoteDetail;
}

/** The message to show for a failed save. */
export const saveError=(caught:unknown)=>caught instanceof Error?caught.message:'That change wasn’t saved. Try again.';
