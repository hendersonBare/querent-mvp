import 'server-only';
import {TRANSCRIPT_PAGE,conversationMessageCount,conversationMessagePage,type TranscriptMessage} from '@/server/repository';
import {repQuote} from './quotes';

// The quote's whole chat for the rep's "View full chat" drawer (B1; decision 26; spec §5, §9):
// read through quotes.conversation_id, newest page first, 50 at a time, with the total for "N
// messages". Only the quote's own rep: another rep's quote reads as not found, like every quote route.
// Managers read any quote's chat once D2 adds the manager scope (spec §8); until then only the owner.

export interface QuoteTranscript {total:number;messages:TranscriptMessage[];next_before:string|null}

/** A page of the quote's chat; undefined when it isn't one of the rep's quotes. No conversation: total 0. */
export function repQuoteMessages(repId:string,quoteIdOrNumber:string,{before=null,limit=TRANSCRIPT_PAGE}:{before?:string|null;limit?:number}={}):QuoteTranscript|undefined{
  const q=repQuote(repId,quoteIdOrNumber);
  if(!q)return undefined;
  if(!q.conversation_id)return {total:0,messages:[],next_before:null};
  return {total:conversationMessageCount(q.conversation_id),...conversationMessagePage(q.conversation_id,{before,limit})};
}
