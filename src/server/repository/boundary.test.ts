// @vitest-environment node
import {existsSync,readdirSync,readFileSync} from 'node:fs';
import {join,posix,relative,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// Data-access boundary (docs/boxt/plan.md "Layout"; task B1). The app reaches the database only
// through the repository, with the request's user-scoped Supabase client:
// 1. Supabase query builders (`.from(`, `.rpc(`, `.schema(`) and SQL text appear under src/ only in
//    src/server/repository/. Migrations (supabase/) and scripts (scripts/) are outside src/ and free.
// 2. `pg` (a direct Postgres connection, which bypasses RLS) is imported only by scripts/: no file
//    under src/ imports it. App code under src/ does not import from scripts/ either; only test files
//    may (the test:db suite reads activity rows through scripts/lib/local-admin.ts).
// 3. No Supabase client under src/ is created with a service-role or secret key, and no file under
//    src/ names one. Repository modules never create a client at all: every function takes one.

const ROOT=resolve(__dirname,'../../..');
const SELF='src/server/repository/boundary.test.ts';
const REPOSITORY='src/server/repository/';
/** Guard tests that name the keys they guard against. */
const KEY_GUARDS=['src/secrets-guard.test.ts','src/env-example.test.ts'];

/** `.from(` on a query builder, but not Array.from / Buffer.from / Uint8Array.from (a capitalized receiver). */
const QUERY_BUILDER=[/(?<!\b[A-Z]\w*)\.from\s*\(/,/\.rpc\s*\(/,/\.schema\s*\(/];
const SQL=[
  /\b(?:SELECT\s+(?:DISTINCT\s+)?[\w*(]|INSERT\s+INTO\b|UPDATE\s+[\w.]+\s+SET\b|DELETE\s+FROM\b|TRUNCATE\s+\w|(?:CREATE|DROP|ALTER)\s+(?:TABLE|INDEX|VIEW|TRIGGER|FUNCTION|POLICY|SCHEMA)\b|GRANT\s+\w+\s+ON\b)/,
  /\b(?:select\s+(?:\*|[\w.]+\s*,)|insert\s+into\s+[\w.]+\s*\(|delete\s+from\s+[\w.]+|update\s+[\w.]+\s+set\s+\w+\s*=|(?:create|drop|alter)\s+(?:table|index|view|trigger|function|policy)\s+[\w.]+)/,
];
/** A service-role or secret key, by env name, option name or key prefix. */
const PRIVILEGED_KEY=/service[_\s-]?role|serviceRole|SECRET_KEY|secretKey|sb_secret_/i;
const CLIENT_FACTORY=/\bcreate(?:Server|Browser)?Client\s*\(/;

function sourceFiles(dir:string):string[]{
  const abs=join(ROOT,dir);
  if(!existsSync(abs))return [];
  return readdirSync(abs,{withFileTypes:true}).flatMap(entry=>{
    const path=posix.join(dir,entry.name);
    if(entry.isDirectory())return entry.name==='node_modules'?[]:sourceFiles(path);
    return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)?[path]:[];
  });
}

const isTest=(file:string)=>/\.test\.tsx?$/.test(file);
const lines=(text:string,patterns:RegExp[])=>text.split('\n').flatMap((line,i)=>patterns.some(p=>p.test(line))?[`${i+1}: ${line.trim()}`]:[]);

/** Lines of `text` that run a Supabase query builder call. */
export const findQueries=(text:string)=>lines(text,QUERY_BUILDER);
/** Lines of `text` that look like SQL. */
export const findSql=(text:string)=>lines(text,SQL);

/** Module specifiers imported (statically, dynamically or by require) by `text`, local ones resolved to repo paths. */
export function importsOf(file:string,text:string){
  const specifiers=[...text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm)].map(m=>m[2]);
  return specifiers.map(spec=>spec.startsWith('@/')?`src/${spec.slice(2)}`:spec.startsWith('.')?posix.normalize(posix.join(posix.dirname(file),spec)):spec);
}

/** Every boundary breach in one file under src/, as "file:line: text (rule)". */
export function violations(file:string,text:string){
  const found:string[]=[];
  const inRepository=file.startsWith(REPOSITORY);
  if(!inRepository){
    found.push(...findQueries(text).map(hit=>`${file}:${hit} (Supabase query outside the repository)`));
    found.push(...findSql(text).map(hit=>`${file}:${hit} (SQL outside the repository)`));
  }
  for(const target of importsOf(file,text)){
    if(target==='pg'||target.startsWith('pg/'))found.push(`${file}: imports ${target} (pg is for scripts/ only)`);
    if(!isTest(file)&&(target==='scripts'||target.startsWith('scripts/')))found.push(`${file}: imports ${target} (app code may not import scripts/)`);
  }
  if(!KEY_GUARDS.includes(file)&&PRIVILEGED_KEY.test(text))found.push(`${file}: names a service-role or secret key`);
  if(inRepository&&!isTest(file)&&CLIENT_FACTORY.test(text))found.push(`${file}: creates a Supabase client (take the request's client as an argument)`);
  return found;
}

describe('data-access boundary',()=>{
  const files=()=>sourceFiles('src').filter(f=>f!==SELF);

  it('scans the app source, the repository included',()=>{
    expect(files().length).toBeGreaterThan(10);
    expect(files().filter(f=>f.startsWith(REPOSITORY)).length).toBeGreaterThan(3);
  });

  it('keeps Supabase queries and SQL in src/server/repository, pg in scripts/, and service-role keys out of src/',()=>{
    expect(files().flatMap(f=>violations(f,readFileSync(join(ROOT,f),'utf8')))).toEqual([]);
  });

  it('every repository module takes the client as its first argument',()=>{
    for(const f of files().filter(f=>f.startsWith(REPOSITORY)&&!isTest(f)&&!/\/(index|types|database\.types|sanitize)\.ts$/.test(f))){
      const text=readFileSync(join(ROOT,f),'utf8');
      for(const m of text.matchAll(/export\s+async\s+function\s+(\w+)\s*\(([^)]*)\)/g))expect(m[2].trim(),`${f} ${m[1]}`).toMatch(/^db\s*:\s*Db\b/);
    }
  });

  it('checks every path relative to the repository root',()=>{
    expect(relative(ROOT,join(ROOT,SELF))).toBe(SELF);
    expect(existsSync(join(ROOT,SELF))).toBe(true);
  });
});

describe('boundary detectors (self-check)',()=>{
  it('flag Supabase query builders, but not Array.from and friends',()=>{
    expect(findQueries("const {data}=await db.from('quotes').select('*');")).toHaveLength(1);
    expect(findQueries("await supabase\n  .from('catalog_items')")).toHaveLength(1);
    expect(findQueries("await db.rpc('create_quote',{payload});")).toHaveLength(1);
    expect(findQueries("db.schema('private').from('x')")).toHaveLength(1);
    expect(findQueries('const supabaseClient=x; supabaseClient.from("t")')).toHaveLength(1);
    expect(findQueries('Array.from(rows); Buffer.from(bytes); Uint8Array.from(x); new Set(a);')).toEqual([]);
    expect(findQueries('Object.fromEntries(pairs)')).toEqual([]);
  });

  it('flag SQL text in either case, but not everyday copy',()=>{
    expect(findSql('const sql=`SELECT id FROM quotes`;')).toHaveLength(1);
    expect(findSql("q('select id, sku from catalog_items')")).toHaveLength(1);
    expect(findSql("q('select * from quotes')")).toHaveLength(1);
    expect(findSql("q('insert into quote_lines (quote_id) values ($1)')")).toHaveLength(1);
    expect(findSql("q('delete from quotes where id=$1')")).toHaveLength(1);
    expect(findSql("q('update quotes set reference = $1')")).toHaveLength(1);
    expect(findSql("q('UPDATE quotes SET reference = $1')")).toHaveLength(1);
    expect(findSql("q('create table x (id int)')")).toHaveLength(1);
    expect(findSql('<option>Select a strictness level</option>')).toEqual([]);
    expect(findSql("label: 'Update quote', 'Delete line', 'select the item from the list'")).toEqual([]);
    expect(findSql('Insert into the review dialog')).toEqual([]);
  });

  it('allow queries and SQL inside the repository only',()=>{
    expect(violations('src/server/repository/quotes.ts',"await db.from('quotes').select('*')")).toEqual([]);
    expect(violations('src/server/repository/x.db.test.ts',"await db.from('activity_log').select('*')")).toEqual([]);
    expect(violations('src/features/quotes/page.tsx',"await db.from('quotes').select('*')")).toHaveLength(1);
    expect(violations('src/app/api/quotes/route.ts',"await db.rpc('create_quote',{payload})")).toHaveLength(1);
    expect(violations('src/server/catalog.ts','const q=`SELECT sku FROM catalog_items`')).toHaveLength(1);
  });

  it('flag pg anywhere under src/, and scripts/ imports from app code',()=>{
    expect(violations('src/server/repository/quotes.ts',"import {Pool} from 'pg';")).toHaveLength(1);
    expect(violations('src/server/x.ts',"const pg=require('pg');")).toHaveLength(1);
    expect(violations('src/server/x.ts',"const {Client}=await import('pg');")).toHaveLength(1);
    expect(violations('src/features/x.ts',"import {seed} from '../../scripts/seed-boxt';")).toHaveLength(1);
    expect(violations('src/server/repository/x.db.test.ts',"import {adminQuery} from '../../../scripts/lib/local-admin';")).toEqual([]);
    expect(violations('src/server/x.ts',"import {z} from 'zod'; import pgp from 'pgpass-thing';")).toEqual([]);
  });

  it('flag service-role and secret keys, and clients created inside the repository',()=>{
    expect(violations('src/features/auth/admin.ts','createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!)')).toHaveLength(1);
    expect(violations('src/x.ts','const serviceRoleKey=env.KEY;')).toHaveLength(1);
    expect(violations('src/x.ts',"const k='sb_secret_abc';")).toHaveLength(1);
    expect(violations('src/x.test.ts','createClient(url, env.SECRET_KEY)')).toHaveLength(1);
    expect(violations('src/features/auth/server.ts','createServerClient(url, anonKey, {cookies})')).toEqual([]);
    expect(violations('src/server/repository/quotes.ts','const db=createClient(url, anonKey);')).toHaveLength(1);
    expect(violations('src/server/repository/rls.db.test.ts','const anon=createClient(url, anonKey);')).toEqual([]);
  });

  it('read imports the way the bundler resolves them',()=>{
    expect(importsOf('src/server/repository/x.db.test.ts',"import a from '../../../scripts/lib/local-admin';")).toEqual(['scripts/lib/local-admin']);
    expect(importsOf('src/app/page.tsx',"import {listQuotes} from '@/server/repository';")).toEqual(['src/server/repository']);
  });
});
