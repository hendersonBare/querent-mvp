// @vitest-environment node
import {existsSync,readdirSync,readFileSync,statSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// Defense in depth (docs/boxt/plan.md product rule 7): the proxy gates every request, and every page and
// API checks the session again itself. Each page and layout under src/app/(app)/ calls requireUser();
// each route handler under src/app/api/ calls requireApiUser() or is wrapped in withApiUser(), except
// the auth APIs that must work without a session (they check what they need themselves).

const ROOT=resolve(__dirname,'../../..');
const APP=join(ROOT,'src/app');
function walk(dir:string):string[]{
  if(!existsSync(dir))return [];
  return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?walk(path):[path];});
}
const rel=(p:string)=>relative(ROOT,p).split('\\').join('/');

/** Auth APIs that run without a session: sign in, reset request, sign out; update-password checks the recovery session itself. */
const SESSIONLESS_APIS=['login','reset','signout','update-password'].map(name=>`src/app/api/auth/${name}/route.ts`);

describe('every signed-in page and API checks the session itself',()=>{
  it('pages and layouts under (app) call requireUser()',()=>{
    const files=walk(join(APP,'(app)')).filter(p=>/\/(page|layout)\.tsx$/.test(p));
    expect(files.length).toBeGreaterThanOrEqual(4);
    expect(files.filter(p=>!/\brequireUser\s*\(/.test(readFileSync(p,'utf8'))).map(rel)).toEqual([]);
  });

  it('route handlers under /api call requireApiUser() or withApiUser()',()=>{
    const files=walk(join(APP,'api')).filter(p=>/\/route\.ts$/.test(p)).map(rel);
    expect(files).toEqual(expect.arrayContaining(SESSIONLESS_APIS));
    const unguarded=files.filter(f=>!SESSIONLESS_APIS.includes(f)&&!/\b(?:requireApiUser|withApiUser)\s*\(/.test(readFileSync(join(ROOT,f),'utf8')));
    expect(unguarded).toEqual([]);
  });

  it('update-password refuses a request without a session',()=>{
    expect(readFileSync(join(ROOT,'src/app/api/auth/update-password/route.ts'),'utf8')).toMatch(/\bgetUser\s*\(/);
  });
});
