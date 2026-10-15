import type {FreightUpdate} from '@/server/freight/controls';
import type {FreightSettingsView,ImpactPreviewView} from '@/server/rep/freight-settings';
import type {NotificationPrefs} from '@/server/rep/notification-prefs';
import type {RepProfileView} from '@/server/rep/profile';
import type {AccessTable} from '@/server/rep/settings';

// The Settings API client (task 6.1; plan U8): the PUT routes under /api/rep/settings, the Customer access
// list and the freight controls. Without a session the portal returns to /, as the Quotes list does.

const leave=()=>window.location.assign('/');

/** A refused request: the server's reason as the message, and its whole answer (a field-level error's `fields`, plan U9). */
export class RequestError extends Error{
  constructor(message:string,readonly status:number,readonly body:Record<string,unknown>|null){super(message);this.name='RequestError';}
}

async function read<T>(response:Response,fallback:string):Promise<T>{
  const body=await response.json().catch(()=>null);
  if(response.status===401){leave();throw new Error('Choose a demo workspace.');}
  if(!response.ok)throw new RequestError(typeof body?.detail==='string'?body.detail:fallback,response.status,body&&typeof body==='object'?body:null);
  return body as T;
}

/** 'access', 'org-floors', 'pricing', 'delivery' and 'aging' are the manager's (plan U8); 'floors' is a rep's own margins (plan U9). */
export type SettingsWrite='access'|'floors'|'org-floors'|'pricing'|'delivery'|'aging';

/** PUT /api/rep/settings/<what>: saves one change and returns what the server stored. Throws with the server's reason. */
export async function saveSetting<T>(what:SettingsWrite,body:unknown):Promise<T>{
  const response=await fetch(`/api/rep/settings/${what}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  return read<T>(response,'That change wasn’t saved. Try again.');
}

/** GET /api/rep/settings/access?<query> (manager only): the customers matching a search and the data type states. */
export async function loadAccess(query:string):Promise<AccessTable>{
  return read<AccessTable>(await fetch(`/api/rep/settings/access?${query}`,{cache:'no-store'}),'Unable to load customers. Try again.');
}

/** GET /api/rep/settings/freight (manager only, task C3): free delivery pricing's controls, pool and fuel price. */
export async function loadFreight():Promise<FreightSettingsView>{
  return read<FreightSettingsView>(await fetch('/api/rep/settings/freight',{cache:'no-store'}),'Free delivery pricing couldn’t be loaded.');
}

/** PUT /api/rep/settings/freight {enabled?, cost?, rates?} (manager only): the new view. Throws with the server's reason (409 preview_required, 403 feature_off). */
export async function saveFreight(body:FreightUpdate):Promise<FreightSettingsView>{
  const response=await fetch('/api/rep/settings/freight',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  return read<FreightSettingsView>(response,'That change wasn’t saved. Try again.');
}

/** GET /api/rep/settings/freight/preview (manager only): the impact preview; viewing it unlocks the toggle for 24 hours. */
export async function loadFreightPreview():Promise<ImpactPreviewView>{
  return read<ImpactPreviewView>(await fetch('/api/rep/settings/freight/preview',{cache:'no-store'}),'The impact preview couldn’t be loaded. Try again.');
}

// ---- A rep's own tabs (plan U9): Profile and Notifications.

const json=(method:'PUT',body:unknown):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});

/** PUT /api/rep/profile {name, phone, email}: the signed-in rep's profile as stored. Throws with the server's reason and field. */
export async function saveProfile(body:{name:string;phone:string;email:string}):Promise<RepProfileView>{
  return read<RepProfileView>(await fetch('/api/rep/profile',json('PUT',body)),'Your profile wasn’t saved. Try again.');
}

/** PUT /api/rep/profile/picture with the picture itself as the body; the server checks its bytes. */
export async function uploadPicture(file:File):Promise<RepProfileView>{
  const response=await fetch('/api/rep/profile/picture',{method:'PUT',headers:{'Content-Type':file.type||'application/octet-stream'},body:file,cache:'no-store'});
  return read<RepProfileView>(response,'Your picture wasn’t saved. Try again.');
}

/** DELETE /api/rep/profile/picture: back to the initials. */
export async function deletePicture():Promise<RepProfileView>{
  return read<RepProfileView>(await fetch('/api/rep/profile/picture',{method:'DELETE',cache:'no-store'}),'Your picture wasn’t removed. Try again.');
}

/** PUT /api/rep/notification-prefs {<event key>: on, ...}: every switch as stored. */
export async function saveNotificationPrefs(body:Partial<NotificationPrefs>):Promise<NotificationPrefs>{
  return read<NotificationPrefs>(await fetch('/api/rep/notification-prefs',json('PUT',body)),'Your notifications weren’t saved. Try again.');
}
