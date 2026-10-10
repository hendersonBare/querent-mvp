import type {FreightUpdate} from '@/server/freight/controls';
import type {FreightSettingsView,ImpactPreviewView} from '@/server/rep/freight-settings';
import type {DataSources} from '@/server/rep/settings';
import type {TeamSettings} from '@/server/rep/team';

// The Settings API client (task 6.1): the PUT routes under /api/rep/settings and the Data sources
// poll. Without a session the portal returns to the workspace chooser, as the Quotes list does.

const leave=()=>window.location.assign('/');

async function read<T>(response:Response,fallback:string):Promise<T>{
  const body=await response.json().catch(()=>null);
  if(response.status===401){leave();throw new Error('Choose a demo workspace.');}
  if(!response.ok)throw new Error(typeof body?.detail==='string'?body.detail:fallback);
  return body as T;
}

/** 'aging' is the manager's (task D1). */
export type SettingsWrite='assignments'|'access'|'floors'|'pricing'|'delivery'|'aging';

/** PUT /api/rep/settings/<what>: saves one change and returns what the server stored. Throws with the server's reason. */
export async function saveSetting<T>(what:SettingsWrite,body:unknown):Promise<T>{
  const response=await fetch(`/api/rep/settings/${what}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  return read<T>(response,'That change wasn’t saved. Try again.');
}

/** PUT /api/rep/team/reps/<id> {team?, active?} (manager only, task D1): every rep, updated. Throws with the server's reason. */
export async function saveTeamRep(repId:string,body:{team?:string|null;active?:boolean}):Promise<TeamSettings>{
  const response=await fetch(`/api/rep/team/reps/${encodeURIComponent(repId)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  return read<TeamSettings>(response,'That change wasn’t saved. Try again.');
}

/** GET /api/rep/settings/freight (manager only, task C3): free delivery pricing's controls, pool and fuel price. */
export async function loadFreight():Promise<FreightSettingsView>{
  return read<FreightSettingsView>(await fetch('/api/rep/settings/freight',{cache:'no-store'}),'Free delivery pricing couldn’t be loaded.');
}

/** PUT /api/rep/settings/freight {enabled?, cost?, rates?} (manager only): the new view. Throws with the server's reason (409 preview_required). */
export async function saveFreight(body:FreightUpdate):Promise<FreightSettingsView>{
  const response=await fetch('/api/rep/settings/freight',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  return read<FreightSettingsView>(response,'That change wasn’t saved. Try again.');
}

/** GET /api/rep/settings/freight/preview (manager only): the impact preview; viewing it unlocks the toggle for 24 hours. */
export async function loadFreightPreview():Promise<ImpactPreviewView>{
  return read<ImpactPreviewView>(await fetch('/api/rep/settings/freight/preview',{cache:'no-store'}),'The impact preview couldn’t be loaded. Try again.');
}

/** GET /api/rep/settings/sources. */
export async function loadSources():Promise<DataSources>{
  return read<DataSources>(await fetch('/api/rep/settings/sources',{cache:'no-store'}),'Unable to refresh data sources.');
}
