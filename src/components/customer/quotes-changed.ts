// "Quotes changed": the chat's Request quote (task 2.3) and a quote response (Accept, Request changes,
// Decline) ask the notification bell (plan U10) to reload now instead of at its next poll.

export const QUOTES_CHANGED_EVENT='querent:quotes-changed';

export function emitQuotesChanged(){
  window.dispatchEvent(new Event(QUOTES_CHANGED_EVENT));
}

/** Calls `handler` whenever the customer's quotes changed. Returns the unsubscribe function. */
export function onQuotesChanged(handler:()=>void){
  window.addEventListener(QUOTES_CHANGED_EVENT,handler);
  return ()=>window.removeEventListener(QUOTES_CHANGED_EVENT,handler);
}
