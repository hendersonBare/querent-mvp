import {readdirSync,readFileSync} from 'node:fs';
import {join,posix,relative,resolve,sep} from 'node:path';
import {describe,expect,it} from 'vitest';

// Architecture guard (spec §6.1, task 0.3): every read and write goes through the repository.
// 1. No SQL outside src/server/repository/ and src/server/db/ (connection, schema, seed).
// 2. Only those folders (plus scripts/, for db:reset) may import the db module or better-sqlite3.
// 3. LLM code may only use the customer-safe repository module, so a chat tool can't reach cost.

const ROOT=resolve(__dirname,'../../..');
const SCANNED=['src','scripts','e2e'];
const SQL_HOME=['src/server/repository/','src/server/db/'];
const DB_IMPORTERS=[...SQL_HOME,'scripts/'];
/** LLM code: the chat pipeline, anything under these folders, and any file that imports the Anthropic SDK. */
const LLM_FILES=/^src\/server\/(pipeline\.ts$|(chat|llm|tools|agent)\/)/;
const CUSTOMER_MODULE='src/server/repository/customer';

const SQL_PATTERNS=[
  /\.prepare\s*\(/,
  /\.pragma\s*\(/,
  /\.exec\s*\(\s*[`'"]/,
  /\b(?:SELECT\s+(?:DISTINCT\s+)?[\w*(]|INSERT\s+(?:OR\s+\w+\s+)?INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|(?:CREATE|DROP|ALTER)\s+(?:TABLE|INDEX|VIEW|TRIGGER)\b|PRAGMA\s+\w)/,
];

function sourceFiles(dir:string):string[]{
  let entries;
  try{entries=readdirSync(join(ROOT,dir),{withFileTypes:true});}catch{return [];}
  return entries.flatMap(entry=>{
    const path=posix.join(dir,entry.name);
    if(entry.isDirectory())return entry.name==='node_modules'?[]:sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)?[path]:[];
  });
}

/** Lines of `text` that look like SQL, as "line: text". */
export function findSql(text:string){
  return text.split('\n').flatMap((line,i)=>SQL_PATTERNS.some(p=>p.test(line))?[`${i+1}: ${line.trim()}`]:[]);
}

/** Module specifiers imported by `text`, resolved to repo paths when they are local (`@/` or relative). */
export function importsOf(file:string,text:string){
  const specifiers=[...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm)].map(m=>m[2]);
  return specifiers.map(spec=>spec.startsWith('@/')?`src/${spec.slice(2)}`:spec.startsWith('.')?posix.normalize(posix.join(posix.dirname(file),spec)):spec);
}

const isDbModule=(target:string)=>target==='better-sqlite3'||target==='src/server/db'||target.startsWith('src/server/db/');
const isInternalRepository=(target:string)=>(target==='src/server/repository'||target.startsWith('src/server/repository/'))&&target!==CUSTOMER_MODULE;
const under=(file:string,folders:string[])=>folders.some(folder=>file.startsWith(folder));

export function violations(file:string,text:string){
  const found:string[]=[];
  if(!under(file,SQL_HOME))found.push(...findSql(text).map(hit=>`${file}:${hit} (SQL outside the repository)`));
  const imports=importsOf(file,text);
  if(!under(file,DB_IMPORTERS))found.push(...imports.filter(isDbModule).map(target=>`${file} imports ${target} (use the repository)`));
  const isLlm=!/\.test\.tsx?$/.test(file)&&(LLM_FILES.test(file)||imports.some(t=>t==='@anthropic-ai/sdk'||t.startsWith('@anthropic-ai/sdk/')));
  if(isLlm)found.push(...imports.filter(isInternalRepository).map(target=>`${file} imports ${target} (LLM code may only use ${CUSTOMER_MODULE})`));
  return found;
}

describe('repository boundary',()=>{
  const files=SCANNED.flatMap(sourceFiles).map(file=>file.split(sep).join('/'));

  it('scans the whole app',()=>{
    expect(files).toContain('src/app/api/query/[...path]/route.ts');
    expect(files).toContain('src/server/pipeline.ts');
    expect(files.length).toBeGreaterThan(40);
  });

  it('finds no SQL or database access outside the repository, and LLM code uses only the customer module',()=>{
    const found=files.flatMap(file=>violations(file,readFileSync(join(ROOT,file),'utf8')));
    expect(found).toEqual([]);
  });

  it('keeps every file it scans inside the repo',()=>{
    for(const file of files)expect(relative(ROOT,join(ROOT,file)).startsWith('..')).toBe(false);
  });
});

describe('boundary detectors',()=>{
  it('flag SQL text and statements, but not everyday code or copy',()=>{
    expect(findSql("db().prepare('SELECT id FROM items').all()")).toHaveLength(1);
    expect(findSql('const sql=`UPDATE quotes SET status=?`;')).toHaveLength(1);
    expect(findSql("run('INSERT OR IGNORE INTO meta VALUES(1)')")).toHaveLength(1);
    expect(findSql("x.exec('DELETE FROM quotes')")).toHaveLength(1);
    expect(findSql('database.pragma("foreign_keys = ON")')).toHaveLength(1);
    expect(findSql('const m=/\\d+/.exec(text);')).toEqual([]);
    expect(findSql('<option>Select a branch</option>')).toEqual([]);
    expect(findSql("label: 'Update quote', 'Delete line'")).toEqual([]);
  });

  it('flag database imports outside the repository, db and scripts folders',()=>{
    expect(violations('src/server/pipeline.ts',"import {db} from './db';")).toHaveLength(1);
    expect(violations('src/app/page.tsx',"const {db}=await import('@/server/db/index');")).toHaveLength(1);
    expect(violations('src/lib/x.ts',"import Database from 'better-sqlite3';")).toHaveLength(1);
    expect(violations('src/server/repository/quotes.ts',"import {db} from '../db';\nrun('DELETE FROM quotes')")).toEqual([]);
    expect(violations('scripts/reset-db.ts',"await import('../src/server/db')")).toEqual([]);
    expect(violations('scripts/x.ts',"db.prepare('SELECT 1')")).toHaveLength(1);
  });

  it('keep LLM code on the customer-safe module',()=>{
    expect(violations('src/server/pipeline.ts',"import {appendLog} from './repository/customer';")).toEqual([]);
    expect(violations('src/server/pipeline.ts',"import {quote} from './repository';")).toHaveLength(1);
    expect(violations('src/server/chat/tools.ts',"import {priceSources} from '@/server/repository/pricing';")).toHaveLength(1);
    expect(violations('src/server/answer.ts',"import Anthropic from '@anthropic-ai/sdk';\nimport {quote} from '@/server/repository';")).toHaveLength(1);
    expect(violations('src/server/chat/tools.test.ts',"import {quote} from '@/server/repository';")).toEqual([]);
    expect(violations('src/app/api/route.ts',"import {quote} from '@/server/repository';")).toEqual([]);
  });
});
