import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// The TODO registry guard (v3 decision 40; spec §12 "TODO registry"; task F1): every TODO(R-n)
// marker in src/ names an ID that docs/todo-registry.md lists, and every ID the registry places in
// code is marked there at least once. R-13 (tooling) lives in the registry only.

const ROOT=resolve(__dirname,'..');
const REGISTRY=join(ROOT,'docs/todo-registry.md');
const SELF=relative(ROOT,__filename);

function files(dir:string):string[]{
  return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?files(path):/\.(ts|tsx|css|sql)$/.test(name)?[path]:[];});
}
/** Every TODO(R-n) in src/, as [file, id]; this test's own examples aside. */
const markers=()=>files(join(ROOT,'src')).filter(f=>relative(ROOT,f)!==SELF)
  .flatMap(f=>[...readFileSync(f,'utf8').matchAll(/TODO\((R-\d+)\)/g)].map(m=>[relative(ROOT,f),m[1]] as const));
/** The registry's rows: | R-n | TODO | Where |. */
const rows=()=>[...readFileSync(REGISTRY,'utf8').matchAll(/^\|\s*(R-\d+)\s*\|([^|]+)\|([^|]+)\|/gm)].map(m=>({id:m[1],todo:m[2].trim(),where:m[3].trim()}));

describe('the TODO registry',()=>{
  it('exists and lists R-1 to R-14, once each and in order',()=>{
    expect(existsSync(REGISTRY)).toBe(true);
    expect(rows().map(r=>r.id)).toEqual(Array.from({length:14},(_,i)=>`R-${i+1}`));
  });

  it('carries the decision log\'s wording for each TODO',()=>{
    const log=readFileSync(join(ROOT,'docs/plans/decision-log.md'),'utf8');
    const logged=Object.fromEntries([...log.matchAll(/^\|\s*(R-\d+)\s*\|([^|]+)\|/gm)].map(m=>[m[1],m[2].trim()]));
    for(const r of rows())expect(r.todo,r.id).toBe(logged[r.id]);
  });

  it('knows every TODO(R-n) marker in src/',()=>{
    const known=new Set(rows().map(r=>r.id));
    expect(markers().filter(([,id])=>!known.has(id)).map(([file,id])=>`${file}: ${id}`)).toEqual([]);
  });

  it('finds every ID it places in code marked in src/ at least once, and R-13 nowhere',()=>{
    const marked=new Set(markers().map(([,id])=>id));
    const inCode=rows().filter(r=>!/registry only/i.test(r.where));
    expect(inCode.map(r=>r.id).filter(id=>!marked.has(id))).toEqual([]);
    expect(marked.has('R-13')).toBe(false);
  });

  it('marks the demo auth, the PII layer and the test routes (R-4, R-5, R-6) where the work will go',()=>{
    const at=(id:string)=>new Set(markers().filter(([,m])=>m===id).map(([file])=>file));
    expect(at('R-4')).toContain('src/server/session.ts');
    expect(at('R-5')).toContain('src/server/repository/chat.ts');
    for(const route of ['reset','rep-quotes'])expect(at('R-6'),route).toContain(`src/app/api/test/${route}/route.ts`);
  });

  it('marks the visitor box\'s stub (R-14, decision 49) where the real anonymous route will go',()=>{
    const at=new Set(markers().filter(([,m])=>m==='R-14').map(([file])=>file));
    expect(at).toContain('src/app/api/query/visitor/chat/route.ts');
  });
});
