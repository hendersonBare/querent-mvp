import {existsSync,rmSync} from 'node:fs';
import {basename,dirname,parse,resolve} from 'node:path';

// npm run db:reset (spec §1.1): deletes the database file, then opening it runs every migration and
// seeds. Reads .env.local when it exists (decision 9); variables already set in the shell win, and
// no value is ever printed.
const ENV_FILE='.env.local';

async function main(){
 if(existsSync(ENV_FILE))process.loadEnvFile(ENV_FILE);
 const target=resolve(process.env.DATABASE_PATH||'./data/querent.sqlite');
 const parsed=parse(target);
 if(parsed.root===target||dirname(target)===parsed.root||!basename(target).endsWith('.sqlite'))throw new Error(`Refusing to reset unsafe database path: ${target}`);
 for(const suffix of ['','-wal','-shm'])rmSync(target+suffix,{force:true});
 const {closeDatabase,seedAnchor}=await import('../src/server/db');
 const anchor=seedAnchor();
 closeDatabase();
 console.log(`Reset ${target} through every migration and reseeded it (seed date ${anchor}; set QUERENT_SEED_DATE=2026-09-23 for the mockup's dates)`);
}
void main();
