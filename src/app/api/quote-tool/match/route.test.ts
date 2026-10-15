// @vitest-environment node
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {CATALOG,CLEAR_BOX,CLEAR_WRAP,NOTHING} from '@/features/quote-tool/test-fixtures';
import type {MatchStreamEvent} from '@/features/quote-tool/types';

// POST /api/quote-tool/match (docs/boxt/plan.md "API"), with the repository and catalog mocked and the
// scripted parser and judge (QUERENT_SCRIPTED=1): 401 without a user (through withApiUser), the input
// caps (400/413), PDFs only, the NDJSON stream (progress events, then one result or one error), and
// one match_run activity row holding numbers and fixed words only.

const repo=vi.hoisted(()=>({getOrgSettings:vi.fn(),logActivity:vi.fn()}));
vi.mock('@/server/repository',async original=>({...await original<typeof import('@/server/repository')>(),...repo}));
const catalog=vi.hoisted(()=>({getCatalog:vi.fn()}));
vi.mock('@/server/catalog',()=>catalog);

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
  vi.stubEnv('QUERENT_SCRIPTED','1');
});
afterAll(()=>vi.unstubAllEnvs());

const route=await import('./route');
const {POST}=route;
const ORIGIN='http://127.0.0.1:3000';
const ctx={params:Promise.resolve({})};
const SAMPLE_PDF=readFileSync(resolve(__dirname,'../../../../../test/fixtures/sample-list.pdf'));

function post(form:FormData|null,{headers={}}:{headers?:Record<string,string>}={}){
  return new NextRequest(`${ORIGIN}/api/quote-tool/match`,{method:'POST',headers:{origin:ORIGIN,host:'127.0.0.1:3000',...headers},body:form??undefined});
}
const textForm=(text:string)=>{const f=new FormData();f.set('text',text);return f;};
const fileForm=(data:Uint8Array,type='application/pdf',name='list.pdf')=>{const f=new FormData();f.set('file',new File([data],name,{type}));return f;};

async function events(response:Response):Promise<MatchStreamEvent[]>{
  const text=await response.text();
  expect(text.endsWith('\n')).toBe(true);
  return text.split('\n').filter(Boolean).map(line=>JSON.parse(line) as MatchStreamEvent);
}

beforeEach(()=>{
  auth.signedIn=true;
  repo.getOrgSettings.mockReset().mockResolvedValue({matchStrictness:'strict',updatedAt:'',updatedBy:null});
  repo.logActivity.mockReset().mockResolvedValue({ok:true});
  catalog.getCatalog.mockReset().mockResolvedValue(CATALOG);
});

describe('POST /api/quote-tool/match',()=>{
  it('declares a 300 s maxDuration on the Node runtime',()=>{
    expect(route.maxDuration).toBe(300);
    expect(route.runtime).toBe('nodejs');
  });

  it('answers 401 without a session and reads nothing',async()=>{
    auth.signedIn=false;
    const response=await POST(post(textForm(CLEAR_BOX)),ctx);
    expect(response.status).toBe(401);
    expect(catalog.getCatalog).not.toHaveBeenCalled();
    expect(repo.logActivity).not.toHaveBeenCalled();
  });

  it('refuses a cross-origin post (403)',async()=>{
    const response=await POST(post(textForm(CLEAR_BOX),{headers:{origin:'https://evil.example'}}),ctx);
    expect(response.status).toBe(403);
  });

  it('answers 400 for an empty list, no form, or both a list and a PDF',async()=>{
    expect((await POST(post(textForm('  \n \n')),ctx)).status).toBe(400);
    expect((await POST(post(null),ctx)).status).toBe(400);
    const both=fileForm(SAMPLE_PDF);both.set('text',CLEAR_BOX);
    const response=await POST(post(both),ctx);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/not both/i);
  });

  it('answers 413 for more than 200 non-empty lines (blank lines do not count)',async()=>{
    const ok=Array.from({length:200},(_,i)=>`${i+1} boxes`).join('\n\n');
    expect((await POST(post(textForm(ok)),ctx)).status).toBe(200);
    const response=await POST(post(textForm(`${ok}\none more`)),ctx);
    expect(response.status).toBe(413);
    expect((await response.json()).error).toMatch(/200 lines/);
  });

  it('answers 413 for a list over the character cap',async()=>{
    const response=await POST(post(textForm('x'.repeat(60_001))),ctx);
    expect(response.status).toBe(413);
  });

  it('accepts only PDFs: by type and by the %PDF magic bytes',async()=>{
    const notPdf=await POST(post(fileForm(new TextEncoder().encode('hello'),'text/plain','list.txt')),ctx);
    expect(notPdf.status).toBe(400);
    expect((await notPdf.json()).error).toMatch(/PDF/);
    const disguised=await POST(post(fileForm(new TextEncoder().encode('<html>not a pdf</html>'))),ctx);
    expect(disguised.status).toBe(400);
    expect(catalog.getCatalog).not.toHaveBeenCalled();
  });

  it('answers 413 for a PDF over 4 MB',async()=>{
    const big=new Uint8Array(4*1024*1024+1);big.set(new TextEncoder().encode('%PDF-1.4\n'));
    const response=await POST(post(fileForm(big)),ctx);
    expect(response.status).toBe(413);
    expect((await response.json()).error).toMatch(/4 MB/);
  });

  it('streams NDJSON: progress per stage, then one result with the level, lines and counts',async()=>{
    const response=await POST(post(textForm(`${CLEAR_BOX} 10 cs\n${NOTHING} 2\n\n${CLEAR_WRAP} x 4`)),ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^application\/x-ndjson/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const all=await events(response);
    const last=all.at(-1)!;
    expect(all.slice(0,-1).every(e=>e.type==='progress')).toBe(true);
    expect(all.filter(e=>e.type==='progress').map(e=>e.type==='progress'&&e.stage)).toEqual(expect.arrayContaining(['parse','match','judge']));
    expect(last.type).toBe('result');
    if(last.type!=='result')return;
    expect(last.run.level).toBe('strict');
    expect(last.run.counts).toEqual({rows:3,matched:2,unmatched:1,judged:2});
    expect(last.run.lines.map(l=>[l.outcome,l.item?.sku??null,l.quantity])).toEqual([['matched','12108-BDL',10],['no_match',null,2],['matched','SF188CAST',4]]);
    expect(repo.getOrgSettings).toHaveBeenCalledWith({tag:'user-db'});
    expect(catalog.getCatalog).toHaveBeenCalledWith({tag:'user-db'});
  });

  it('matches at the organization\'s level',async()=>{
    repo.getOrgSettings.mockResolvedValue({matchStrictness:'lenient',updatedAt:'',updatedBy:null});
    const last=(await events(await POST(post(textForm(CLEAR_BOX)),ctx))).at(-1)!;
    expect(last.type==='result'&&last.run.level).toBe('lenient');
  });

  it('reads the fixture PDF (scripted parser) and streams its rows',async()=>{
    const all=await events(await POST(post(fileForm(SAMPLE_PDF)),ctx));
    const last=all.at(-1)!;
    expect(last.type).toBe('result');
    if(last.type!=='result')return;
    expect(last.run.counts.rows).toBe(4);
    expect(last.run.lines[3]).toMatchObject({quantity:null,quantityUnclear:true});
  });

  it('logs one match_run row with numbers and fixed words only, never the list',async()=>{
    await events(await POST(post(textForm(`${CLEAR_BOX} 10 cs\nSecret Customer Widget 3`)),ctx));
    expect(repo.logActivity).toHaveBeenCalledTimes(1);
    const [db,action,metadata]=repo.logActivity.mock.calls[0];
    expect(db).toEqual({tag:'user-db'});
    expect(action).toBe('match_run');
    expect(metadata).toEqual({rows:2,matched:1,unmatched:1,judged:1,level:'strict',input:'text',durationMs:expect.any(Number),outcome:'success'});
    expect(JSON.stringify(metadata)).not.toMatch(/Secret|Widget|Corrugated/);
  });

  it('streams an error event for a PDF it cannot read, and logs the failure',async()=>{
    const unknown=new TextEncoder().encode('%PDF-1.4\n% not a fixture\n');
    const all=await events(await POST(post(fileForm(unknown)),ctx));
    expect(all.at(-1)).toEqual({type:'error',message:expect.stringMatching(/PDF/)});
    expect(repo.logActivity).toHaveBeenCalledWith({tag:'user-db'},'match_run',expect.objectContaining({input:'pdf',outcome:'failure',rows:0}));
  });

  it('answers 500 with a plain message when the catalog cannot be loaded',async()=>{
    catalog.getCatalog.mockRejectedValue(new Error('internal detail'));
    const response=await POST(post(textForm(CLEAR_BOX)),ctx);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toMatch(/internal detail/);
  });
});
