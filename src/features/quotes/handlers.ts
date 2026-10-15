import 'server-only';
import type {NextRequest} from 'next/server';
import type {ApiSession} from '@/features/auth/server';
import {deleteQuote,getQuote,listQuotes,logActivity,updateQuote,type WriteFailure} from '@/server/repository';
import {QUOTE_COPY} from './copy';
import {applyPatch,isUuid,parsePatch} from './patch';

// The quotes API (docs/boxt/plan.md "API", B6). The route files wrap these in withApiUser, which answers
// 401 without a session and 403 for a cross-origin write before they run; every call goes through the
// repository with the user's RLS-scoped client.
//
//   GET    /api/quotes        {quotes:QuoteSummary[]} newest first
//   GET    /api/quotes/[id]   {quote:Quote}
//   PATCH  /api/quotes/[id]   body: ./patch.ts; {quote:Quote} as saved
//   DELETE /api/quotes/[id]   {ok:true}
//
// Unknown and non-uuid ids answer 404 (a non-uuid one never reaches the database); the example quote
// 409. Errors are fixed sentences: nothing from the database and nothing the customer wrote. The
// activity log gets counts only (ACTIVITY below). Nothing here logs to the console.

export type IdContext={params:Promise<{id:string}>};

/** The activity rows' metadata: these fixed keys, numbers only (docs/boxt/plan.md "Database", rule 8). */
export const ACTIVITY={
  update:(lines:number,removed:number)=>({lines,removed}),
  delete:(lines:number)=>({lines}),
} as const;

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const error=(message:string,status:number)=>json({error:message},status);
const notFound=()=>error(QUOTE_COPY.notFound,404);

/** A refused write as an HTTP answer. */
function writeError(failure:WriteFailure,example:string,fallback:string):Response{
  switch(failure.error){
    case 'invalid':return error(QUOTE_COPY.invalidBody,400);
    case 'not_found':return notFound();
    case 'example':return error(example,409);
    case 'unauthorized':return error(QUOTE_COPY.notAllowed,403);
    default:return error(fallback,500);
  }
}

/** Runs a handler and turns an unexpected failure (a read that threw) into a plain 500. */
async function guarded(run:()=>Promise<Response>,fallback:string):Promise<Response>{
  try{
    return await run();
  }catch{
    return error(fallback,500);
  }
}

export async function listQuotesHandler(_request:NextRequest,{db}:ApiSession):Promise<Response>{
  return guarded(async()=>json({quotes:await listQuotes(db)}),QUOTE_COPY.loadFailed);
}

export async function getQuoteHandler(_request:NextRequest,{db}:ApiSession,{params}:IdContext):Promise<Response>{
  const {id}=await params;
  if(!isUuid(id))return notFound();
  return guarded(async()=>{
    const quote=await getQuote(db,id);
    return quote?json({quote}):notFound();
  },QUOTE_COPY.loadFailed);
}

export async function patchQuoteHandler(request:NextRequest,{db}:ApiSession,{params}:IdContext):Promise<Response>{
  const {id}=await params;
  if(!isUuid(id))return notFound();
  let body:unknown;
  try{body=await request.json();}catch{return error(QUOTE_COPY.invalidBody,400);}
  const parsed=parsePatch(body);
  if(!parsed.ok)return error(parsed.error,400);
  return guarded(async()=>{
    const quote=await getQuote(db,id);
    if(!quote)return notFound();
    if(quote.isExample)return error(QUOTE_COPY.exampleEdit,409);
    const change=applyPatch(quote,parsed.patch);
    if(!change.ok)return error(change.error,400);
    const result=await updateQuote(db,id,change.update);
    if(!result.ok)return writeError(result,QUOTE_COPY.exampleEdit,QUOTE_COPY.saveFailed);
    await logActivity(db,'quote_update',ACTIVITY.update(change.kept,change.removed));
    const saved=await getQuote(db,id);
    return saved?json({quote:saved}):notFound();
  },QUOTE_COPY.saveFailed);
}

export async function deleteQuoteHandler(_request:NextRequest,{db}:ApiSession,{params}:IdContext):Promise<Response>{
  const {id}=await params;
  if(!isUuid(id))return notFound();
  return guarded(async()=>{
    const quote=await getQuote(db,id);
    if(!quote)return notFound();
    if(quote.isExample)return error(QUOTE_COPY.exampleDelete,409);
    const result=await deleteQuote(db,id);
    if(!result.ok)return writeError(result,QUOTE_COPY.exampleDelete,QUOTE_COPY.deleteFailed);
    await logActivity(db,'quote_delete',ACTIVITY.delete(quote.lineCount));
    return json({ok:true});
  },QUOTE_COPY.deleteFailed);
}
