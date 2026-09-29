import type {DataSources} from '@/server/rep/settings';

// The Settings API client (task 6.1): the PUT routes under /api/rep/settings and the Data sources
// poll. Without a session the portal returns to the workspace chooser, as the Quotes list does.

const leave=()=>window.location.assign('/');

async function read<T>(response:Response,fallback:string):Promise<T>{
  const body=await response.json().catch(()=>null);
  if(response.status===401){leave();throw new Error('Choose a demo workspace.');}
  if(!response.ok)throw new Error(typeof body?.detail==='string'?body.detail:fallback);
  return body as T;
}

export type SettingsWrite='assignments'|'access'|'floors'|'pricing'|'delivery';

/** PUT /api/rep/settings/<what>: saves one change and returns what the server stored. Throws with the server's reason. */
export async function saveSetting<T>(what:SettingsWrite,body:unknown):Promise<T>{
  const response=await fetch(`/api/rep/settings/${what}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
  return read<T>(response,'That change wasn’t saved. Try again.');
}

/** GET /api/rep/settings/sources. */
export async function loadSources():Promise<DataSources>{
  return read<DataSources>(await fetch('/api/rep/settings/sources',{cache:'no-store'}),'Unable to refresh data sources.');
}
