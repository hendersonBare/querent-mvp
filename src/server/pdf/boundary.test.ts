import {existsSync,readFileSync} from 'node:fs';
import {dirname,join,relative,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// The customer's PDF path (task 4.1) stays customer-safe all the way down. repository/boundary.test.ts
// checks the customer route file's own imports; this follows every local import it reaches, so a
// shared PDF module can't pull in the internal repository, a service that reads cost, the rep's
// loader or the internal worksheet (task 4.2).

const ROOT=resolve(__dirname,'../../..');
const ENTRY='src/app/api/quotes/[id]/pdf/customer.ts';
const ROUTE='src/app/api/quotes/[id]/pdf/route.ts';
/** The customer-safe repository module re-exports internal modules by design; repository/customer.test.ts guards it. */
const CUSTOMER_MODULE='src/server/repository/customer.ts';
/** The internal worksheet (task 4.2): its loader, model and document. Rep-only. */
const WORKSHEET=/^src\/server\/pdf\/(internal|worksheet|InternalWorksheetPdf)\.tsx?$/;
const COST_READERS=[/^src\/server\/repository\//,/^src\/server\/db\//,/^src\/server\/(pricing|floors|upsells|freight)\//,/^src\/server\/quotes\/service/,/^src\/server\/pdf\/(rep|draft)\.ts$/,WORKSHEET];
const IMPORT=/(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)(['"])([^'"]+)\1/gm;

function resolveLocal(from:string,spec:string){
  const base=spec.startsWith('@/')?join(ROOT,'src',spec.slice(2)):spec.startsWith('.')?resolve(dirname(join(ROOT,from)),spec):null;
  const file=base&&[`${base}.ts`,`${base}.tsx`,join(base,'index.ts'),base].find(p=>/\.tsx?$/.test(p)&&existsSync(p));
  return file?relative(ROOT,file).split('\\').join('/'):null;
}

/** [importer, imported] for every local import reachable from `entry`, stopping at the customer module. */
function edges(entry=ENTRY){
  const seen=new Set<string>(),found:[string,string][]=[];
  const visit=(file:string)=>{
    if(seen.has(file)||file===CUSTOMER_MODULE)return;
    seen.add(file);
    for(const [,,spec] of readFileSync(join(ROOT,file),'utf8').matchAll(IMPORT)){
      const target=resolveLocal(file,spec);
      if(target){found.push([file,target]);visit(target);}
    }
  };
  visit(entry);
  return found;
}

describe('the customer PDF path',()=>{
  const all=edges();

  it('reaches the PDF model, the shared frame and document and the customer-safe repository module',()=>{
    expect(all.map(([,to])=>to)).toEqual(expect.arrayContaining(['src/server/pdf/model.ts','src/server/pdf/layout.tsx','src/server/pdf/CustomerQuotePdf.tsx','src/server/pdf/http.ts',CUSTOMER_MODULE]));
  });

  it('reaches nothing that reads cost: no internal repository, db, pricing, floors, upsells, quote service, the rep\'s loader or the internal worksheet',()=>{
    expect(all.filter(([,to])=>to!==CUSTOMER_MODULE&&COST_READERS.some(p=>p.test(to)))).toEqual([]);
  });

  it('would catch a shared PDF module importing the rep\'s loader or the internal worksheet',()=>{
    for(const file of ['src/server/pdf/rep.ts','src/server/repository/quotes.ts','src/server/pdf/internal.ts','src/server/pdf/worksheet.ts','src/server/pdf/InternalWorksheetPdf.tsx'])
      expect(COST_READERS.some(p=>p.test(file)),file).toBe(true);
    for(const file of ['src/server/pdf/model.ts','src/server/pdf/layout.tsx','src/server/pdf/http.ts'])expect(COST_READERS.some(p=>p.test(file)),file).toBe(false);
  });
});

describe('the internal worksheet (task 4.2)',()=>{
  it('is reached from the route only through the rep\'s side: the route imports it, the customer path never does',()=>{
    const route=edges(ROUTE);
    expect(route).toEqual(expect.arrayContaining([[ROUTE,'src/server/pdf/internal.ts'],[ROUTE,'src/server/pdf/InternalWorksheetPdf.tsx']]));
    expect(edges().filter(([,to])=>WORKSHEET.test(to))).toEqual([]);
  });

  it('keeps the shared PDF modules free of the worksheet, so the customer path can\'t pick it up through them',()=>{
    for(const shared of ['src/server/pdf/http.ts','src/server/pdf/layout.tsx','src/server/pdf/model.ts','src/server/pdf/request.ts'])
      expect(edges(shared).filter(([,to])=>WORKSHEET.test(to)),shared).toEqual([]);
  });
});
