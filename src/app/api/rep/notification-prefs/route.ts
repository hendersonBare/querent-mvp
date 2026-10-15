import {repJson,repRoute} from '@/server/rep/http';
import {NotificationPrefsError,notificationPrefs,updateNotificationPrefs} from '@/server/rep/notification-prefs';
export const runtime='nodejs';export const dynamic='force-dynamic';

/**
 * GET /api/rep/notification-prefs: the signed-in rep's in-app switches (plan U9; C_RS4), every Appendix C event
 * key, on unless turned off. PUT {<event key>: true|false, ...}: stores the switches sent for the signed-in rep;
 * an unknown key or a value that is not true or false is 400. GET /api/rep/badges applies them.
 */
export const GET=repRoute(repId=>repJson(notificationPrefs(repId)));

export const PUT=repRoute(async(repId,request)=>{
  const body=await request.json().catch(()=>undefined);
  try{return repJson(updateNotificationPrefs(repId,body));}
  catch(error){
    if(error instanceof NotificationPrefsError)return repJson({detail:error.message},error.status);
    throw error;
  }
});
