'use client';
import type {QuoteTranscript} from '@/server/rep/quote-chat';
import type {TranscriptMessage} from '@/server/repository';

// The chat drawer's read (B1): GET /api/rep/quotes/<id>/messages, a page of 50, newest first, with
// `before` for the older ones. Like the panels' saves, a lost session goes back to the workspace chooser.

export type {QuoteTranscript,TranscriptMessage};

export class TranscriptError extends Error {}

export const TRANSCRIPT_ERROR='The chat didn’t load. Try again.';

/** One page of the quote's chat; rejects with a TranscriptError. */
export async function fetchTranscript(quoteId:string,before:string|null=null):Promise<QuoteTranscript>{
  const query=before?`?before=${encodeURIComponent(before)}`:'';
  let response:Response;
  try{response=await fetch(`/api/rep/quotes/${encodeURIComponent(quoteId)}/messages${query}`,{cache:'no-store'});}
  catch{throw new TranscriptError(TRANSCRIPT_ERROR);}
  if(response.status===401||response.status===403){window.location.assign('/');throw new TranscriptError('Choose a demo workspace.');}
  const json=await response.json().catch(()=>null);
  if(!response.ok||!json||!Array.isArray(json.messages))throw new TranscriptError(TRANSCRIPT_ERROR);
  return json as QuoteTranscript;
}
