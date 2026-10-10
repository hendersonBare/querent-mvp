import 'server-only';
import type Database from 'better-sqlite3';
import {db} from '../db';

// Shared helpers for the repository modules. Nothing outside src/server/repository may
// import this file or the db module: every read and write is a typed repository function (spec §6.1).

const cache=new WeakMap<Database.Database,Map<string,Database.Statement>>();

/** A prepared statement for `text`, cached per connection. */
function statement(text:string){
  const connection=db();
  let statements=cache.get(connection);
  if(!statements){statements=new Map();cache.set(connection,statements);}
  let prepared=statements.get(text);
  if(!prepared){prepared=connection.prepare(text);statements.set(text,prepared);}
  return prepared;
}

export const one=<T>(text:string,...params:unknown[])=>statement(text).get(...params) as T|undefined;
export const all=<T>(text:string,...params:unknown[])=>statement(text).all(...params) as T[];
export const run=(text:string,...params:unknown[])=>statement(text).run(...params);
/** The first column of the first row. */
export function scalar<T>(text:string,...params:unknown[]){const row=one<Record<string,T>>(text,...params);return row?Object.values(row)[0]:undefined;}

/**
 * Runs `fn` in one SQLite transaction, so a service can group several repository writes
 * (for example create a quote and log its activity). Nested calls become savepoints.
 */
export function inTransaction<T>(fn:()=>T):T{return db().transaction(fn)();}

/** Binds a list for `IN (SELECT value FROM json_each(?))`, so one statement serves any length. */
export const list=(values:readonly string[])=>JSON.stringify(values);

export const bool=(value:unknown)=>value===1||value===true;
export const flag=(value:boolean)=>value?1:0;
export const nowIso=()=>new Date().toISOString();
/** Today as YYYY-MM-DD (UTC). */
export const today=()=>nowIso().slice(0,10);

/** Keeps `rows` in the order of `ids`, dropping ids with no row. */
export function inOrder<T>(ids:readonly string[],rows:T[],key:(row:T)=>string){
  const byId=new Map(rows.map(row=>[key(row),row]));
  return ids.flatMap(id=>{const row=byId.get(id);return row?[row]:[];});
}
