import type Database from 'better-sqlite3';

export type Row=Record<string,string|number|null>;
export type Insert=(table:string,row:Row)=>void;

/** Returns insert(table, row), caching one prepared statement per table + column set. */
export function inserter(database:Database.Database):Insert{
  const statements=new Map<string,Database.Statement>();
  return (table,row)=>{
    const keys=Object.keys(row);const key=`${table}(${keys.join(',')})`;
    let statement=statements.get(key);
    if(!statement){statement=database.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(k=>`@${k}`).join(',')})`);statements.set(key,statement);}
    statement.run(row);
  };
}

/** Sync columns for an ERP-sourced row (spec §6.2). */
export function erp(externalId:string,syncedAt:string):Row{return {source:'seed',external_id:externalId,synced_at:syncedAt};}

export const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;

/**
 * quotes.original_rep_id (008_original_rep; v3 spec §8; task D2): a seeded quote's first owner is
 * its rep. Run after inserting quotes. A database built at the v4 schema (the adoption test's
 * fixture) has no such column yet: there 008's own backfill sets it when it runs.
 */
export function backfillOriginalReps(database:Database.Database){
  if(!database.prepare("SELECT 1 FROM pragma_table_info('quotes') WHERE name='original_rep_id'").get())return;
  database.prepare('UPDATE quotes SET original_rep_id=rep_id WHERE original_rep_id IS NULL').run();
}
