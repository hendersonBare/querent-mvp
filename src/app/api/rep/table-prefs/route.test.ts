import {NextRequest} from 'next/server';
import {describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// GET /api/rep/table-prefs?table=<id> and PUT /api/rep/table-prefs (plan U0): the signed-in user's
// column order and hidden columns for one table. The user always comes from the session, never from
// the request, so a rep cannot read or write anyone else's prefs. 401 without a session, 403 for the
// customer, never cached.
useSeededDatabase();

type Persona='supplier'|'mara'|'eli'|'customer'|null;
async function call(method:'GET'|'PUT',{table,body,persona='mara'}:{table?:string;body?:unknown;persona?:Persona}={}){
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(persona)headers.cookie=`querent-persona=${persona}`;
  const url=`http://127.0.0.1/api/rep/table-prefs${table===undefined?'':`?table=${encodeURIComponent(table)}`}`;
  const request=new NextRequest(url,{method,headers,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)});
  const route=await import('./route');
  const response=method==='GET'?await route.GET(request):await route.PUT(request);
  return {status:response.status,cache:response.headers.get('cache-control'),json:await response.json()};
}

const PREFS={table_id:'quotes',column_order:['customer','quote','status','total'],hidden_columns:['margin']};

describe('who may use the table prefs routes',()=>{
  it('refuses no session with 401 and the customer with 403, on GET and PUT',async()=>{
    expect(await call('GET',{table:'quotes',persona:null})).toMatchObject({status:401});
    expect(await call('PUT',{body:PREFS,persona:null})).toMatchObject({status:401});
    expect(await call('GET',{table:'quotes',persona:'customer'})).toMatchObject({status:403});
    expect(await call('PUT',{body:PREFS,persona:'customer'})).toMatchObject({status:403});
  });
});

describe('GET and PUT /api/rep/table-prefs',()=>{
  it('answers null prefs before anything is saved, never cached',async()=>{
    expect(await call('GET',{table:'quotes'})).toEqual({status:200,cache:expect.stringMatching(/no-store/),json:{table_id:'quotes',prefs:null}});
  });

  it('saves the signed-in user\'s prefs and reads them back',async()=>{
    const saved=await call('PUT',{body:PREFS});
    expect(saved).toMatchObject({status:200,cache:expect.stringMatching(/no-store/),json:{table_id:'quotes',prefs:{column_order:PREFS.column_order,hidden_columns:['margin']}}});
    expect((await call('GET',{table:'quotes'})).json).toEqual({table_id:'quotes',prefs:{column_order:PREFS.column_order,hidden_columns:['margin']}});
  });

  it('keeps prefs per user and per table',async()=>{
    expect((await call('GET',{table:'quotes',persona:'eli'})).json.prefs).toBeNull();
    expect((await call('GET',{table:'quotes',persona:'supplier'})).json.prefs).toBeNull();
    expect((await call('GET',{table:'customers'})).json.prefs).toBeNull();
    await call('PUT',{persona:'eli',body:{table_id:'quotes',column_order:['quote'],hidden_columns:[]}});
    expect((await call('GET',{table:'quotes'})).json.prefs.column_order).toEqual(PREFS.column_order);
    expect((await call('GET',{table:'quotes',persona:'eli'})).json.prefs.column_order).toEqual(['quote']);
  });

  it('refuses a body that names another user, leaving their prefs alone',async()=>{
    const attempt=await call('PUT',{persona:'mara',body:{...PREFS,user_id:'eli',column_order:['status']}});
    expect(attempt).toMatchObject({status:400,json:{detail:expect.stringMatching(/user_id/)}});
    expect((await call('GET',{table:'quotes',persona:'eli'})).json.prefs.column_order).toEqual(['quote']);
    const query=await call('GET',{table:'quotes&user_id=eli',persona:'mara'});
    expect(query.json.prefs.column_order).toEqual(PREFS.column_order);
  });

  it('refuses a missing or malformed table id, column lists that are not lists of ids, and non-JSON',async()=>{
    expect(await call('GET',{})).toMatchObject({status:400,json:{detail:expect.any(String)}});
    expect(await call('GET',{table:'Quotes!'})).toMatchObject({status:400});
    expect(await call('PUT',{body:{...PREFS,table_id:''}})).toMatchObject({status:400});
    expect(await call('PUT',{body:{...PREFS,column_order:'quote,customer'}})).toMatchObject({status:400});
    expect(await call('PUT',{body:{...PREFS,column_order:['quote','quote']}})).toMatchObject({status:400});
    expect(await call('PUT',{body:{...PREFS,hidden_columns:[42]}})).toMatchObject({status:400});
    expect(await call('PUT',{body:{...PREFS,column_order:Array.from({length:41},(_,i)=>`c${i}`)}})).toMatchObject({status:400});
    expect(await call('PUT',{body:'not json'})).toMatchObject({status:400});
    expect((await call('GET',{table:'quotes'})).json.prefs.column_order).toEqual(PREFS.column_order);
  });
});
