import type {ItemCandidate} from '@/domain';

// The chat messages the clarifying reply's buttons send (task 2.2). They are ordinary customer
// messages, so they show in the chat as Dana's words; the server settles them before any language
// handling (src/server/chat/clarify.ts, readAction), and a typed SKU or "drop the wheels" works too.

/** A candidate button: picks that SKU for its line. */
export const pickMessage=(candidate:Pick<ItemCandidate,'sku'|'description'>)=>`${candidate.sku} (${candidate.description})`;
/** Drop this line: the customer can't settle the line and leaves it out of the quote. */
export const dropMessage=(line:{requested_text:string})=>`Drop “${line.requested_text}”`;
