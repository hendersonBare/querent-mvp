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
/**
 * The live fields a sent revision's PDF must not follow (task 4.1), and the item cost the internal
 * worksheet must not follow for a line still on the quote (task 4.2).
 */
const LIVE_FIELDS={customers:['terms'],reps:['name','title','phone','email'],branches:['name','address','will_call_phone'],items:['cost']} as const;
type LiveTable=keyof typeof LIVE_FIELDS;

/**
 * Tests only: changes one live account, rep, branch or item field, as a future ERP sync would (spec
 * §6.2), to prove a frozen revision doesn't follow it. Table and column come from a fixed list.
 */
export async function updateLiveRecord<T extends LiveTable>(table:T,id:string,column:(typeof LIVE_FIELDS)[T][number],value:string|number){
  if(!(LIVE_FIELDS[table] as readonly string[]).includes(column))throw new Error(`Not a live field: ${table}.${column}`);
  const {db}=await import('../db');
  if(db().prepare(`UPDATE ${table} SET ${column}=? WHERE id=?`).run(value,id).changes!==1)throw new Error(`No ${table} row ${id}`);
}

/** The frozen freight columns a quote carries (spec §1.2 004 row, §4.4). */
const QUOTE_FREIGHT=['freight_rate_bp','freight_ramp_step','freight_ramp_steps','modelled_freight_cents'] as const;
type QuoteFreightColumn=(typeof QUOTE_FREIGHT)[number];

/**
 * Tests only: sets a quote's frozen freight columns, as quote creation will once free delivery
 * pricing is on (C2), so pool tests can build eligible and ineligible quotes. Columns come from a fixed list.
 */
export async function setQuoteFreightFixture(quoteId:string,values:Partial<Record<QuoteFreightColumn,number|null>>){
  const columns=Object.keys(values) as QuoteFreightColumn[];
  if(!columns.length||columns.some(c=>!QUOTE_FREIGHT.includes(c)))throw new Error(`Not quote freight columns: ${columns.join(',')}`);
  const {db}=await import('../db');
  if(db().prepare(`UPDATE quotes SET ${columns.map(c=>`${c}=?`).join(',')} WHERE id=?`).run(...columns.map(c=>values[c]),quoteId).changes!==1)throw new Error(`No quote ${quoteId}`);
}

/**
 * Tests only: takes the demo seed's free delivery pilot quotes (task F1, src/server/db/seed/demo.ts)
 * out of the pool, so pool tests start from an empty window whatever the day: no quote keeps a frozen
 * rate and no line keeps recovery. Their modelled cost stays.
 */
export async function clearSeededPool(){
  const {db}=await import('../db');
  db().prepare('UPDATE quotes SET freight_rate_bp=NULL,freight_ramp_step=NULL,freight_ramp_steps=NULL WHERE freight_rate_bp IS NOT NULL').run();
  db().prepare('UPDATE quote_lines SET freight_recovery=0 WHERE freight_recovery<>0').run();
}

/**
 * Tests only: deletes the demo seed's book of quotes (task F1, src/server/db/seed/demo.ts) with their
 * lines, revisions and activity, for tests that count every quote in a fixed window: the book is
 * dated from the real clock, so on some days it would fall inside that window.
 */
export async function clearDemoBook(){
  const {db}=await import('../db');
  const {DEMO_QUOTES,FIRST_DEMO_NUMBER}=await import('../db/seed/demo');
  db().prepare('DELETE FROM quotes WHERE id IN (SELECT value FROM json_each(?))').run(JSON.stringify(DEMO_QUOTES.map((_,i)=>`q-${FIRST_DEMO_NUMBER+i}`)));
}

/** Tests only: stores a settings key (null removes it), for keys whose setter belongs to a later slice (C3). */
export async function setSettingFixture(key:string,value:string|null){
  const {db}=await import('../db');
  if(value===null)db().prepare('DELETE FROM settings WHERE key=?').run(key);
  else db().prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,value);
}

/**
 * Tests only: sets a rep's stored role or active flag directly (v3 spec §8, task D1), bypassing the
 * Settings checks, so guard tests can build an inactive manager or a role that disagrees with the persona.
 */
export async function setRepFixture(repId:string,values:{role?:string;active?:number}){
  const columns=(['role','active'] as const).filter(c=>values[c]!==undefined);
  if(!columns.length)throw new Error('Pass role or active.');
  const {db}=await import('../db');
  if(db().prepare(`UPDATE reps SET ${columns.map(c=>`${c}=?`).join(',')} WHERE id=?`).run(...columns.map(c=>values[c]),repId).changes!==1)throw new Error(`No rep ${repId}`);
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
