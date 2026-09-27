import 'server-only';
import {NextResponse,type NextRequest} from 'next/server';
import {QuoteActionError} from '@/server/quotes';
import {principal} from '@/server/session';

// The rep portal's API routes (/api/rep/*) serve the supplier persona only: they carry margin,
// cost and other reps' data. Same answers as GET /api/rep/badges: 401 without a session (the
// portal then returns to the workspace chooser), 403 for a customer. Never cached.

export const NO_STORE={'Cache-Control':'no-store'} as const;

/** A JSON response that is never cached. */
export const repJson=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:NO_STORE});

/** The request's JSON body, or undefined when it has none or it isn't JSON (the validator then refuses it). */
export async function jsonBody(request:Request):Promise<unknown>{
  try{return await request.json();}catch{return undefined;}
}

/**
 * The response for a refused quote action (QuoteActionError): its HTTP status, with the message
 * as `detail` and its `code`, plus the `blockers` of a refused send (send_blocked, task 3.7).
 * Anything else is rethrown (a 500).
 */
export function repError(error:unknown){
  if(error instanceof QuoteActionError)return repJson({detail:error.message,code:error.code,...(error.blockers.length?{blockers:error.blockers}:{})},error.httpStatus);
  throw error;
}

/**
 * A route handler for the signed-in rep. `handle` gets the rep's id from the session, never
 * from the request, and runs only for a rep.
 */
export function repRoute<Context=unknown>(handle:(repId:string,request:NextRequest,context:Context)=>Response|Promise<Response>){
  // Next always passes the route context; it's optional here so a route without params can be called with the request alone.
  return async function handler(request:NextRequest,context?:Context){
    const user=principal(request);
    if(!user)return repJson({detail:'Choose a demo workspace.'},401);
    if(user.role!=='supplier_admin'||!user.rep_id)return repJson({detail:'Supplier access required.'},403);
    return handle(user.rep_id,request,context as Context);
  };
}
