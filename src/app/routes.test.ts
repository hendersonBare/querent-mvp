import {readdirSync} from 'node:fs';
import {join,posix,resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

// The app's routes (docs/boxt/plan.md, B0): `/` sends the browser to the quote creation tool, and the
// only pages are the rail's three sections plus the auth pages and APIs (B2). Later tasks add their own
// routes to ROUTES here.

const APP=resolve(__dirname);
/** Every page and route handler under src/app/, as its URL path (route groups dropped). */
function routes(dir='.'):string[]{
  return readdirSync(join(APP,dir),{withFileTypes:true}).flatMap(entry=>{
    const path=posix.join(dir,entry.name);
    if(entry.isDirectory())return routes(path);
    if(!/^(page|route)\.(t|j)sx?$/.test(entry.name))return [];
    const url='/'+dir.split('/').filter(part=>part!=='.'&&!/^\(.*\)$/.test(part)).join('/');
    return [url];
  });
}

const ROUTES=[
  '/','/quote-tool','/quotes','/settings',
  // B2: auth pages and APIs (no sign-up route).
  '/login','/reset-password','/auth/confirm','/update-password',
  '/api/auth/login','/api/auth/signout','/api/auth/reset','/api/auth/update-password',
  // B6: a quote's page and the quotes API (POST /api/quotes is B5's, in the same route file).
  '/quotes/[id]','/api/quotes','/api/quotes/[id]',
];

describe('routes',()=>{
  it('are only /, the rail\'s three sections and the auth routes',()=>{
    expect(routes().sort()).toEqual([...ROUTES].sort());
  });

  it('send / to /quote-tool',async()=>{
    const {default:Home}=await import('./page');
    let thrown:unknown;
    try{Home();}catch(error){thrown=error;}
    // next/navigation's redirect() throws NEXT_REDIRECT;<type>;<url>;<status>;
    expect(String((thrown as {digest?:string})?.digest)).toMatch(/^NEXT_REDIRECT;\w+;\/quote-tool;307;/);
  });
});
