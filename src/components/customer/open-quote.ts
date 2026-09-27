// "Open quote" (spec §3): a quote button in the right sidebar and the chat's "View quote" ask for
// the PDF preview modal (task 5.1) with this window event; the modal subscribes with onOpenQuote.

export const OPEN_QUOTE_EVENT='querent:open-quote';

export interface OpenQuoteDetail {
  id:string;quote_number:string;
  /**
   * The sent revision to show: a chat message names the one it announced. Omitted (the sidebar),
   * the modal shows the latest one sent.
   */
  revision?:number;
}

export function emitOpenQuote(detail:OpenQuoteDetail){
  window.dispatchEvent(new CustomEvent<OpenQuoteDetail>(OPEN_QUOTE_EVENT,{detail}));
}

/** Calls `handler` for every open-quote request. Returns the unsubscribe function. */
export function onOpenQuote(handler:(detail:OpenQuoteDetail)=>void){
  const listener=(event:Event)=>handler((event as CustomEvent<OpenQuoteDetail>).detail);
  window.addEventListener(OPEN_QUOTE_EVENT,listener);
  return ()=>window.removeEventListener(OPEN_QUOTE_EVENT,listener);
}
