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
