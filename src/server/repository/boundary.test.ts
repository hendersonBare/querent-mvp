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

const ROOT=resolve(__dirname,'../../..');
const SCANNED=['src','scripts','e2e'];
const SQL_HOME=['src/server/repository/','src/server/db/'];
const DB_IMPORTERS=[...SQL_HOME,'scripts/'];
/** LLM code: the chat pipeline, anything under these folders (upsells-writer: Claude's chip wording, task 3.6), and any file that imports the Anthropic SDK. */
const LLM_FILES=/^src\/server\/(pipeline\.ts$|(chat|llm|tools|agent|upsells-writer)\/)/;
const CUSTOMER_MODULE='src/server/repository/customer';
/** Server modules that read cost, margin or floors. LLM code may not import them, and customer routes only CUSTOMER_INTAKE. */
const COST_READERS=['src/server/pricing','src/server/floors','src/server/upsells','src/server/quotes/service','src/server/intake','src/server/customer-response'];
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
