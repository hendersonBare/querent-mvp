import 'server-only';
import {heartbeat} from './repository';
declare global{var querentHeartbeat:ReturnType<typeof setInterval>|undefined}
export function ensureHeartbeat(){if(!globalThis.querentHeartbeat){globalThis.querentHeartbeat=setInterval(()=>{try{heartbeat();}catch(error){console.error('Heartbeat failed',error instanceof Error?error.name:'UnknownError');}},60_000);globalThis.querentHeartbeat.unref();}}
