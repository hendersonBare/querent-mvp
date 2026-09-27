import 'server-only';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {COOKIE,principalFromCookie} from '@/server/session';

/**
 * The signed-in rep's id, for a /rep/* page that reads rep-only data. Anyone else goes back to
 * the workspace chooser at /. Pages check this themselves: the rep layout's own check doesn't
 * stop a page segment from rendering (node_modules/next/dist/docs/01-app/02-guides/authentication.md).
 */
export async function signedInRepId():Promise<string>{
  const user=principalFromCookie((await cookies()).get(COOKIE)?.value);
  if(user?.role!=='supplier_admin'||!user.rep_id)redirect('/');
  return user.rep_id;
}
