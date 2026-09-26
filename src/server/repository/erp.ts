import 'server-only';
import type {ERPStatus} from '@/lib/contracts';
import {all,run} from './sql';

/** The ERP connection status: the last refresh, plus recent events for the supplier. */
export function events(includeAll:boolean):ERPStatus{
  const rows=all<ERPStatus['events'][number]>('SELECT id,timestamp,message FROM sync_events ORDER BY timestamp DESC,id DESC LIMIT ?',includeAll?10:1);
  return {last_updated:rows[0]?.timestamp||null,events:includeAll?rows:[]};
}

/** Records a connection refresh and keeps the last 100 events. */
export function heartbeat(at=new Date().toISOString()){
  run('INSERT INTO sync_events(timestamp,message) VALUES(?,?)',at,'ERP connection refreshed');
  run('DELETE FROM sync_events WHERE id NOT IN (SELECT id FROM sync_events ORDER BY timestamp DESC,id DESC LIMIT 100)');
}
