import 'server-only';
import type {NextRequest} from 'next/server';
import {z} from 'zod';
import type {ApiSession} from '@/features/auth/server';
import {getOrgSettings,logActivity,setMatchStrictness,type ActivityMetadata} from '@/server/repository';
import {SETTINGS_COPY} from './copy';
import {isStrictnessLevel,type StrictnessLevel} from './strictness';

// The settings API (docs/boxt/plan.md "API", B7). The route file wraps these in withApiUser, which
// answers 401 without a session and 403 for a cross-origin write before they run; every call goes
// through the repository with the user's RLS-scoped client.
//
//   GET  /api/settings   {matchStrictness}
//   PUT  /api/settings   body {matchStrictness: 'strict'|'balanced'|'lenient'}; {matchStrictness} as saved
//
// A change writes one settings_change activity row with the old and new level (enum values only).
// Choosing the level already in force answers 200 and writes nothing. Errors are fixed sentences,
// never the database's. Nothing here logs to the console.

const PutBody=z.object({matchStrictness:z.custom<StrictnessLevel>(isStrictnessLevel)}).strict();

/** The settings_change row's metadata: the two levels, nothing else. */
export const settingsChangeMetadata=(from:StrictnessLevel,to:StrictnessLevel)=>({from,to}) satisfies ActivityMetadata;

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'cache-control':'no-store'}});
const error=(message:string,status:number)=>json({error:message},status);

export async function getSettingsHandler(_request:NextRequest,{db}:ApiSession):Promise<Response>{
  try{
    const {matchStrictness}=await getOrgSettings(db);
    return json({matchStrictness});
  }catch{
    return error(SETTINGS_COPY.loadFailed,500);
  }
}

export async function putSettingsHandler(request:NextRequest,{db}:ApiSession):Promise<Response>{
  let body:unknown;
  try{body=await request.json();}catch{return error(SETTINGS_COPY.invalidLevel,400);}
  const parsed=PutBody.safeParse(body);
  if(!parsed.success)return error(SETTINGS_COPY.invalidLevel,400);
  const to=parsed.data.matchStrictness;
  try{
    const from=(await getOrgSettings(db)).matchStrictness;
    if(from===to)return json({matchStrictness:to});
    const result=await setMatchStrictness(db,to);
    if(!result.ok){
      if(result.error==='invalid')return error(SETTINGS_COPY.invalidLevel,400);
      if(result.error==='unauthorized')return error(SETTINGS_COPY.notAllowed,403);
      return error(SETTINGS_COPY.saveFailed,500);
    }
    await logActivity(db,'settings_change',settingsChangeMetadata(from,result.settings.matchStrictness));
    return json({matchStrictness:result.settings.matchStrictness});
  }catch{
    return error(SETTINGS_COPY.saveFailed,500);
  }
}
