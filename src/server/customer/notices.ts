import 'server-only';
import type {QuoteNotice} from '@/domain';
import {effectiveStatus} from '@/server/quotes';
import {customerQuotes,quoteNotices} from '@/server/repository/customer';

// The "quote is ready" messages in the customer's chat (spec §3, task 5.1). Customer-facing, so it
// reads only the customer-safe repository module. Approve & send posts each one in the quote's own
// conversation (task 3.7), but the chat shows one conversation at a time and a new browser starts a
// new one, so a message could land where the customer never looks (the seeded Q-24817 was asked
// for in a conversation Dana's browser doesn't open). So the chat also shows the messages from her
// other conversations whose quote still waits for her answer.

/**
 * What the chat on screen shows, oldest first: every quote_ready message in `conversationId`, plus
 * those in the customer's other conversations whose quote awaits a response: sent (not yet expired
 * at `now`) and still at the revision the message announced. `conversationId` may not exist yet
 * (New conversation before its first message) or be another customer's: then only the latter show.
 */
export function chatNotices(customerId:string,conversationId:string,now=new Date().toISOString()):QuoteNotice[]{
  const quotes=new Map(customerQuotes(customerId).map(q=>[q.id,q]));
  const awaitsAnswer=(n:QuoteNotice)=>{
    const q=quotes.get(n.quote_id);
    return !!q&&effectiveStatus(q,now)==='sent'&&q.revision===n.revision;
  };
  return quoteNotices(customerId).filter(n=>n.conversation_id===conversationId||awaitsAnswer(n));
}
