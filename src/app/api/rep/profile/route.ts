import {repJson,repRoute} from '@/server/rep/http';
import {profileView,updateProfile} from '@/server/rep/profile';
import {profileError} from '@/server/rep/profile-http';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/profile: the signed-in rep's Settings > Profile (plan U9; C_RS2), the manager's own included
 * (decision 69): name, initials, title, phone, email and a link to their picture. PUT {name, phone, email}: saves all three for the signed-in rep (the
 * session's, never one named in the body); a bad field is 400 {detail, field}.
 */
export const GET=repRoute(repId=>{
  try{return repJson(profileView(repId));}catch(error){return profileError(error);}
});

export const PUT=repRoute(async(repId,request)=>{
  const body=await request.json().catch(()=>undefined);
  try{return repJson(updateProfile(repId,body));}catch(error){return profileError(error);}
});
