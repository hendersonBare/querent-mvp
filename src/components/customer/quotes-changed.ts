// "Quotes changed": the chat's Request quote (task 2.3) asks the right sidebar to reload its quote
// buttons now instead of at its next poll, so the new quote shows at once as Awaiting rep.

export const QUOTES_CHANGED_EVENT='querent:quotes-changed';

export function emitQuotesChanged(){
  window.dispatchEvent(new Event(QUOTES_CHANGED_EVENT));
}

/** Calls `handler` whenever the customer's quotes changed. Returns the unsubscribe function. */
export function onQuotesChanged(handler:()=>void){
  window.addEventListener(QUOTES_CHANGED_EVENT,handler);
  return ()=>window.removeEventListener(QUOTES_CHANGED_EVENT,handler);
}
