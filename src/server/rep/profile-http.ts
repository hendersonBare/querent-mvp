import 'server-only';
import {repJson} from './http';
import {ProfileError} from './profile';

/** A refused profile or picture change as its status with {detail, field} (plan U9). Anything else is rethrown (a 500). */
export function profileError(error:unknown){
  if(error instanceof ProfileError)return repJson({detail:error.message,...(error.field?{field:error.field}:{})},error.status);
  throw error;
}
