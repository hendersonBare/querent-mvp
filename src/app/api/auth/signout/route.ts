import type {NextRequest} from 'next/server';
import {logActivity} from '@/server/repository';
import {crossOriginResponse,isSameOrigin} from '@/features/auth/api';
import {seeOther} from '@/features/auth/http';
import {LOGIN_PATH} from '@/features/auth/paths';
import {createRequestClient,getSessionUser} from '@/features/auth/server';

// POST /api/auth/signout (the rail's Sign out form): logs `logout`, ends the session on the Auth server,
// clears the session cookies and sends the browser to /login. Without a session it just clears the
// cookies and goes to /login. Cross-origin posts are refused, so no other site can sign a user out.
export async function POST(request:NextRequest){
  if(!isSameOrigin(request))return crossOriginResponse();
  const {db,applyCookies}=createRequestClient(request);
  if(await getSessionUser(db))await logActivity(db,'logout');
  try{
    await db.auth.signOut({scope:'local'});
  }catch{
    // The cookies are cleared below whatever the Auth server said.
  }
  return applyCookies(seeOther(LOGIN_PATH));
}
