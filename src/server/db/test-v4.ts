import type Database from 'better-sqlite3';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

// Test helper (spec §1.1): the sqlite_master of a pre-T1 database, as the old applySchema() built it
// (SCHEMA_VERSION=4), captured once in v4-schema.fixture.json before that DDL was deleted.
export interface MasterRow{type:string;name:string;tbl_name:string;sql:string|null}

export const v4Schema=():MasterRow[]=>JSON.parse(readFileSync(join(__dirname,'v4-schema.fixture.json'),'utf8'));

/** sqlite_master in the fixture's order, leaving out the runner's own bookkeeping table. */
export const masterOf=(database:Database.Database)=>database.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE tbl_name<>'schema_migrations' ORDER BY type,name").all() as MasterRow[];

/** Builds a pre-T1 v4 database (tables, indexes, meta.schema_version) from the fixture. */
export function createV4Database(database:Database.Database,version='4'){
  const rows=v4Schema().filter(r=>r.sql&&!r.name.startsWith('sqlite_'));
  database.exec([...rows.filter(r=>r.type==='table'),...rows.filter(r=>r.type!=='table')].map(r=>`${r.sql};`).join('\n'));
  database.prepare("INSERT INTO meta(key,value) VALUES('schema_version',?)").run(version);
}
