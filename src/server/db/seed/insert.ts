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
