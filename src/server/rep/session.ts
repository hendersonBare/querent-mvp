import 'server-only';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {COOKIE,principalFromCookie} from '@/server/session';
import {repAccess,type RepAccess} from './access';

/**
 * The signed-in rep, for a /rep/* page that reads rep-only data: their id and whether they are the
 * manager. Anyone else, an inactive rep included (task D1), goes back to the workspace chooser at /.
 * Pages check this themselves: the rep layout's own check doesn't stop a page segment from
 * rendering (node_modules/next/dist/docs/01-app/02-guides/authentication.md).
 */
export async function signedInRep():Promise<Extract<RepAccess,{ok:true}>>{
  const access=repAccess(principalFromCookie((await cookies()).get(COOKIE)?.value));
  if(!access.ok)redirect('/');
  return access;
}

/** The signed-in rep's id (see signedInRep). */
export async function signedInRepId():Promise<string>{return (await signedInRep()).repId;}
