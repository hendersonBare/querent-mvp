import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterAll,beforeAll} from 'vitest';

/** The mockup's anchor: Dana's request is Sep 23, 2026, last paid on bolts is Aug 12 (spec §2). */
export const SEED_DATE='2026-09-23';

/**
 * Tests only. Points the repository at a fresh, seeded SQLite file for this test file and
 * removes it afterwards. Import repository modules after this runs (dynamic import in tests).
 */
/** The live fields a sent revision's PDF must not follow (task 4.1). */
const LIVE_FIELDS={customers:['terms'],reps:['title','phone','email'],branches:['name','address','will_call_phone']} as const;
type LiveTable=keyof typeof LIVE_FIELDS;

/**
 * Tests only: changes one live account, rep or branch field, as a future ERP sync would (spec
 * §6.2), to prove a frozen revision doesn't follow it. Table and column come from a fixed list.
 */
export async function updateLiveRecord<T extends LiveTable>(table:T,id:string,column:(typeof LIVE_FIELDS)[T][number],value:string){
  if(!(LIVE_FIELDS[table] as readonly string[]).includes(column))throw new Error(`Not a live field: ${table}.${column}`);
  const {db}=await import('../db');
  if(db().prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(value,id).changes!==1)throw new Error(`No ${table} row ${id}`);
}

export function useSeededDatabase(seedDate=SEED_DATE){
  let root='';
  beforeAll(()=>{
    root=mkdtempSync(join(tmpdir(),'querent-repo-'));
    process.env.DATABASE_PATH=join(root,'test.sqlite');
    process.env.QUERENT_SEED_DATE=seedDate;
  });
  afterAll(async()=>{
    const {closeDatabase}=await import('../db');
    closeDatabase();
    rmSync(root,{recursive:true,force:true});
    delete process.env.DATABASE_PATH;delete process.env.QUERENT_SEED_DATE;
  });
}
