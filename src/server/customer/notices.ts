import 'server-only';
import type {ChatNotice,QuoteNotice,RepReplyNotice} from '@/domain';
import {effectiveStatus} from '@/server/quotes';
import {customerQuotes,quoteNotices,repReplyNotices} from '@/server/repository/customer';

// The "quote is ready" messages in the customer's chat (spec §3, task 5.1). Customer-facing, so it
// reads only the customer-safe repository module. Approve & send posts each one in the quote's own
// conversation (task 3.7), but the chat shows one conversation at a time and a new browser starts a
// new one, so a message could land where the customer never looks (the seeded Q-24817 was asked
// for in a conversation Dana's browser doesn't open). So the chat also shows the messages from her
// other conversations whose quote still waits for her answer.
//
// A rep's reply to a change request (decision 63) is posted the same way, so it shows by the same
// rule: in its own conversation, and in any other while the quote still waits for the rep (changes
// requested).

/**
 * What the chat on screen shows, oldest first: every quote_ready and rep_reply message in `conversationId`, plus
 * those in the customer's other conversations whose quote awaits a response: sent (not yet expired
 * at `now`) and still at the revision the message announced, and the replies whose quote still has its change request open. `conversationId` may not exist yet
 * (New conversation before its first message) or be another customer's: then only the latter show.
 */
export function chatNotices(customerId:string,conversationId:string,now=new Date().toISOString()):ChatNotice[]{
  const quotes=new Map(customerQuotes(customerId).map(q=>[q.id,q]));
  const awaitsAnswer=(n:QuoteNotice)=>{
    const q=quotes.get(n.quote_id);
    return !!q&&effectiveStatus(q,now)==='sent'&&q.revision===n.revision;
  };
  const awaitsRep=(n:RepReplyNotice)=>quotes.get(n.quote_id)?.status==='changes_requested';
  const sent=quoteNotices(customerId).filter(n=>n.conversation_id===conversationId||awaitsAnswer(n));
  const replies=repReplyNotices(customerId).filter(n=>n.conversation_id===conversationId||awaitsRep(n));
  if(!replies.length)return sent;
  return [...sent,...replies].sort((a,b)=>a.created_at<b.created_at?-1:a.created_at>b.created_at?1:0);
}
