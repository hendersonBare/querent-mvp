import {CSV_CONTENT_TYPE} from './csv';

// Responses for the rep's file exports (task 4.3).

/** Printable ASCII without quotes or backslashes, for the plain `filename` parameter. */
const asciiName=(name:string)=>name.replace(/[^\x20-\x7e]/g,'').replace(/["\\]/g,'');

/** `attachment; filename="…"; filename*=UTF-8''…` (RFC 6266): the ASCII name for old clients, the exact name for the rest. */
export const attachment=(filename:string)=>`attachment; filename="${asciiName(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}`;

/**
 * A CSV download. Never cached: a draft changes as the rep edits, and the answer depends on who
 * asks. nosniff keeps a browser from ever rendering it as anything but a file.
 */
export function csvFileResponse(text:string,filename:string){
  return new Response(text,{status:200,headers:{
    'content-type':CSV_CONTENT_TYPE,
    'content-disposition':attachment(filename),
    'cache-control':'private, no-store',
    'x-content-type-options':'nosniff',
  }});
}
