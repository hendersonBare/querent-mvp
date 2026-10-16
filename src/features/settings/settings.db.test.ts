// @vitest-environment node
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {adminQuery} from '../../../scripts/lib/local-admin';
import {DEV_USERS,devPassword} from '../../../scripts/lib/dev-users';
import {anonClient,signedInClient} from '../../../scripts/lib/test-clients';
import {POST as login} from '@/app/api/auth/login/route';
import {GET,PUT} from '@/app/api/settings/route';
import {getOrgSettings,setMatchStrictness,type Db} from '@/server/repository';

// The settings API against the local Supabase stack (npm run test:db): a dev user signs in through the
// login route, changes the match strictness with PUT /api/settings and reads it back with GET; another
// user sees the same organization setting; the change is logged as settings_change with the two levels
// only; without a session neither the API nor the anon key reaches org_settings. The file leaves the
// setting at strict.

const ORIGIN='http://127.0.0.1:3000';
const REP=DEV_USERS[0].email,REP2=DEV_USERS[1].email;

let cookie='';
let db:Db,db2:Db,userId:string;

async function signIn(){
  const response=await login(new NextRequest(`${ORIGIN}/api/auth/login`,{method:'POST',
    headers:{origin:ORIGIN,host:'127.0.0.1:3000','content-type':'application/json'},
    body:JSON.stringify({email:REP,password:devPassword()})}));
  expect(response.status).toBe(200);
  return response.headers.getSetCookie().map(line=>line.split(';')[0]).filter(pair=>!pair.endsWith('=')).join('; ');
}

const call=(method:string,body?:unknown,withCookie=true)=>new NextRequest(`${ORIGIN}/api/settings`,{method,
  headers:{origin:ORIGIN,host:'127.0.0.1:3000','content-type':'application/json',...withCookie?{cookie}:{}},
  body:body===undefined?undefined:JSON.stringify(body)});
const ctx={params:Promise.resolve({})};

const lastChange=()=>adminQuery('select metadata from public.activity_log where user_id=$1 and action=$2 order by id desc limit 1',[userId,'settings_change']);

beforeAll(async()=>{
  cookie=await signIn();
  ({db,userId}=await signedInClient(REP));
  ({db:db2}=await signedInClient(REP2));
  await setMatchStrictness(db,'strict');
});
afterAll(async()=>{await setMatchStrictness(db,'strict');});

describe('the settings API with a real session',()=>{
  it('PUT then GET: the new level persists for the whole organization and is logged with the two levels',async()=>{
    const put=await PUT(call('PUT',{matchStrictness:'balanced'}),ctx);
    expect(put.status).toBe(200);
    expect(await put.json()).toEqual({matchStrictness:'balanced'});

    const get=await GET(call('GET'),ctx);
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({matchStrictness:'balanced'});
    expect(await getOrgSettings(db2)).toMatchObject({matchStrictness:'balanced',updatedBy:userId});
    expect((await adminQuery('select match_strictness from public.org_settings where id=1'))[0].match_strictness).toBe('balanced');
    expect((await lastChange())[0].metadata).toEqual({from:'strict',to:'balanced'});

    const back=await PUT(call('PUT',{matchStrictness:'strict'}),ctx);
    expect(back.status).toBe(200);
    expect(await (await GET(call('GET'),ctx)).json()).toEqual({matchStrictness:'strict'});
    expect((await lastChange())[0].metadata).toEqual({from:'balanced',to:'strict'});
  });

  it('refuses an unknown level and leaves the setting as it was',async()=>{
    const response=await PUT(call('PUT',{matchStrictness:'reckless'}),ctx);
    expect(response.status).toBe(400);
    expect((await getOrgSettings(db)).matchStrictness).toBe('strict');
  });
});

describe('without a session',()=>{
  it('the API answers 401 to GET and PUT and changes nothing',async()=>{
    expect((await GET(call('GET',undefined,false),ctx)).status).toBe(401);
    expect((await PUT(call('PUT',{matchStrictness:'lenient'},false),ctx)).status).toBe(401);
    expect((await adminQuery('select match_strictness from public.org_settings where id=1'))[0].match_strictness).toBe('strict');
  });

  it('the anon key can neither read nor update org_settings (through the repository, as the app would)',async()=>{
    const anon=anonClient();
    await expect(getOrgSettings(anon)).rejects.toMatchObject({code:'42501'});
    expect(await setMatchStrictness(anon,'lenient')).toMatchObject({ok:false,error:'unauthorized'});
    expect((await adminQuery('select match_strictness from public.org_settings where id=1'))[0].match_strictness).toBe('strict');
  });
});
