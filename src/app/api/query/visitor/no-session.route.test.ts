import {readdirSync,statSync} from 'node:fs';
import {join,relative} from 'node:path';
import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// Appendix H "The anonymous query route cannot return prices, orders, quotes or account data" (plan U11;
// decision 49, R-14): a visitor has no session. Every customer-facing route under /api/query, and the
// quote PDF, is called here with no cookie, by every method it exports: each answers 401 with nothing
// but the "Choose a demo workspace." line, except the visitor box's stub, which answers only "Sign in to
// continue.". New routes are picked up from the file tree, so one added later is checked too.
useSeededDatabase();

const API=join(__dirname,'..','..');
const STUB='query/visitor/chat/route.ts';
const METHODS=['GET','POST','PUT','PATCH','DELETE'] as const;

function routes(dir:string):string[]{
  return readdirSync(dir).flatMap(name=>{const path=join(dir,name);return statSync(path).isDirectory()?routes(path):name==='route.ts'?[path]:[];});
}
const files=[...routes(join(API,'query')),...routes(join(API,'quotes'))].map(f=>relative(API,f)).sort();

/** A URL and params for the route file: real ids, so only the missing session can refuse. */
function target(file:string){
  const dir=file.replace(/\/route\.ts$/,'');
  const params={id:'q-24817',path:['customer','chat']};
  const url=dir.replace('[...path]','customer/chat').replace('[id]','q-24817');
  return {url:`http://127.0.0.1/api/${url}`,params};
}

describe('a visitor (no session) gets no account data from any /api/query route or the quote PDF',()=>{
  it('finds the customer routes, the catch-all, the PDF and the stub',()=>{
    expect(files).toEqual(expect.arrayContaining(['query/[...path]/route.ts','query/customer/orders/route.ts','query/customer/notifications/route.ts',
      'query/customer/quotes/[id]/route.ts','query/customer/contacts/picture/route.ts','quotes/[id]/pdf/route.ts',STUB]));
  });

  it.each(files.filter(f=>f!==STUB))('%s: 401 "Choose a demo workspace." for every method, and nothing else',async file=>{
    const route=await import(/* @vite-ignore */ join(API,file)) as Record<string,unknown>;
    const handlers=METHODS.filter(m=>typeof route[m]==='function');
    expect(handlers.length,file).toBeGreaterThan(0);
    const {url,params}=target(file);
    for(const method of handlers){
      const body=method==='GET'||method==='DELETE'?undefined:JSON.stringify({revision:1,question:'What did we pay for gloves?',all:true,lines:[]});
      const request=new NextRequest(url,{method,body,headers:{'content-type':'application/json'}});
      const response=await (route[method] as (r:NextRequest,c:{params:Promise<unknown>})=>Promise<Response>)(request,{params:Promise.resolve(params)});
      expect(response.status,`${method} ${file}`).toBe(401);
      expect(await response.json(),`${method} ${file}`).toEqual({detail:'Choose a demo workspace.'});
    }
  });

  it('the stub answers only "Sign in to continue." to a question about prices, orders, quotes or the account',async()=>{
    const {POST}=await import('./chat/route');
    for(const question of ['What did we pay for nitrile gloves?','Where is order SO-51223?','Show me quote Q-24817','What is our open balance?']){
      const response=await POST(new NextRequest('http://127.0.0.1/api/query/visitor/chat',{method:'POST',body:JSON.stringify({question}),headers:{'content-type':'application/json'}}));
      expect(await response.json()).toEqual({answer:'Sign in to continue.'});
    }
  });
});
