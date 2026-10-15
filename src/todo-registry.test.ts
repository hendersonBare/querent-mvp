import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// The TODO registry guard (v3 decision 40; spec §12 "TODO registry"; task F1): every TODO(R-n)
// marker in src/ names an ID that docs/todo-registry.md lists, in the decision log's wording. The BOXT
// branch (B0) removed the code most IDs were marked in, so the registry's "Where" column is history
// and no ID has to be marked in code.

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
});
