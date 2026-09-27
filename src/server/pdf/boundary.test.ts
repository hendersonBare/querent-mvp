import {existsSync,readFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// The customer's PDF path (task 4.1) stays customer-safe all the way down. repository/boundary.test.ts
// checks the customer route file's own imports; this follows every local import it reaches, so a
// shared PDF module can't pull in the internal repository or a service that reads cost.

const ROOT=resolve(__dirname,'../../..');
const ENTRY='src/app/api/quotes/[id]/pdf/customer.ts';
/** The customer-safe repository module re-exports internal modules by design; repository/customer.test.ts guards it. */
const CUSTOMER_MODULE='src/server/repository/customer.ts';
const COST_READERS=[/^src\/server\/repository\//,/^src\/server\/db\//,/^src\/server\/(pricing|floors|upsells|freight)\//,/^src\/server\/quotes\/service/,/^src\/server\/pdf\/(rep|draft)\.ts$/];
const IMPORT=/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm;

function resolveLocal(from:string,spec:string){
  const base=spec.startsWith('@/')?join(ROOT,'src',spec.slice(2)):spec.startsWith('.')?resolve(dirname(join(ROOT,from)),spec):null;
  const file=base&&[`${base}.ts`,`${base}.tsx`,join(base,'index.ts'),base].find(p=>/\.tsx?$/.test(p)&&existsSync(p));
  return file?relative(ROOT,file).split('\\').join('/'):null;
}

/** [importer, imported] for every local import reachable from ENTRY, stopping at the customer module. */
function edges(){
  const seen=new Set<string>(),found:[string,string][]=[];
  const visit=(file:string)=>{
    if(seen.has(file)||file===CUSTOMER_MODULE)return;
    seen.add(file);
    for(const [,,spec] of readFileSync(join(ROOT,file),'utf8').matchAll(IMPORT)){
      const target=resolveLocal(file,spec);
      if(target){found.push([file,target]);visit(target);}
    }
  };
  visit(ENTRY);
  return found;
}

describe('the customer PDF path',()=>{
  const all=edges();

  it('reaches the PDF model and document and the customer-safe repository module',()=>{
    expect(all.map(([,to])=>to)).toEqual(expect.arrayContaining(['src/server/pdf/model.ts','src/server/pdf/CustomerQuotePdf.tsx','src/server/pdf/http.ts',CUSTOMER_MODULE]));
  });

  it('reaches nothing that reads cost: no internal repository, db, pricing, floors, upsells, quote service or the rep\'s loader',()=>{
    expect(all.filter(([,to])=>to!==CUSTOMER_MODULE&&COST_READERS.some(p=>p.test(to)))).toEqual([]);
  });

  it('would catch a shared PDF module importing the rep\'s loader',()=>{
    expect(COST_READERS.some(p=>p.test('src/server/pdf/rep.ts'))).toBe(true);
    expect(COST_READERS.some(p=>p.test('src/server/repository/quotes.ts'))).toBe(true);
    expect(COST_READERS.some(p=>p.test('src/server/pdf/model.ts'))).toBe(false);
  });
});
