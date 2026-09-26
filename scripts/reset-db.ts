import {rmSync} from 'node:fs';
import {basename,dirname,parse,resolve} from 'node:path';

async function main(){
 const target=resolve(process.env.DATABASE_PATH||'./data/querent.sqlite');
 const parsed=parse(target);
 if(parsed.root===target||dirname(target)===parsed.root||!basename(target).endsWith('.sqlite'))throw new Error(`Refusing to reset unsafe database path: ${target}`);
 for(const suffix of ['','-wal','-shm'])rmSync(target+suffix,{force:true});
 const {closeDatabase,seedAnchor}=await import('../src/server/db');
 const anchor=seedAnchor();
 closeDatabase();
 console.log(`Reset and reseeded ${target} (seed date ${anchor}; set QUERENT_SEED_DATE=2026-09-23 for the mockup's dates)`);
}
void main();
