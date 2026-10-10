import 'server-only';
import {TRANSCRIPT_PAGE,conversationMessageCount,conversationMessagePage,type TranscriptMessage} from '@/server/repository';
import {readableQuote} from './quotes';

// The quote's whole chat for the rep's "View full chat" drawer (B1; decision 26; spec §5, §9):
// read through quotes.conversation_id, newest page first, 50 at a time, with the total for "N
// messages". Only the quote's own rep and the manager (decision 26; task D2: any quote, read-only):
// for another rep the quote reads as not found, like every quote route.

export interface QuoteTranscript {total:number;messages:TranscriptMessage[];next_before:string|null}

/** A page of the quote's chat; undefined when the rep may not read the quote (readableQuote). No conversation: total 0. */
export function repQuoteMessages(repId:string,quoteIdOrNumber:string,{before=null,limit=TRANSCRIPT_PAGE,manager=false}:{before?:string|null;limit?:number;manager?:boolean}={}):QuoteTranscript|undefined{
  const q=readableQuote(repId,quoteIdOrNumber,{manager})?.quote;
  if(!q)return undefined;
  if(!q.conversation_id)return {total:0,messages:[],next_before:null};
  return {total:conversationMessageCount(q.conversation_id),...conversationMessagePage(q.conversation_id,{before,limit})};
}
