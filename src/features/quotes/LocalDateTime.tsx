'use client';
import {useSyncExternalStore} from 'react';
import {formatDateTime} from './format';

// A date and time in the viewer's own time zone. The server renders it in UTC; on hydration React
// re-renders with the browser's zone (useSyncExternalStore's server snapshot, then the client's).

const subscribe=()=>()=>{};
const browserZone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone;
const serverZone=()=>'UTC';

export function LocalDateTime({iso,className}:{iso:string;className?:string}){
  const zone=useSyncExternalStore(subscribe,browserZone,serverZone);
  return <time dateTime={iso} className={className}>{formatDateTime(iso,zone)}</time>;
}
