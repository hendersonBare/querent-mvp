import 'server-only';
import type {ERPStatus} from '@/lib/contracts';
import {seedAnchor} from '../db';
import {all,one,run,scalar} from './sql';

/**
 * The local SQLite demo database, which stands in for the ERP in the MVP (spec §6): the day it is
 * seeded for, its newest applied migration (spec §1.1), how many records it holds, and when
 * ERP-sourced rows were last synced (every ERP table carries synced_at, spec §6.2). Settings > Data
 * sources shows it.
 */
export interface DemoDatabase {
  seed_date:string;
  /** The newest applied migration id (src/server/db/migrations), e.g. 001_baseline. */
  schema_migration:string;
  records:{customers:number;items:number;orders:number;quotes:number};
  /** The newest synced_at across the ERP-sourced tables, or null if none is stamped. */
  synced_at:string|null;
}

export function demoDatabase():DemoDatabase{
  const records=one<DemoDatabase['records']>('SELECT (SELECT count(*) FROM customers) customers,(SELECT count(*) FROM items) items,(SELECT count(*) FROM orders) orders,(SELECT count(*) FROM quotes) quotes')!;
  const synced=scalar<string|null>(`SELECT max(synced_at) FROM (SELECT max(synced_at) synced_at FROM customers UNION ALL SELECT max(synced_at) FROM items UNION ALL SELECT max(synced_at) FROM branch_stock
    UNION ALL SELECT max(synced_at) FROM customer_prices UNION ALL SELECT max(synced_at) FROM contracts UNION ALL SELECT max(synced_at) FROM orders)`);
  const migration=scalar<string>('SELECT max(id) FROM schema_migrations')!;
  return {seed_date:seedAnchor(),schema_migration:migration,records,synced_at:synced??null};
}

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
