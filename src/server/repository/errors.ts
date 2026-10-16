import type {PostgrestError} from '@supabase/supabase-js';
import type {WriteFailure} from './types';

// Maps a PostgREST / Postgres error to a repository write failure. The database's messages name fields
// and lines, never their contents (check-constraint details, which can quote a row, are not passed on).

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid=(value:string)=>UUID.test(value);

export function writeFailure(error:Pick<PostgrestError,'code'|'message'|'hint'>):WriteFailure{
  const code=error.code??'';
  if(error.hint==='example_quote')return {ok:false,error:'example',message:'The example quote cannot be changed or deleted.'};
  if(error.hint==='not_found'||code==='P0002')return {ok:false,error:'not_found',message:'Quote not found.'};
  if(code.startsWith('22')||code.startsWith('23'))return {ok:false,error:'invalid',message:error.message};
  if(code==='42501'||code==='PGRST301'||code==='PGRST302')return {ok:false,error:'unauthorized',message:'Not allowed.'};
  return {ok:false,error:'failed',message:'The database could not save this.'};
}
