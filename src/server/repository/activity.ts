import 'server-only';
import {writeFailure} from './errors';
import {isActivityAction,sanitizeActivityMetadata,type ActivityAction} from './sanitize';
import type {Db,WriteResult} from './types';

// The activity log: one row per action, for the signed-in user (user_id defaults to auth.uid() and RLS
// checks it). Metadata goes through sanitizeActivityMetadata first (see sanitize.ts for the rule): counts,
// scores, thresholds, flags and known enum values only, never customer text. App users cannot read the
// log back. Logging never throws: a failure comes back as a result, so it cannot break the action logged.

export async function logActivity(db:Db,action:ActivityAction,metadata?:Readonly<Record<string,unknown>>):Promise<WriteResult>{
  if(!isActivityAction(action))return {ok:false,error:'invalid',message:'Unknown activity action.'};
  try{
    const {error}=await db.from('activity_log').insert({action,metadata:sanitizeActivityMetadata(metadata)});
    return error?writeFailure(error):{ok:true};
  }catch{
    return {ok:false,error:'failed',message:'The activity could not be logged.'};
  }
}
