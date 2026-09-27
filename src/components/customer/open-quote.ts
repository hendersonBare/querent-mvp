// "Open quote" (spec §3): a quote button in the right sidebar, and later the chat's "View quote"
// link, ask for the PDF preview modal with this window event. The modal is task 5.1: it
// subscribes with onOpenQuote. Until it lands nothing listens, so this is the stub.

export const OPEN_QUOTE_EVENT='querent:open-quote';

export interface OpenQuoteDetail {id:string;quote_number:string}

export function emitOpenQuote(detail:OpenQuoteDetail){
  window.dispatchEvent(new CustomEvent<OpenQuoteDetail>(OPEN_QUOTE_EVENT,{detail}));
}

/** Calls `handler` for every open-quote request. Returns the unsubscribe function. */
export function onOpenQuote(handler:(detail:OpenQuoteDetail)=>void){
  const listener=(event:Event)=>handler((event as CustomEvent<OpenQuoteDetail>).detail);
  window.addEventListener(OPEN_QUOTE_EVENT,listener);
  return ()=>window.removeEventListener(OPEN_QUOTE_EVENT,listener);
}
