import 'server-only';
import {managerRoute,repJson,repRoute} from './http';
import {SettingsError} from './settings';

/** A SettingsError as its status with {detail}, plus its `code` when it has one (409 has_customers, task D1). Anything else is rethrown (a 500). */
function settingsError(error:unknown){
  if(error instanceof SettingsError)return repJson({detail:error.message,...(error.code?{code:error.code}:{})},error.status);
  throw error;
}

/**
 * A PUT /api/rep/settings/* handler for the signed-in rep (401 without a session, 403 for a
 * customer): `write` gets the rep's id and the JSON body (undefined when it isn't JSON) and
 * returns what to send back. A SettingsError becomes its status with {detail}.
 */
export function settingsWrite(write:(repId:string,body:unknown)=>unknown){
  return repRoute(async(repId,request)=>{
    const body=await request.json().catch(()=>undefined);
    try{return repJson(write(repId,body));}
    catch(error){return settingsError(error);}
  });
}

/** settingsWrite for the manager only (managerRoute: 403 for a rep, task D1). `write` also gets the route context (params). */
export function managerWrite<Context=unknown>(write:(repId:string,body:unknown,context:Context)=>unknown){
  return managerRoute<Context>(async(repId,request,context)=>{
    const body=await request.json().catch(()=>undefined);
    try{return repJson(await write(repId,body,context));}
    catch(error){return settingsError(error);}
  });
}
