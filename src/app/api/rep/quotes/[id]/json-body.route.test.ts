import {NextRequest} from 'next/server';
import {expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// Every quote-detail route that takes a body (tasks 3.3 to 3.7) answers a body that isn't a JSON
// object with a plain 400, not the validator's wording ("Invalid input: expected object, received
// undefined"), and changes nothing (cleanup 15). An empty body reads as {}, so the validator names
// what is missing.
useSeededDatabase();

type Handler=(request:NextRequest,context:{params:Promise<Record<string,string>>})=>Promise<Response>;
type Route={path:string;method:'POST'|'PATCH'|'PUT';load:()=>Promise<object>;params?:Record<string,string>};
const ROUTES:Route[]=[
  {path:'lines',method:'POST',load:()=>import('./lines/route')},
  {path:'lines/q-24817-1',method:'PATCH',load:()=>import('./lines/[lineId]/route'),params:{lineId:'q-24817-1'}},
  {path:'freight',method:'PUT',load:()=>import('./freight/route')},
  {path:'fulfillment',method:'PATCH',load:()=>import('./fulfillment/route')},
  {path:'terms',method:'PATCH',load:()=>import('./terms/route')},
  {path:'notes',method:'POST',load:()=>import('./notes/route')},
  {path:'upsells',method:'POST',load:()=>import('./upsells/route')},
  {path:'send',method:'POST',load:()=>import('./send/route')},
];

async function call({path,method,load,params={}}:Route,body:string){
  const route=await load() as Record<Route['method'],Handler>;
  const request=new NextRequest(`http://127.0.0.1/api/rep/quotes/Q-24817/${path}`,{method,body,
    headers:{'content-type':'application/json',cookie:'querent-persona=supplier','idempotency-key':`json-body-${path}-${body.length}`}});
  const response=await route[method](request,{params:Promise.resolve({id:'Q-24817',...params})});
  return {status:response.status,json:await response.json()};
}

it('refuses a body that is not a JSON object with a plain message, on every quote-detail route',async()=>{
  const {quote,quoteNotes}=await import('@/server/repository');
  const before=quote('q-24817');
  for(const route of ROUTES){
    for(const body of ['not json','{"qty":','42','"text"','[1,2]','null']){
      expect(await call(route,body),`${route.method} ${route.path} ${body}`).toEqual({status:400,json:{detail:'The request body must be a JSON object.',code:'invalid_input'}});
    }
  }
  expect(quote('q-24817')).toEqual(before);
  expect(quoteNotes('q-24817')).toEqual([]);
});

it('reads an empty body as {}, so the answer says what is missing instead of the validator\'s wording',async()=>{
  for(const route of ROUTES){
    const {status,json}=await call(route,'');
    expect(status,`${route.method} ${route.path}`).toBe(400);
    expect(json.code).toBe('invalid_input');
    expect(json.detail,`${route.method} ${route.path}`).not.toMatch(/invalid input|expected|received|undefined/i);
  }
});
