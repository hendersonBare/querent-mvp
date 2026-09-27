import 'server-only';
import {repJson,repRoute} from './http';
import {SettingsError} from './settings';

/**
 * A PUT /api/rep/settings/* handler for the signed-in rep (401 without a session, 403 for a
 * customer): `write` gets the rep's id and the JSON body (undefined when it isn't JSON) and
 * returns what to send back. A SettingsError becomes its status with {detail}.
 */
export function settingsWrite(write:(repId:string,body:unknown)=>unknown){
  return repRoute(async(repId,request)=>{
    const body=await request.json().catch(()=>undefined);
    try{return repJson(write(repId,body));}
    catch(error){
      if(error instanceof SettingsError)return repJson({detail:error.message},error.status);
      throw error;
    }
  });
}
