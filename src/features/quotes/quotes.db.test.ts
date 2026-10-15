// @vitest-environment node
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {NextRequest} from 'next/server';
import {adminQuery} from '../../../scripts/lib/local-admin';
import {DEV_USERS,devPassword} from '../../../scripts/lib/dev-users';
import {signedInClient} from '../../../scripts/lib/test-clients';
import {POST as login} from '@/app/api/auth/login/route';
import {GET as list} from '@/app/api/quotes/route';
import {DELETE,GET,PATCH} from '@/app/api/quotes/[id]/route';
import {EXAMPLE_QUOTE_ID,createQuote,deleteQuote,getQuote,type Db,type QuoteLineInput} from '@/server/repository';

// The quotes API against the local Supabase stack (npm run test:db): a dev user signs in through the
// login route, then lists, reads, edits and deletes quotes through the route handlers, which go through
// the repository with that user's session (RLS applies). Edits keep what the matcher stored on each
// line; the example quote is refused; activity rows hold counts only.

const ORIGIN='http://127.0.0.1:3000';
const TAG=`b6-db-test:${Date.now()}`;
const REP=DEV_USERS[0].email;

let cookie='';
let db:Db;
let userId:string;
/** Quotes this file created, removed again at the end (through the repository). */
const created:string[]=[];

async function signIn(){
  const response=await login(new NextRequest(`${ORIGIN}/api/auth/login`,{method:'POST',
    headers:{origin:ORIGIN,host:'127.0.0.1:3000','content-type':'application/json'},
    body:JSON.stringify({email:REP,password:devPassword()})}));
  expect(response.status).toBe(200);
  return response.headers.getSetCookie().map(line=>line.split(';')[0]).filter(pair=>!pair.endsWith('=')).join('; ');
}

const call=(method:string,path:string,body?:unknown)=>new NextRequest(`${ORIGIN}${path}`,{method,
  headers:{origin:ORIGIN,host:'127.0.0.1:3000','content-type':'application/json',cookie},
  body:body===undefined?undefined:JSON.stringify(body)});
const ctx=(id:string)=>({params:Promise.resolve({id})});

const matched=(over:Partial<QuoteLineInput>={}):QuoteLineInput=>({
  sku:'M1044',description:'White Corrugated Mailers 10x4x4"',pack:'Each',listPrice:0.84,quantity:3,unit:'each',quantityUnclear:false,
  unitPrice:0.845,matchedBy:'auto',originalText:'3 white mailers 10 x 4 x 4',unmatched:false,matchScore:0.91,nearMisses:[],...over,
});
const unmatched:QuoteLineInput={
  sku:null,description:null,pack:null,listPrice:null,quantity:5,unit:'roll',quantityUnclear:true,unitPrice:null,matchedBy:null,
  originalText:'5 rolls of the blue tape we had last time',unmatched:true,matchScore:0.41,
  nearMisses:[{sku:'T902',description:'Packing tape',pack:'Case of 36',listPrice:2.1,score:0.41}],
};

async function newQuote(){
  const result=await createQuote(db,{customerName:'B6 test customer',reference:`${TAG} quote`,lines:[
    matched(),matched({sku:'M962',description:'White Literature Mailers',quantity:10,unitPrice:1.2,matchedBy:'rep',originalText:'10 lit mailers'}),unmatched,
  ]});
  if(!result.ok)throw new Error(result.message);
  created.push(result.id);
  return result.id;
}

const activity=(action:string)=>adminQuery('select metadata from public.activity_log where user_id=$1 and action=$2 order by id desc limit 1',[userId,action]);

beforeAll(async()=>{
  cookie=await signIn();
  ({db,userId}=await signedInClient(REP));
});
afterAll(async()=>{
  for(const id of created)await deleteQuote(db,id);
});

describe('the quotes API with a real session',()=>{
  it('GET /api/quotes lists quotes newest first, the example included',async()=>{
    const id=await newQuote();
    const response=await list(call('GET','/api/quotes'),{params:Promise.resolve({})});
    expect(response.status).toBe(200);
    const {quotes}=await response.json() as {quotes:{id:string;createdAt:string;isExample:boolean;total:number;lineCount:number}[]};
    expect(quotes[0].id).toBe(id);
    expect(quotes[0]).toMatchObject({lineCount:3,total:14.54});
    expect(quotes.find(q=>q.id===EXAMPLE_QUOTE_ID)?.isExample).toBe(true);
    expect(quotes.map(q=>q.createdAt)).toEqual([...quotes.map(q=>q.createdAt)].sort().reverse());
  });

  it('PATCH edits customer, reference, quantity and price, removes a line, and keeps what the matcher stored',async()=>{
    const id=await newQuote();
    const before=(await getQuote(db,id))!;
    const [first,second,third]=before.lines;
    const response=await PATCH(call('PATCH',`/api/quotes/${id}`,{
      customerName:'Renamed customer',reference:`${TAG} edited`,
      lines:[{id:second.id,quantity:12,unitPrice:1.1},{id:third.id}],
    }),ctx(id));
    expect(response.status).toBe(200);
    const {quote}=await response.json() as {quote:{customerName:string;reference:string;total:number;lineCount:number}};
    expect(quote).toMatchObject({customerName:'Renamed customer',reference:`${TAG} edited`,lineCount:2,total:13.2});
    const after=(await getQuote(db,id))!;
    expect(after.lines.map(l=>[l.position,l.sku,l.quantity,l.unitPrice,l.matchedBy,l.unmatched])).toEqual([[1,'M962',12,1.1,'rep',false],[2,null,5,null,null,true]]);
    expect(after.lines[0]).toMatchObject({originalText:'10 lit mailers',description:'White Literature Mailers'});
    expect(after.lines[1]).toMatchObject({originalText:unmatched.originalText,nearMisses:unmatched.nearMisses,quantityUnclear:true,matchScore:0.41});
    expect(after.lines.find(l=>l.sku===first.sku)).toBeUndefined();
    expect(await activity('quote_update')).toEqual([{metadata:{lines:2,removed:1}}]);
  });

  it('PATCH refuses invalid input (400) and saves nothing',async()=>{
    const id=await newQuote();
    const before=await getQuote(db,id);
    const line=before!.lines[0];
    for(const body of [{lines:[{id:line.id,quantity:1,unitPrice:1.23456}]},{lines:[{id:line.id,quantity:0,unitPrice:1}]},{sku:'X'},{lines:[]}]){
      const response=await PATCH(call('PATCH',`/api/quotes/${id}`,body),ctx(id));
      expect(response.status,JSON.stringify(body)).toBe(400);
    }
    expect(await getQuote(db,id)).toEqual(before);
  });

  it('GET, PATCH and DELETE answer 404 for an unknown or non-uuid id',async()=>{
    const unknown='99999999-9999-4999-8999-999999999999';
    for(const id of [unknown,'not-a-uuid']){
      expect((await GET(call('GET',`/api/quotes/${id}`),ctx(id))).status).toBe(404);
      expect((await PATCH(call('PATCH',`/api/quotes/${id}`,{reference:'x'}),ctx(id))).status).toBe(404);
      expect((await DELETE(call('DELETE',`/api/quotes/${id}`),ctx(id))).status).toBe(404);
    }
  });

  it('the example quote cannot be edited (409) or deleted (409), and stays as it was',async()=>{
    const before=await getQuote(db,EXAMPLE_QUOTE_ID);
    const patch=await PATCH(call('PATCH',`/api/quotes/${EXAMPLE_QUOTE_ID}`,{reference:'hijacked'}),ctx(EXAMPLE_QUOTE_ID));
    expect(patch.status).toBe(409);
    const del=await DELETE(call('DELETE',`/api/quotes/${EXAMPLE_QUOTE_ID}`),ctx(EXAMPLE_QUOTE_ID));
    expect(del.status).toBe(409);
    expect(await del.json()).toEqual({error:'The example quote can\'t be deleted.'});
    expect(await getQuote(db,EXAMPLE_QUOTE_ID)).toEqual(before);
  });

  it('DELETE removes the quote and its lines, logs quote_delete with the line count only, then answers 404',async()=>{
    const id=await newQuote();
    const response=await DELETE(call('DELETE',`/api/quotes/${id}`),ctx(id));
    expect(response.status).toBe(200);
    expect(await getQuote(db,id)).toBeNull();
    expect((await adminQuery('select count(*)::int as n from public.quote_lines where quote_id=$1',[id]))[0].n).toBe(0);
    expect(await activity('quote_delete')).toEqual([{metadata:{lines:3}}]);
    expect((await DELETE(call('DELETE',`/api/quotes/${id}`),ctx(id))).status).toBe(404);
  });

  it('without the session cookie every handler answers 401',async()=>{
    const id=await newQuote();
    const saved=cookie;
    cookie='';
    try{
      expect((await list(call('GET','/api/quotes'),{params:Promise.resolve({})})).status).toBe(401);
      expect((await GET(call('GET',`/api/quotes/${id}`),ctx(id))).status).toBe(401);
      expect((await PATCH(call('PATCH',`/api/quotes/${id}`,{reference:'x'}),ctx(id))).status).toBe(401);
      expect((await DELETE(call('DELETE',`/api/quotes/${id}`),ctx(id))).status).toBe(401);
    }finally{cookie=saved;}
    expect(await getQuote(db,id)).not.toBeNull();
  });
});
