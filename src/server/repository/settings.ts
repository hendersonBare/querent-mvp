import 'server-only';
import {writeFailure} from './errors';
import {RepositoryError,isMatchStrictness,type Database,type Db,type MatchStrictness,type OrgSettings,type WriteResult} from './types';

// Organization settings: one row (id = 1). Signed-in users read it and may change the match strictness;
// a trigger records when and by whom.

type SettingsRow=Database['public']['Tables']['org_settings']['Row'];

const toSettings=(row:SettingsRow):OrgSettings=>({
  matchStrictness:isMatchStrictness(row.match_strictness)?row.match_strictness:'strict',
  updatedAt:row.updated_at,updatedBy:row.updated_by,
});

export async function getOrgSettings(db:Db):Promise<OrgSettings>{
  const {data,error}=await db.from('org_settings').select('*').eq('id',1).single();
  if(error)throw new RepositoryError('getOrgSettings',error.code,error.message);
  return toSettings(data);
}

export async function setMatchStrictness(db:Db,level:MatchStrictness):Promise<WriteResult<{settings:OrgSettings}>>{
  if(!isMatchStrictness(level))return {ok:false,error:'invalid',message:'Match strictness must be strict, balanced or lenient.'};
  const {data,error}=await db.from('org_settings').update({match_strictness:level}).eq('id',1).select('*').maybeSingle();
  if(error)return writeFailure(error);
  if(!data)return {ok:false,error:'unauthorized',message:'Not allowed.'};
  return {ok:true,settings:toSettings(data)};
}
