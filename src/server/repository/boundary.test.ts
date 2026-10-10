import {readdirSync,readFileSync} from 'node:fs';
import {join,posix,relative,resolve,sep} from 'node:path';
import {describe,expect,it} from 'vitest';

// Architecture guard (spec §6.1, §6.3; tasks 0.3 and 2.1): every read and write goes through the repository.
// 1. No SQL outside src/server/repository/ and src/server/db/ (connection, schema, seed).
// 2. Only those folders (plus scripts/, for db:reset) may import the db module or better-sqlite3.
// 3. LLM code may only use the customer-safe repository module, so a chat tool can't reach cost,
//    and may not import the services that read cost and margin (pricing, floors, upsells, the
//    quote service): get_price answers from repository/customer's customer-visible prices only.
// 4. Customer routes (under src/app/, a folder or file named "customer" or "customer-*") may only
//    use the customer-safe repository module, and customer API paths are served only from them.
// 5. Customer routes may not import the services that read cost either, with two named exceptions:
//    the quote intake (task 2.3), which prices Request quote's draft server-side, and the customer
//    response service (task 5.2), which accepts or requests changes through the quote service. Both
//    take only customer-supplied fields and answer with customer-safe fields only. LLM code may
//    import neither.
// 6. The customer-facing server logic in src/server/customer/ (sidebars, item pop-up, the chat's
//    quote notices and the PDF preview modal, task 5.1) follows the customer-route rules, with no
//    exception: the customer-safe repository module only, and no service that reads cost.
// 7. Only test files (*.test.ts, *.test.tsx) may import the test database helpers
//    (src/server/repository/test-db: useSeededDatabase, updateLiveRecord), which write to any table.
// Rules 3 to 6 hold transitively too: a file may not reach what it may not import through a helper
// or a re-export (reachViolations below; the exceptions count only as a route's direct imports).

const ROOT=resolve(__dirname,'../../..');
const SCANNED=['src','scripts','e2e'];
const SQL_HOME=['src/server/repository/','src/server/db/'];
const DB_IMPORTERS=[...SQL_HOME,'scripts/'];
/** LLM code: the chat pipeline, anything under these folders (upsells-writer: Claude's chip wording, task 3.6), and any file that imports the Anthropic SDK. */
const LLM_FILES=/^src\/server\/(pipeline\.ts$|(chat|llm|tools|agent|upsells-writer)\/)/;
const CUSTOMER_MODULE='src/server/repository/customer';
/**
 * Server modules that read cost, margin or floors. LLM code may not import them, and customer routes only CUSTOMER_INTAKE.
 * The freight cost model and pool count too: they produce the modelled delivery cost and the recovery rate, which stay internal (spec §4.6),
 * and so does the recovery allocation, which weighs lines by their margin (C2).
 */
const COST_READERS=['src/server/pricing','src/server/floors','src/server/upsells','src/server/quotes/service','src/server/intake','src/server/customer-response','src/server/freight/cost-model','src/server/freight/pool','src/server/freight/recovery'];
/**
 * The one cost reader a customer route may import (rule 5, task 2.3): Request quote drafts a priced
 * quote, so it needs the pricing engine. It takes only customer-supplied fields and returns only
 * customer-safe ones; its tests and the route's test deep-scan every response for cost.
 */
const CUSTOMER_INTAKE='src/server/intake/quote-request';
/**
 * The second (task 5.2): Accept and Request changes from the PDF preview modal go through the quote
 * service, which loads the internal quote. It takes only the revision, the time and PO or the note,
 * for the session customer, and answers with the customer-safe preview; its tests and the routes'
 * tests deep-scan every answer for cost.
 */
const CUSTOMER_RESPONSE='src/server/customer-response/service';
/** The only cost readers a customer route may import: exactly these modules, not their folders. */
const CUSTOMER_COST_EXCEPTIONS=[CUSTOMER_INTAKE,CUSTOMER_RESPONSE];
/** Customer routes: under src/app/, a folder or file named "customer" or "customer-*" (not the rep's "customers" views). */
const CUSTOMER_ROUTE=/^src\/app\/(?:.+\/)?customer(?:-[^/.]*)?(?:\/|\.tsx?$)/;
/** Customer-facing server logic (rule 6). */
const CUSTOMER_SERVER='src/server/customer/';
/** Test-only database helpers (rule 7). */
const TEST_DB='src/server/repository/test-db';
/** A customer API path handled in code: 'customer/...' or ==='customer'. */
const CUSTOMER_PATH=/(['"`])customer(?:\/|\1)/;

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
const readsCost=(target:string)=>COST_READERS.some(m=>target===m||target.startsWith(`${m}/`));
const under=(file:string,folders:string[])=>folders.some(folder=>file.startsWith(folder));
const isTest=(file:string)=>/\.test\.tsx?$/.test(file);

export function violations(file:string,text:string){
  const found:string[]=[];
  if(!under(file,SQL_HOME))found.push(...findSql(text).map(hit=>`${file}:${hit} (SQL outside the repository)`));
  const imports=importsOf(file,text);
  if(!under(file,DB_IMPORTERS))found.push(...imports.filter(isDbModule).map(target=>`${file} imports ${target} (use the repository)`));
  if(!isTest(file))found.push(...imports.filter(target=>target===TEST_DB).map(target=>`${file} imports ${target} (test files only)`));
  const isLlm=!isTest(file)&&(LLM_FILES.test(file)||imports.some(t=>t==='@anthropic-ai/sdk'||t.startsWith('@anthropic-ai/sdk/')));
  if(isLlm){
    found.push(...imports.filter(isInternalRepository).map(target=>`${file} imports ${target} (LLM code may only use ${CUSTOMER_MODULE})`));
    found.push(...imports.filter(readsCost).map(target=>`${file} imports ${target} (it reads cost; LLM code gets customer-visible prices from ${CUSTOMER_MODULE})`));
  }
  if(!isTest(file)&&CUSTOMER_ROUTE.test(file)){
    found.push(...imports.filter(isInternalRepository).map(target=>`${file} imports ${target} (customer routes may only use ${CUSTOMER_MODULE})`));
    found.push(...imports.filter(target=>readsCost(target)&&!CUSTOMER_COST_EXCEPTIONS.includes(target)).map(target=>`${file} imports ${target} (it reads cost; the only cost readers customer routes may call are ${CUSTOMER_COST_EXCEPTIONS.join(' and ')})`));
  }
  if(!isTest(file)&&file.startsWith(CUSTOMER_SERVER)){
    found.push(...imports.filter(isInternalRepository).map(target=>`${file} imports ${target} (customer-facing code may only use ${CUSTOMER_MODULE})`));
    found.push(...imports.filter(readsCost).map(target=>`${file} imports ${target} (it reads cost; customer-facing code may not)`));
  }
  if(!isTest(file)&&file.startsWith('src/app/api/')&&!CUSTOMER_ROUTE.test(file))
    found.push(...text.split('\n').flatMap((line,i)=>CUSTOMER_PATH.test(line)?[`${file}:${i+1}: ${line.trim()} (serve customer paths from a customer route file)`]:[]));
  return found;
}

// ---- Transitive imports (rules 3 to 6) ----
// violations() reads a file's own imports. A customer route or LLM file could still reach cost
// through a helper that imports pricing, or through a module that re-exports it, so rules 3 to 6
// also walk the module graph: every local module the file imports, what those import, and so on.
// The walk stops at the customer-safe repository module, the sanctioned boundary. A customer
// route's two named exceptions count only as the route's own direct imports, and past them the
// walk follows only what they re-export: anything an exception re-exports, the route can import
// through it. (A module reached through a helper is never an exception.)

/** A module's id: its repo path without the extension or a trailing /index, as imports name it. */
export const moduleId=(path:string)=>path.replace(/\.(?:tsx?|jsx?|mjs|cjs)$/,'').replace(/\/index$/,'');

/** Local names an import clause binds, each with its imported module: `a, {b as c, type d}`, `* as ns`. */
function importBindings(file:string,text:string){
  const bindings=new Map<string,string>();
  for(const m of text.matchAll(/\bimport\s+(?:type\s+)?([\w$\s,{}*]+?)\s*from\s*(['"])([^'"]+)\2/g)){
    const [target]=importsOf(file,`from '${m[3]}'`);
    const clause=m[1];
    const named=/\{([^}]*)\}/.exec(clause)?.[1]??'';
    const outside=clause.replace(/\{[^}]*\}/,'');
    for(const part of named.split(','))
      {const name=part.trim().replace(/^type\s+/,'').split(/\s+as\s+/).at(-1)?.trim();if(name)bindings.set(name,target);}
    for(const part of outside.split(',')){const name=part.trim().replace(/^\*\s*as\s+/,'');if(/^[\w$]+$/.test(name))bindings.set(name,target);}
  }
  return bindings;
}

/** Modules `text` re-exports: `export * from 'm'`, `export {a} from 'm'`, and `export {a}` of a binding imported from 'm'. */
export function reexportsOf(file:string,text:string){
  const from=[...text.matchAll(/\bexport\s+(?:type\s+)?(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*(['"])([^'"]+)\1/g)]
    .flatMap(m=>importsOf(file,`from '${m[2]}'`));
  const bindings=importBindings(file,text);
  const local=[...text.matchAll(/\bexport\s+(?:type\s+)?\{([^}]*)\}(?!\s*from\b)/g)].flatMap(m=>m[1].split(','))
    .map(part=>part.trim().replace(/^type\s+/,'').split(/\s+as\s+/)[0].trim()).flatMap(name=>bindings.has(name)?[bindings.get(name)!]:[]);
  return [...new Set([...from,...local])].map(moduleId);
}

export interface ModuleNode {file:string;imports:string[];reexports:string[]}

/** The local module graph of `sources` (repo path to text), keyed by module id. */
export function moduleGraph(sources:ReadonlyMap<string,string>){
  const graph=new Map<string,ModuleNode>();
  for(const [file,text] of sources)graph.set(moduleId(file),{file,imports:[...new Set(importsOf(file,text).map(moduleId))],reexports:reexportsOf(file,text)});
  return graph;
}

/** Why `target` is off limits to customer routes, customer-facing code and LLM code, or null. */
const offLimits=(target:string)=>isInternalRepository(target)?`the internal repository; use ${CUSTOMER_MODULE}`:readsCost(target)?'it reads cost':null;

/**
 * Off-limits modules `file` reaches through at least one other module, as "a -> b -> c (why)".
 * Its own direct imports are violations()'s. Applies to customer routes, customer-facing server
 * code and LLM code (rules 3 to 6); other files, and tests, have no such rule.
 */
export function reachViolations(graph:ReadonlyMap<string,ModuleNode>,file:string){
  if(isTest(file))return [];
  const imports=graph.get(moduleId(file))?.imports??[];
  const llm=LLM_FILES.test(file)||imports.some(t=>t==='@anthropic-ai/sdk'||t.startsWith('@anthropic-ai/sdk/'));
  const route=CUSTOMER_ROUTE.test(file);
  if(!llm&&!route&&!file.startsWith(CUSTOMER_SERVER))return [];
  const exceptions:readonly string[]=route&&!llm?CUSTOMER_COST_EXCEPTIONS:[];
  const start=moduleId(file);
  const found:string[]=[];
  const seen=new Set<string>();
  const queue:{id:string;chain:string[];reexportsOnly:boolean}[]=[{id:start,chain:[start],reexportsOnly:false}];
  while(queue.length){
    const {id,chain,reexportsOnly}=queue.shift()!;
    const node=graph.get(id);
    if(!node)continue;
    for(const target of reexportsOnly?node.reexports:node.imports){
      const key=`${target}|${reexportsOnly}`;
      if(target===start||target===CUSTOMER_MODULE||seen.has(key))continue;
      seen.add(key);
      const next=[...chain,target];
      if(next.length===2&&exceptions.includes(target)){queue.push({id:target,chain:next,reexportsOnly:true});continue;}
      const why=offLimits(target);
      if(why){if(next.length>2)found.push(`${next.join(' -> ')} (${why})`);continue;}
      queue.push({id:target,chain:next,reexportsOnly});
    }
  }
  return found;
}

describe('repository boundary',()=>{
  const files=SCANNED.flatMap(sourceFiles).map(file=>file.split(sep).join('/'));

  it('scans the whole app',()=>{
    expect(files).toContain('src/app/api/query/[...path]/route.ts');
    expect(files).toContain('src/app/api/query/[...path]/customer.ts');
    expect(files).toContain('src/server/pipeline.ts');
    expect(files).toContain('src/server/chat/live.ts');
    expect(files).toContain('src/server/upsells-writer/claude.ts');
    expect(files).toContain('src/app/api/query/customer/quote-requests/route.ts');
    expect(files).toContain('src/app/api/query/customer/quotes/[id]/accept/route.ts');
    expect(files).toContain('src/app/api/query/customer/quotes/[id]/request-changes/route.ts');
    expect(files).toContain('src/server/customer-response/service.ts');
    expect(files).toContain('src/server/customer/notices.ts');
    expect(files).toContain('src/server/customer/quote-preview.ts');
    expect(files.length).toBeGreaterThan(40);
  });

  it('finds no SQL or database access outside the repository, and LLM code and customer routes use only the customer module',()=>{
    const found=files.flatMap(file=>violations(file,readFileSync(join(ROOT,file),'utf8')));
    expect(found).toEqual([]);
  });

  it('finds no customer route, customer-facing code or LLM code reaching cost or the internal repository through another module',()=>{
    const graph=moduleGraph(new Map(files.map(file=>[file,readFileSync(join(ROOT,file),'utf8')])));
    // The walk sees the real graph: the chat pipeline imports scripted chat, and the quote intake imports pricing.
    expect(graph.get('src/server/pipeline')?.imports).toContain('src/server/chat/scripted');
    expect(graph.get('src/server/intake/quote-request')?.imports).toEqual(expect.arrayContaining(['src/server/pricing','src/server/pricing/service']));
    expect(files.flatMap(file=>reachViolations(graph,file))).toEqual([]);
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

  it('keep the test database helpers in test files (rule 7)',()=>{
    expect(violations('src/server/rep/quotes.test.ts',"import {useSeededDatabase} from '@/server/repository/test-db';")).toEqual([]);
    expect(violations('src/components/rep/Settings.test.tsx',"import {SEED_DATE} from '../../server/repository/test-db';")).toEqual([]);
    expect(violations('src/server/rep/quotes.ts',"import {updateLiveRecord} from '@/server/repository/test-db';")).toHaveLength(1);
    expect(violations('src/server/repository/quotes.ts',"import {useSeededDatabase} from './test-db';")).toHaveLength(1);
    expect(violations('src/app/api/test/reset/route.ts',"const {updateLiveRecord}=await import('@/server/repository/test-db');")).toHaveLength(1);
    expect(violations('src/components/rep/test-fixtures.ts',"import {SEED_DATE} from '@/server/repository/test-db';")).toHaveLength(1);
    expect(violations('e2e/golden-quote-flow.spec.ts',"import {SEED_DATE} from '../src/server/repository/test-db';")).toHaveLength(1);
  });

  it('keep LLM code on the customer-safe module',()=>{
    expect(violations('src/server/pipeline.ts',"import {appendLog} from './repository/customer';")).toEqual([]);
    expect(violations('src/server/pipeline.ts',"import {quote} from './repository';")).toHaveLength(1);
    expect(violations('src/server/chat/tools.ts',"import {priceSources} from '@/server/repository/pricing';")).toHaveLength(1);
    expect(violations('src/server/answer.ts',"import Anthropic from '@anthropic-ai/sdk';\nimport {quote} from '@/server/repository';")).toHaveLength(1);
    expect(violations('src/server/chat/tools.test.ts',"import {quote} from '@/server/repository';")).toEqual([]);
    expect(violations('src/app/api/route.ts',"import {quote} from '@/server/repository';")).toEqual([]);
  });

  it('keep LLM code away from the services that read cost (task 1.1 carry-forward)',()=>{
    expect(violations('src/server/chat/live.ts',"import {suggestPrice} from '@/server/pricing';")).toHaveLength(1);
    expect(violations('src/server/chat/tools.ts',"import {floorFor} from '@/server/floors/service';")).toHaveLength(1);
    expect(violations('src/server/pipeline.ts',"import {upsellsFor} from './upsells';")).toHaveLength(1);
    expect(violations('src/server/chat/x.ts',"import {sendQuote} from '../quotes/service';")).toHaveLength(1);
    expect(violations('src/server/answer.ts',"import Anthropic from '@anthropic-ai/sdk';\nimport {explain} from '@/server/pricing/explain';")).toHaveLength(1);
    // The pure quote lifecycle and matching barrels read no cost.
    expect(violations('src/server/chat/tools.ts',"import {matchLine} from '@/server/matching';\nimport {canSend} from '@/server/quotes';")).toEqual([]);
    // Claude's upsell wording (task 3.6) is LLM code, the whole folder: it gets cost-free chip facts, never the chips.
    expect(violations('src/server/upsells-writer/claude.ts',"import Anthropic from '@anthropic-ai/sdk';\nimport {quoteUpsells} from '@/server/upsells/service';")).toHaveLength(1);
    expect(violations('src/server/upsells-writer/facts.ts',"import type {Upsell} from '@/server/upsells';")).toHaveLength(1);
    expect(violations('src/server/upsells-writer/facts.ts',"import {priceLines} from '../pricing/service';")).toHaveLength(1);
    expect(violations('src/server/upsells-writer/claude.ts',"import {chatModel} from '@/server/chat/mode';\nimport {costKeys} from './facts';")).toEqual([]);
    // Rep-side code may use them.
    expect(violations('src/server/rep/quote-upsells.ts',"import {quoteUpsells} from '@/server/upsells/service';\nimport {upsellWriter} from '@/server/upsells-writer/claude';")).toEqual([]);
    expect(violations('src/app/api/rep/route.ts',"import {suggestPrice} from '@/server/pricing';")).toEqual([]);
    expect(violations('src/server/pricing/service.test.ts',"import {suggestPrice} from '@/server/pricing';")).toEqual([]);
  });

  it('keep customer routes off the services that read cost, except the one named quote intake (task 2.3)',()=>{
    const route='src/app/api/query/customer/quote-requests/route.ts';
    expect(violations(route,"import {requestQuote} from '@/server/intake/quote-request';")).toEqual([]);
    expect(violations(route,"import {priceLines} from '@/server/pricing/service';")).toHaveLength(1);
    expect(violations(route,"import {draftLineFields} from '@/server/pricing';")).toHaveLength(1);
    expect(violations(route,"import {quoteUpsells} from '@/server/upsells/service';")).toHaveLength(1);
    expect(violations(route,"import {sendQuote} from '@/server/quotes/service';")).toHaveLength(1);
    expect(violations('src/app/api/query/[...path]/customer.ts',"import {floorFor} from '@/server/floors';")).toHaveLength(1);
    // Only that one file: not the rest of the intake folder, and not by a relative path elsewhere.
    expect(violations(route,"import {x} from '@/server/intake';")).toHaveLength(1);
    expect(violations(route,"import {x} from '@/server/intake/other';")).toHaveLength(1);
    expect(violations('src/app/customer/page.tsx',"import {requestQuote} from '../../server/intake/quote-request';")).toEqual([]);
    // LLM code may not reach it at all; rep-side code may.
    expect(violations('src/server/chat/clarify.ts',"import {requestQuote} from '@/server/intake/quote-request';")).toHaveLength(1);
    expect(violations('src/server/pipeline.ts',"import {requestQuote} from './intake/quote-request';")).toHaveLength(1);
    expect(violations('src/app/api/rep/route.ts',"import {priceLines} from '@/server/pricing/service';")).toEqual([]);
  });

  it('let customer routes call the customer response service, and only that file of its folder (task 5.2)',()=>{
    for(const route of ['src/app/api/query/customer/quotes/[id]/accept/route.ts','src/app/api/query/customer/quotes/[id]/request-changes/route.ts']){
      expect(violations(route,"import {acceptCustomerQuote,parseIdempotencyKey} from '@/server/customer-response/service';")).toEqual([]);
      // Not the quote service it wraps, not the rest of its folder.
      expect(violations(route,"import {acceptQuote} from '@/server/quotes/service';")).toHaveLength(1);
      expect(violations(route,"import {x} from '@/server/customer-response';")).toHaveLength(1);
      expect(violations(route,"import {x} from '@/server/customer-response/other';")).toHaveLength(1);
      expect(violations(route,"import {quote} from '@/server/repository';")).toHaveLength(1);
    }
    // LLM code and the customer-facing server logic (rule 6, no exception) may not reach it.
    expect(violations('src/server/chat/tools.ts',"import {acceptCustomerQuote} from '@/server/customer-response/service';")).toHaveLength(1);
    expect(violations('src/server/pipeline.ts',"import {requestCustomerChanges} from './customer-response/service';")).toHaveLength(1);
    expect(violations('src/server/customer/notices.ts',"import {acceptCustomerQuote} from '@/server/customer-response/service';")).toHaveLength(1);
    // Rep-side code may.
    expect(violations('src/app/api/rep/route.ts',"import {acceptCustomerQuote} from '@/server/customer-response/service';")).toEqual([]);
  });

  it('keep the customer-facing server logic on the customer-safe module and off cost readers, with no exception (task 5.1)',()=>{
    expect(violations('src/server/customer/notices.ts',"import {quoteNotices} from '@/server/repository/customer';\nimport {effectiveStatus} from '@/server/quotes';")).toEqual([]);
    expect(violations('src/server/customer/quote-preview.ts',"import {quote} from '@/server/repository';")).toHaveLength(1);
    expect(violations('src/server/customer/quote-preview.ts',"import {quoteRevision} from '@/server/repository/quotes';")).toHaveLength(1);
    expect(violations('src/server/customer/notices.ts',"import {sendQuote} from '@/server/quotes/service';")).toHaveLength(1);
    expect(violations('src/server/customer/notices.ts',"import {requestQuote} from '@/server/intake/quote-request';")).toHaveLength(1);
    expect(violations('src/server/customer/sidebar.ts',"import {floorFor} from '../floors';")).toHaveLength(1);
    expect(violations('src/server/customer/notices.test.ts',"import {quote} from '@/server/repository';")).toEqual([]);
  });

  describe('follow imports and re-exports through other modules (cleanup 7)',()=>{
    const ROUTE='src/app/api/query/customer/quote-requests/route.ts';
    const ACCEPT='src/app/api/query/customer/quotes/[id]/accept/route.ts';
    const reach=(sources:Record<string,string>,file:string)=>reachViolations(moduleGraph(new Map(Object.entries(sources))),file);

    it('reads re-exports: export * / {a} from, and export {a} of an imported binding',()=>{
      expect(reexportsOf('src/server/x.ts',"export * from './a';\nexport {b,c as d} from '@/server/b';\nexport type {E} from '../lib/e';")).toEqual(['src/server/a','src/server/b','src/lib/e']);
      expect(reexportsOf('src/server/x.ts',"import {priceLines as p,type Q} from '@/server/pricing/service';\nimport * as floors from '@/server/floors';\nimport def,{x} from './d';\nexport {p,floors as f,def};")).toEqual(['src/server/pricing/service','src/server/floors','src/server/d']);
      // Importing without re-exporting is not a re-export.
      expect(reexportsOf('src/server/x.ts',"import {priceLines} from '@/server/pricing/service';\nexport {other};\nexport const y=1;")).toEqual([]);
      expect(moduleId('src/server/pricing/index.ts')).toBe('src/server/pricing');
      expect(moduleId('src/server/pricing/index')).toBe('src/server/pricing');
    });

    it('catch a customer route reaching cost or the internal repository through a helper',()=>{
      const helper='src/lib/quote-help.ts';
      expect(reach({[ROUTE]:"import {help} from '@/lib/quote-help';",[helper]:"import {priceLines} from '@/server/pricing/service';"},ROUTE))
        .toEqual(['src/app/api/query/customer/quote-requests/route -> src/lib/quote-help -> src/server/pricing/service (it reads cost)']);
      expect(reach({[ROUTE]:"import {help} from '@/lib/quote-help';",[helper]:"import {x} from './deeper';",'src/lib/deeper.ts':"import {quote} from '@/server/repository/quotes';"},ROUTE))
        .toEqual([expect.stringMatching(/quote-help -> src\/lib\/deeper -> src\/server\/repository\/quotes \(the internal repository/)]);
      // A helper that re-exports a cost reader is the same.
      expect(reach({[ROUTE]:"import {priceLines} from './prices';",'src/app/api/query/customer/quote-requests/prices.ts':"export {priceLines} from '@/server/pricing/service';"},ROUTE)).toHaveLength(1);
      // Clean helpers, and the customer-safe module (which itself re-exports internal modules), pass.
      expect(reach({[ROUTE]:"import {help} from '@/lib/quote-help';",[helper]:"import {history} from '@/server/repository/customer';\nimport {canSend} from '@/server/quotes';",
        'src/server/repository/customer.ts':"export {history} from './chat';",'src/server/quotes/index.ts':"export * from './lifecycle';"},ROUTE)).toEqual([]);
    });

    it('let a customer route import its two named exceptions directly, which may read cost, but not what they re-export',()=>{
      const intake='src/server/intake/quote-request.ts';
      const response='src/server/customer-response/service.ts';
      const readsPricing="import {priceLines} from '@/server/pricing/service';\nimport {quote} from '@/server/repository';\nexport function requestQuote(){}";
      expect(reach({[ROUTE]:"import {requestQuote} from '@/server/intake/quote-request';",[intake]:readsPricing},ROUTE)).toEqual([]);
      expect(reach({[ACCEPT]:"import {acceptCustomerQuote} from '@/server/customer-response/service';",[response]:"import {acceptQuote} from '@/server/quotes/service';"},ACCEPT)).toEqual([]);
      // A re-export from an exception hands the route a cost reader: export {a} from, export *, or a re-exported import.
      for(const text of [
        "export {priceLines} from '@/server/pricing/service';",
        "export * from '@/server/floors/service';",
        "import {priceLines} from '@/server/pricing/service';\nexport {priceLines};",
        "import {quote} from '@/server/repository';\nexport {quote as internalQuote};",
      ])expect(reach({[ROUTE]:"import {requestQuote,priceLines} from '@/server/intake/quote-request';",[intake]:text},ROUTE)).toHaveLength(1);
      // ...also through a chain of re-exports.
      expect(reach({[ACCEPT]:"import {x} from '@/server/customer-response/service';",[response]:"export * from '@/lib/parts';",'src/lib/parts.ts':"export {sendQuote} from '@/server/quotes/service';"},ACCEPT))
        .toEqual(['src/app/api/query/customer/quotes/[id]/accept/route -> src/server/customer-response/service -> src/lib/parts -> src/server/quotes/service (it reads cost)']);
      // Safe re-exports from an exception pass.
      expect(reach({[ROUTE]:"import {requestQuote,QUOTE_LIMIT} from '@/server/intake/quote-request';",[intake]:`${readsPricing}\nexport {QUOTE_LIMIT} from '@/lib/limits';`,'src/lib/limits.ts':'export const QUOTE_LIMIT=1;'},ROUTE)).toEqual([]);
      // An exception reached through a helper is no exception.
      expect(reach({[ROUTE]:"import {x} from '@/lib/quote-help';",'src/lib/quote-help.ts':"import {requestQuote} from '@/server/intake/quote-request';",[intake]:readsPricing},ROUTE)).toHaveLength(1);
    });

    it('catch LLM code and customer-facing server code reaching cost through a helper, with no exception',()=>{
      const helper='src/lib/wording.ts';
      const viaHelper={[helper]:"import {suggestPrice} from '@/server/pricing';"};
      expect(reach({'src/server/chat/tools.ts':"import {w} from '@/lib/wording';",...viaHelper},'src/server/chat/tools.ts')).toHaveLength(1);
      expect(reach({'src/server/answer.ts':"import Anthropic from '@anthropic-ai/sdk';\nimport {w} from '@/lib/wording';",...viaHelper},'src/server/answer.ts')).toHaveLength(1);
      expect(reach({'src/server/customer/notices.ts':"import {w} from '@/lib/wording';",...viaHelper},'src/server/customer/notices.ts')).toHaveLength(1);
      const intake={'src/lib/intake-help.ts':"import {requestQuote} from '@/server/intake/quote-request';"};
      expect(reach({'src/server/pipeline.ts':"import {x} from '@/lib/intake-help';",...intake},'src/server/pipeline.ts')).toHaveLength(1);
      expect(reach({'src/server/customer/sidebar.ts':"import {x} from '@/lib/intake-help';",...intake},'src/server/customer/sidebar.ts')).toHaveLength(1);
      // Rep-side code and tests have no such rule; a cycle ends the walk.
      expect(reach({'src/server/rep/quotes.ts':"import {w} from '@/lib/wording';",...viaHelper},'src/server/rep/quotes.ts')).toEqual([]);
      expect(reach({'src/server/chat/tools.test.ts':"import {w} from '@/lib/wording';",...viaHelper},'src/server/chat/tools.test.ts')).toEqual([]);
      expect(reach({'src/server/chat/a.ts':"import {b} from '@/lib/b';",'src/lib/b.ts':"import {a} from '@/server/chat/a';"},'src/server/chat/a.ts')).toEqual([]);
    });
  });

  it('keep customer routes on the customer-safe module, and customer paths in customer route files (task 0.3 carry-forward)',()=>{
    expect(violations('src/app/api/query/[...path]/customer.ts',"import {history} from '@/server/repository/customer';")).toEqual([]);
    expect(violations('src/app/api/query/[...path]/customer.ts',"const {history}=await import('@/server/repository');")).toHaveLength(1);
    expect(violations('src/app/api/customer/quotes/route.ts',"import {quote} from '@/server/repository/quotes';")).toHaveLength(1);
    expect(violations('src/app/customer/page.tsx',"import {quotes} from '@/server/repository';")).toHaveLength(1);
    expect(violations('src/app/api/query/[...path]/route.ts',"if(path==='customer/panel')return json(aggregateAccess([id]));")).toHaveLength(1);
    expect(violations('src/app/api/query/[...path]/route.ts',"if(segments[0]==='customer')return x;")).toHaveLength(1);
    expect(violations('src/app/api/query/[...path]/route.ts',"if(user.role==='customer_user'&&user.customer_id)return customerRoute(request);")).toEqual([]);
    expect(violations('src/app/api/query/[...path]/route.ts',"import {customerIds,customers} from '@/server/repository';")).toEqual([]);
    // The route files under customer/ are customer routes too.
    expect(violations('src/app/api/query/customer/quotes/route.ts',"import {quotes} from '@/server/repository';")).toHaveLength(1);
    // The rep's Customers views are not customer routes.
    expect(violations('src/app/customers/page.tsx',"import {customers} from '@/server/repository';")).toEqual([]);
    expect(violations('src/app/api/query/[...path]/route.ts',"if(path==='supplier/customers')return json(customers());")).toEqual([]);
  });
});
