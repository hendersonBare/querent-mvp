// A one-time note for a quote page that isn't on screen yet (task 3.5): Duplicate opens the copy's
// page and Reset sample quote reloads the page, and each then says what happened ("Duplicated
// Q-24817 as Q-24830", "Sample quote reset"). The note waits in sessionStorage, which survives
// the navigation and the reload in this tab. Storage can be blocked (a private window, a
// sandboxed preview): then there is simply no note.

const KEY='querent.rep.quote-note';
/** A note older than this is dropped: it belongs to a page change that never happened. */
const MAX_AGE_MS=60_000;

interface Flash {quoteId:string;message:string;at:number}

/** Leaves `message` for the page of quote `quoteId`. */
export function setQuoteFlash(quoteId:string,message:string){
  try{sessionStorage.setItem(KEY,JSON.stringify({quoteId,message,at:Date.now()} satisfies Flash));}catch{/* No storage: no note. */}
}

/** The note left for quote `quoteId`, once (it is removed), or null. A stale or malformed note is dropped. */
export function takeQuoteFlash(quoteId:string):string|null{
  try{
    const raw=sessionStorage.getItem(KEY);
    if(!raw)return null;
    const flash=JSON.parse(raw) as Partial<Flash>|null;
    if(typeof flash?.at!=='number'||typeof flash.message!=='string'||Date.now()-flash.at>MAX_AGE_MS){sessionStorage.removeItem(KEY);return null;}
    if(flash.quoteId!==quoteId)return null;
    sessionStorage.removeItem(KEY);
    return flash.message;
  }catch{return null;}
}
