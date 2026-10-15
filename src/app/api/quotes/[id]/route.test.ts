// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {EXAMPLE_ID,LINE_IDS,QUOTE_ID,quote} from '@/features/quotes/test-fixtures';

// GET, PATCH and DELETE /api/quotes/[id] (docs/boxt/plan.md "API", B6) with the repository mocked: the
// session check (withApiUser: 401 without a user, 403 cross-origin), 404 for unknown and non-uuid ids,
// zod validation (400), the example quote refused (409), and count-only activity rows.

const repo=vi.hoisted(()=>({getQuote:vi.fn(),updateQuote:vi.fn(),deleteQuote:vi.fn(),logActivity:vi.fn()}));
vi.mock('@/server/repository',async original=>({...await original<typeof import('@/server/repository')>(),...repo}));

const auth=vi.hoisted(()=>({signedIn:true}));
vi.mock('@/features/auth/server',async original=>{
  const actual=await original<typeof import('@/features/auth/server')>();
  return {...actual,requireApiUser:async(request?:Request)=>auth.signedIn
    ?{user:{id:'u1',email:'rep@boxt.test'},db:{tag:'user-db'},applyCookies:<R extends Response>(r:R)=>r}
    :actual.requireApiUser(request)};
});

beforeAll(()=>{
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','http://127.0.0.1:59999');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','test-anon-key');
});
afterAll(()=>vi.unstubAllEnvs());

const {GET,PATCH,DELETE}=await import('./route');
const {RepositoryError}=await import('@/server/repository');

const ORIGIN='http://127.0.0.1:3000';
const ctx=(id:string)=>({params:Promise.resolve({id})});
const request=(method:string,id:string,body?:unknown,headers:Record<string,string>={})=>new NextRequest(`${ORIGIN}/api/quotes/${id}`,{
  method,headers:{host:'127.0.0.1:3000',origin:ORIGIN,'content-type':'application/json',...headers},
  body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body),
});
const [A,B,C,U]=LINE_IDS;
const UNKNOWN='99999999-9999-4999-8999-999999999999';

beforeEach(()=>{
  auth.signedIn=true;
  for(const fn of Object.values(repo))fn.mockReset();
  repo.getQuote.mockImplementation(async(_db:unknown,id:string)=>id===QUOTE_ID?quote():id===EXAMPLE_ID?quote({id:EXAMPLE_ID,isExample:true}):null);
  repo.updateQuote.mockResolvedValue({ok:true,id:QUOTE_ID});
  repo.deleteQuote.mockResolvedValue({ok:true});
  repo.logActivity.mockResolvedValue({ok:true});
});

describe('without a session',()=>{
  it.each([['GET',undefined],['PATCH',{reference:'x'}],['DELETE',undefined]])('%s answers 401 and touches nothing',async(method,body)=>{
    auth.signedIn=false;
    const handler={GET,PATCH,DELETE}[method as 'GET'];
    const response=await handler(request(method,QUOTE_ID,body),ctx(QUOTE_ID));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({error:'Sign in to continue.'});
    for(const fn of Object.values(repo))expect(fn).not.toHaveBeenCalled();
  });
});

describe('GET /api/quotes/[id]',()=>{
  it('returns the quote',async()=>{
    const response=await GET(request('GET',QUOTE_ID),ctx(QUOTE_ID));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({quote:quote()});
    expect(repo.getQuote).toHaveBeenCalledWith({tag:'user-db'},QUOTE_ID);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 404 for an unknown id, and for a non-uuid id without asking the database',async()=>{
    const unknown=await GET(request('GET',UNKNOWN),ctx(UNKNOWN));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({error:'Quote not found.'});
    repo.getQuote.mockClear();
    const garbage=await GET(request('GET','not-a-uuid'),ctx('not-a-uuid'));
    expect(garbage.status).toBe(404);
    expect(await garbage.json()).toEqual({error:'Quote not found.'});
    expect(repo.getQuote).not.toHaveBeenCalled();
  });

  it('answers 500 with a plain message, never the database\'s, when the read fails',async()=>{
    repo.getQuote.mockRejectedValue(new RepositoryError('getQuote','XX000','relation "quote_lines" secret detail'));
    const response=await GET(request('GET',QUOTE_ID),ctx(QUOTE_ID));
    expect(response.status).toBe(500);
    const text=await response.text();
    expect(text).not.toMatch(/secret|relation|XX000/);
    expect(JSON.parse(text)).toEqual({error:expect.any(String)});
  });
});

describe('PATCH /api/quotes/[id]',()=>{
  const body={customerName:'Acme Ltd',reference:'PO-2',lines:[{id:B,quantity:250,unitPrice:0.4},{id:C,quantity:4,unitPrice:31.495},{id:U}]};

  it('saves the header and the kept lines, keeping each line\'s stored fields, and returns the saved quote',async()=>{
    const response=await PATCH(request('PATCH',QUOTE_ID,body),ctx(QUOTE_ID));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({quote:quote()});
    expect(repo.updateQuote).toHaveBeenCalledTimes(1);
    const [db,id,update]=repo.updateQuote.mock.calls[0];
    expect(db).toEqual({tag:'user-db'});
    expect(id).toBe(QUOTE_ID);
    expect(update.customerName).toBe('Acme Ltd');
    expect(update.reference).toBe('PO-2');
    expect(update.lines.map((l:{sku:string|null;quantity:number;unitPrice:number|null;matchedBy:string|null})=>[l.sku,l.quantity,l.unitPrice,l.matchedBy])).toEqual([['M1044',250,0.4,'auto'],['B855SS',4,31.495,'rep'],[null,250,null,null]]);
    expect(update.lines[2]).toMatchObject({unmatched:true,originalText:'250 boxes 12 x 10 x 8 double wall, 48 ECT',nearMisses:quote().lines[3].nearMisses});
  });

  it('logs quote_update with counts only',async()=>{
    await PATCH(request('PATCH',QUOTE_ID,body),ctx(QUOTE_ID));
    expect(repo.logActivity).toHaveBeenCalledWith({tag:'user-db'},'quote_update',{lines:3,removed:1});
    expect(JSON.stringify(repo.logActivity.mock.calls)).not.toMatch(/Acme|PO-2|M1044|boxes/);
  });

  it('a header-only change keeps every line and logs removed 0',async()=>{
    const response=await PATCH(request('PATCH',QUOTE_ID,{reference:'PO-3'}),ctx(QUOTE_ID));
    expect(response.status).toBe(200);
    expect(repo.updateQuote).toHaveBeenCalledWith({tag:'user-db'},QUOTE_ID,{reference:'PO-3'});
    expect(repo.logActivity).toHaveBeenCalledWith({tag:'user-db'},'quote_update',{lines:4,removed:0});
  });

  it.each([
    ['a body that is not JSON','{nope'],
    ['an unknown field',{sku:'M1044'}],
    ['a price with 5 decimals',{lines:[{id:A,quantity:1,unitPrice:1.23456}]}],
    ['a quantity of 0',{lines:[{id:A,quantity:0,unitPrice:1}]}],
    ['a quantity with 4 decimals',{lines:[{id:A,quantity:1.2345,unitPrice:1}]}],
    ['a quantity that rounds to 0',{lines:[{id:A,quantity:0.0001,unitPrice:1}]}],
    ['no lines',{lines:[]}],
    ['a line the quote does not have',{lines:[{id:UNKNOWN,quantity:1,unitPrice:1}]}],
    ['a matched line without a price',{lines:[{id:A,quantity:1,unitPrice:null}]}],
  ])('answers 400 for %s and saves nothing',async(_label,payload)=>{
    const response=await PATCH(request('PATCH',QUOTE_ID,payload),ctx(QUOTE_ID));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({error:expect.stringMatching(/\S/)});
    expect(repo.updateQuote).not.toHaveBeenCalled();
    expect(repo.logActivity).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown or non-uuid id',async()=>{
    expect((await PATCH(request('PATCH',UNKNOWN,{reference:'x'}),ctx(UNKNOWN))).status).toBe(404);
    expect((await PATCH(request('PATCH','abc',{reference:'x'}),ctx('abc'))).status).toBe(404);
    expect(repo.updateQuote).not.toHaveBeenCalled();
  });

  it('answers 409 for the example quote',async()=>{
    const response=await PATCH(request('PATCH',EXAMPLE_ID,{reference:'x'}),ctx(EXAMPLE_ID));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({error:'The example quote can\'t be edited.'});
    expect(repo.updateQuote).not.toHaveBeenCalled();
  });

  it('maps a refusal from the database: invalid 400, not_found 404, example 409, anything else 500',async()=>{
    for(const [error,status] of [['invalid',400],['not_found',404],['example',409],['failed',500],['unauthorized',403]] as const){
      repo.updateQuote.mockResolvedValueOnce({ok:false,error,message:'line 1: quantity must be greater than 0'});
      const response=await PATCH(request('PATCH',QUOTE_ID,{reference:'x'}),ctx(QUOTE_ID));
      expect(response.status,error).toBe(status);
    }
    expect(repo.logActivity).not.toHaveBeenCalled();
  });

  it('refuses a cross-origin request (403) before anything else',async()=>{
    const response=await PATCH(request('PATCH',QUOTE_ID,{reference:'x'},{origin:'https://evil.example'}),ctx(QUOTE_ID));
    expect(response.status).toBe(403);
    expect(repo.getQuote).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/quotes/[id]',()=>{
  it('deletes the quote and logs quote_delete with its line count only',async()=>{
    const response=await DELETE(request('DELETE',QUOTE_ID),ctx(QUOTE_ID));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ok:true});
    expect(repo.deleteQuote).toHaveBeenCalledWith({tag:'user-db'},QUOTE_ID);
    expect(repo.logActivity).toHaveBeenCalledWith({tag:'user-db'},'quote_delete',{lines:4});
  });

  it('answers 409 "The example quote can\'t be deleted." for the example',async()=>{
    const response=await DELETE(request('DELETE',EXAMPLE_ID),ctx(EXAMPLE_ID));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({error:'The example quote can\'t be deleted.'});
    expect(repo.deleteQuote).not.toHaveBeenCalled();
    // Also when the database is the one refusing.
    repo.getQuote.mockResolvedValueOnce(quote());
    repo.deleteQuote.mockResolvedValueOnce({ok:false,error:'example',message:'The example quote cannot be changed or deleted.'});
    const raced=await DELETE(request('DELETE',QUOTE_ID),ctx(QUOTE_ID));
    expect(raced.status).toBe(409);
    expect(await raced.json()).toEqual({error:'The example quote can\'t be deleted.'});
    expect(repo.logActivity).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown or non-uuid id',async()=>{
    expect((await DELETE(request('DELETE',UNKNOWN),ctx(UNKNOWN))).status).toBe(404);
    expect((await DELETE(request('DELETE','1 or 1=1'),ctx('1 or 1=1'))).status).toBe(404);
    expect(repo.deleteQuote).not.toHaveBeenCalled();
  });

  it('refuses a cross-origin request (403)',async()=>{
    const response=await DELETE(request('DELETE',QUOTE_ID,undefined,{origin:'https://evil.example'}),ctx(QUOTE_ID));
    expect(response.status).toBe(403);
    expect(repo.deleteQuote).not.toHaveBeenCalled();
  });
});
