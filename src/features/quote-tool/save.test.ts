// @vitest-environment node
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import type {QuoteInput} from '@/server/repository/types';
import {CATALOG} from './test-fixtures';
import type {SaveQuoteRequest} from './types';

// POST /api/quotes (create; B5) through the route file, with the repository mocked: zod validation of the
// review dialog's lines, matched SKUs re-read from the catalog (the client's description, pack and list
// price are never trusted), unknown SKUs refused, unmatched lines kept with their text and near-misses,
// one quote_create activity row with counts only.

const repo=vi.hoisted(()=>({getCatalogItems:vi.fn(),createQuote:vi.fn(),logActivity:vi.fn()}));
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

const {POST}=await import('@/app/api/quotes/route');
const ORIGIN='http://127.0.0.1:3000';
const ctx={params:Promise.resolve({})};
const post=(body:unknown,headers:Record<string,string>={})=>new NextRequest(`${ORIGIN}/api/quotes`,{
  method:'POST',headers:{origin:ORIGIN,host:'127.0.0.1:3000','content-type':'application/json',...headers},
  body:typeof body==='string'?body:JSON.stringify(body),
});

const matched=(over:Record<string,unknown>={})=>({unmatched:false,sku:'12108-BDL',matchedBy:'auto',originalText:'S-4128 12x10x8 boxes 10 bdl',quantity:250,unit:'each',quantityUnclear:false,customerQuantity:'10 bundles',unitPrice:0.79,matchScore:1,...over});
const unmatched=(over:Record<string,unknown>={})=>({unmatched:true,originalText:'Foam peanuts 14 cu ft 2 bags',quantity:2,unit:'bag',quantityUnclear:false,nearMisses:[{sku:'PB3669',score:0.41}],...over});
const body=(over:Partial<SaveQuoteRequest>&Record<string,unknown>={})=>({customerName:'Acme Supply',reference:'PO 1182',matchStrictness:'strict',lines:[matched(),unmatched()],...over});

beforeEach(()=>{
  auth.signedIn=true;
  repo.getCatalogItems.mockReset().mockImplementation(async(_db:unknown,skus:string[])=>CATALOG.filter(i=>skus.includes(i.sku)));
  repo.createQuote.mockReset().mockResolvedValue({ok:true,id:'9a9a9a9a-0000-4000-8000-000000000009'});
  repo.logActivity.mockReset().mockResolvedValue({ok:true});
});

const saved=()=>repo.createQuote.mock.calls[0][1] as QuoteInput;

describe('POST /api/quotes (create)',()=>{
  it('answers 401 without a session and saves nothing',async()=>{
    auth.signedIn=false;
    expect((await POST(post(body()),ctx)).status).toBe(401);
    expect(repo.createQuote).not.toHaveBeenCalled();
  });

  it('saves the quote and answers 201 {id}',async()=>{
    const response=await POST(post(body()),ctx);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({id:'9a9a9a9a-0000-4000-8000-000000000009'});
    expect(repo.createQuote.mock.calls[0][0]).toEqual({tag:'user-db'});
    expect(saved()).toEqual({
      customerName:'Acme Supply',reference:'PO 1182',matchStrictness:'strict',
      lines:[
        {originalText:'S-4128 12x10x8 boxes 10 bdl',unmatched:false,sku:'12108-BDL',matchedBy:'auto',description:'12x10x8" Corrugated Boxes, 32 ECT, bundle pricing',
          pack:'Bundle of 25',listPrice:0.84,quantity:250,unit:'each',quantityUnclear:false,customerQuantity:'10 bundles',unitPrice:0.79,matchScore:1,nearMisses:[]},
        {originalText:'Foam peanuts 14 cu ft 2 bags',unmatched:true,sku:null,matchedBy:null,description:null,pack:null,listPrice:null,
          quantity:2,unit:'bag',quantityUnclear:false,customerQuantity:null,unitPrice:null,matchScore:null,
          nearMisses:[{sku:'PB3669',description:'Reclosable Poly Bags 30x30" 2 Mil',pack:'Case of 250',listPrice:89,score:0.41}]},
      ],
    });
  });

  it('takes description, pack and list price from the catalog, never from the client',async()=>{
    await POST(post(body({lines:[matched({description:'Gold plated box',pack:'Pallet of 1',listPrice:0.01}) as never]})),ctx);
    expect(saved().lines[0]).toMatchObject({description:'12x10x8" Corrugated Boxes, 32 ECT, bundle pricing',pack:'Bundle of 25',listPrice:0.84});
    expect(repo.getCatalogItems).toHaveBeenCalledWith({tag:'user-db'},['12108-BDL']);
  });

  it('refuses a matched SKU that is not in the catalog (400) and saves nothing',async()=>{
    const response=await POST(post(body({lines:[matched(),matched({sku:'S-4128'})] as never})),ctx);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/Line 2.*S-4128.*catalog/);
    expect(repo.createQuote).not.toHaveBeenCalled();
  });

  it('drops near-misses whose SKU is no longer in the catalog, and takes the rest from the catalog',async()=>{
    await POST(post(body({lines:[unmatched({nearMisses:[{sku:'GONE-1',score:0.5},{sku:'SF188CAST',score:0.3,description:'fake'}]})] as never})),ctx);
    expect(saved().lines[0].nearMisses).toEqual([{sku:'SF188CAST',description:'Cast Stretch Wrap 18"x1500\' 80 Gauge',pack:'Case of 4',listPrice:24.5,score:0.3}]);
  });

  it('accepts a rep match and an unmatched line without a quantity',async()=>{
    const response=await POST(post(body({lines:[matched({matchedBy:'rep',matchScore:null}),unmatched({quantity:null,quantityUnclear:true,nearMisses:undefined})] as never})),ctx);
    expect(response.status).toBe(201);
    expect(saved().lines.map(l=>[l.matchedBy,l.quantity,l.quantityUnclear])).toEqual([['rep',250,false],[null,null,true]]);
  });

  it('stores a matched line\'s unit as its item\'s pricing unit from the catalog, and an unmatched line\'s as the customer wrote it',async()=>{
    const response=await POST(post(body({lines:[matched(),matched({sku:'PB3669',quantity:2,unit:'case'}),matched({sku:'SF188CAST',quantity:3,unit:'Cases'}),unmatched()] as never})),ctx);
    expect(response.status).toBe(201);
    expect(saved().lines.map(l=>[l.sku,l.quantity,l.unit])).toEqual([['12108-BDL',250,'each'],['PB3669',2,'case'],['SF188CAST',3,'case'],[null,2,'bag']]);
  });

  it.each([['missing',{unit:undefined}],['null',{unit:null}],['blank',{unit:' '}]])('refuses a matched line whose unit is %s (400): the unit must name the item\'s pricing unit',async(_,over)=>{
    const response=await POST(post(body({lines:[matched(over)] as never})),ctx);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Line 1: the quantity must be in each, the unit item 12108-BDL is priced per.');
    expect(repo.createQuote).not.toHaveBeenCalled();
  });

  it('refuses a matched line whose quantity is in another unit than the item\'s pricing unit (400), so a quantity is never read in the wrong unit',async()=>{
    const response=await POST(post(body({lines:[matched({quantity:10,unit:'bundle'})] as never})),ctx);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Line 1: the quantity must be in each, the unit item 12108-BDL is priced per.');
    expect(repo.createQuote).not.toHaveBeenCalled();
  });

  it.each([
    ['no lines',{lines:[]}],
    ['201 lines',{lines:Array.from({length:201},()=>matched())}],
    ['a zero quantity',{lines:[matched({quantity:0})]}],
    ['a missing quantity on a matched line',{lines:[matched({quantity:null})]}],
    ['a negative price',{lines:[matched({unitPrice:-1})]}],
    ['a price with 5 decimals',{lines:[matched({unitPrice:0.12345})]}],
    ['a missing price',{lines:[matched({unitPrice:null})]}],
    ['a quantity with 4 decimals',{lines:[matched({quantity:1.0005})]}],
    ['an unknown matchedBy',{lines:[matched({matchedBy:'judge'})]}],
    ['blank original text',{lines:[matched({originalText:'   '})]}],
    ['original text over 2000 characters',{lines:[unmatched({originalText:'x'.repeat(2001)})]}],
    ['a customer name over 200 characters',{customerName:'x'.repeat(201)}],
    ['an unknown strictness',{matchStrictness:'loose'}],
    ['a matched line without a SKU',{lines:[matched({sku:''})]}],
    ['a customer quantity over 100 characters',{lines:[matched({customerQuantity:'x'.repeat(101)})]}],
  ])('answers 400 for %s',async(_,over)=>{
    const response=await POST(post(body(over as never)),ctx);
    expect(response.status).toBe(400);
    expect(typeof (await response.json()).error).toBe('string');
    expect(repo.createQuote).not.toHaveBeenCalled();
  });

  it('accepts a price of 0 and 4 decimals, and optional customer name and reference',async()=>{
    const response=await POST(post({lines:[matched({unitPrice:0}),matched({unitPrice:12.3456})]}),ctx);
    expect(response.status).toBe(201);
    expect(saved()).toMatchObject({customerName:'',reference:''});
    expect(saved().lines.map(l=>l.unitPrice)).toEqual([0,12.3456]);
  });

  it('answers 400 for a body that is not JSON',async()=>{
    expect((await POST(post('{not json'),ctx)).status).toBe(400);
  });

  it('logs quote_create with counts only',async()=>{
    await POST(post(body({lines:[matched(),matched({matchedBy:'rep'}),unmatched()] as never})),ctx);
    expect(repo.logActivity).toHaveBeenCalledWith({tag:'user-db'},'quote_create',{lines:3,matched:2,unmatched:1,autoMatched:1,repMatched:1,level:'strict'});
  });

  it('passes a database refusal on as 400 and a failure as 500, without details',async()=>{
    repo.createQuote.mockResolvedValueOnce({ok:false,error:'invalid',message:'line 1: quantity must be > 0'});
    expect((await POST(post(body()),ctx)).status).toBe(400);
    repo.createQuote.mockResolvedValueOnce({ok:false,error:'failed',message:'The database could not save this.'});
    const failed=await POST(post(body()),ctx);
    expect(failed.status).toBe(500);
    expect(repo.logActivity).not.toHaveBeenCalled();
  });
});
