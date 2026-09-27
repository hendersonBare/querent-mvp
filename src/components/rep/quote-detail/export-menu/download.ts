// The Export menu's downloads (task 4.3): fetch the file, then save it under the server's name.
// Fetching first (rather than pointing a link at the URL) means a refusal (the quote was sent
// from another tab, the session ended) shows as a message on the page instead of downloading
// the error, and the menu can say when the file is saved.

/** The server refused the export; `message` is its `detail`, ready to show. */
export class ExportRefused extends Error{
  constructor(message:string,readonly status:number){super(message);this.name='ExportRefused';}
}

/**
 * The filename in a Content-Disposition header: the RFC 5987 `filename*=UTF-8''…` form first,
 * else the quoted or bare `filename=`. null without one.
 */
export function filenameFrom(header:string|null):string|null{
  if(!header)return null;
  const extended=/filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header);
  if(extended){try{return decodeURIComponent(extended[1].trim());}catch{/* Malformed: use the plain name. */}}
  const plain=/filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;]+))/i.exec(header);
  const name=plain?(plain[1]??plain[2]).replace(/\\(.)/g,'$1').trim():'';
  return name||null;
}

/** Hands `blob` to the browser as a download named `filename`. */
export function saveBlob(blob:Blob,filename:string){
  const href=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=href;
  link.download=filename;
  link.rel='noopener';
  link.hidden=true;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser time to start reading the file before the URL goes away.
  setTimeout(()=>URL.revokeObjectURL(href),60_000);
}

/**
 * Downloads `url` and resolves the saved file's name (the server's, else `fallbackName`).
 * Rejects with ExportRefused when the server says no; without a session it returns to the
 * workspace chooser, like the rest of the portal.
 */
export async function downloadExport(url:string,fallbackName:string):Promise<string>{
  const response=await fetch(url,{cache:'no-store'});
  if(response.status===401||response.status===403){
    window.location.assign('/');
    throw new ExportRefused('Choose a demo workspace.',response.status);
  }
  if(!response.ok){
    const body=await response.json().catch(()=>null);
    throw new ExportRefused(typeof body?.detail==='string'?body.detail:'That export didn’t work. Reload the page and try again.',response.status);
  }
  const blob=await response.blob();
  const filename=filenameFrom(response.headers.get('content-disposition'))??fallbackName;
  saveBlob(blob,filename);
  return filename;
}
