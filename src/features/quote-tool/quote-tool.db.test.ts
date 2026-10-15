// @vitest-environment node
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {adminQuery} from '../../../scripts/lib/local-admin';
import {DEV_USERS,devPassword} from '../../../scripts/lib/dev-users';
import {POST as login} from '@/app/api/auth/login/route';
import {POST as match} from '@/app/api/quote-tool/match/route';
import {GET as search} from '@/app/api/catalog/search/route';
import {POST as createQuote} from '@/app/api/quotes/route';
import type {MatchRun,MatchStreamEvent,SaveLine,ScoredItem} from './types';

// The quote tool's APIs against the local Supabase stack (npm run test:db), signed in through the login
// route as a dev user, with the scripted parser and judge: a pasted list is matched against the seeded
// catalog at the organization's level and logged as match_run (numbers only, accepted by the database's
// metadata check); the Swap search reads the real catalog; POST /api/quotes saves the reviewed quote
// with the catalog's description, pack and list price, its unmatched lines and their near-misses, and
// logs quote_create. The handlers are called directly with a NextRequest, as Next calls them.

const ORIGIN='http://127.0.0.1:3000';
const REP=DEV_USERS[0].email;
const created:string[]=[];
let cookie='';

const headers=(extra:Record<string,string>={})=>({origin:ORIGIN,host:'127.0.0.1:3000',...(cookie?{cookie}:{}),...extra});
const ctx={params:Promise.resolve({})};

async function signIn(){
  const response=await login(new NextRequest(`${ORIGIN}/api/auth/login`,{method:'POST',headers:{...headers({'content-type':'application/json'}),cookie:''},body:JSON.stringify({email:REP,password:devPassword()})}));
  expect(response.status).toBe(200);
  cookie=response.headers.getSetCookie().map(line=>line.split(';')[0]).filter(pair=>!pair.endsWith('=')).join('; ');
}

async function runMatch(text:string):Promise<MatchRun>{
  const form=new FormData();form.set('text',text);
  const response=await match(new NextRequest(`${ORIGIN}/api/quote-tool/match`,{method:'POST',headers:headers(),body:form}),ctx);
  expect(response.status).toBe(200);
  const events=(await response.text()).split('\n').filter(Boolean).map(l=>JSON.parse(l) as MatchStreamEvent);
  const last=events.at(-1)!;
  if(last.type!=='result')throw new Error(`no result: ${JSON.stringify(last)}`);
  return last.run;
}

const postQuote=(body:unknown)=>createQuote(new NextRequest(`${ORIGIN}/api/quotes`,{method:'POST',headers:headers({'content-type':'application/json'}),body:JSON.stringify(body)}),ctx);
const userId=async()=>(await adminQuery('select id from auth.users where email=$1',[REP]))[0].id as string;
const lastActivity=async(action:string)=>(await adminQuery('select metadata from public.activity_log where user_id=$1 and action=$2 order by id desc limit 1',[await userId(),action]))[0]?.metadata;

beforeAll(async()=>{
  vi.stubEnv('QUERENT_SCRIPTED','1');
  await signIn();
});
afterAll(async()=>{
  vi.unstubAllEnvs();
  if(created.length)await adminQuery('delete from public.quotes where id = any($1::uuid[])',[created]);
});

const LIST=[
  'S-4128 12 x 10 x 8" Corrugated Boxes, 32 ECT 10 bundles',
  'Cast Stretch Wrap 18" x 1500\' 80 Gauge 4 rolls',
  'Glitter gift bows, assorted 3 cases',
].join('\n');

describe('the quote tool against the local stack',()=>{
  it('refuses every API without a session (401)',async()=>{
    const saved=cookie;cookie='';
    try{
      const form=new FormData();form.set('text','boxes');
      expect((await match(new NextRequest(`${ORIGIN}/api/quote-tool/match`,{method:'POST',headers:headers(),body:form}),ctx)).status).toBe(401);
      expect((await search(new NextRequest(`${ORIGIN}/api/catalog/search?q=boxes`,{headers:headers()}),ctx)).status).toBe(401);
      expect((await postQuote({lines:[]})).status).toBe(401);
    }finally{cookie=saved;}
  });

  let run:MatchRun;
  it('matches a pasted list against the seeded catalog and logs match_run with numbers only',async()=>{
    run=await runMatch(LIST);
    expect(run.level).toBe((await adminQuery('select match_strictness from public.org_settings where id=1'))[0].match_strictness);
    expect(run.lines).toHaveLength(3);
    expect(run.lines[0]).toMatchObject({outcome:'matched',item:{sku:'12108-BDL'},quantity:10,unit:'bundle'});
    expect(run.lines[2]).toMatchObject({outcome:'no_match'});
    expect(run.counts.matched+run.counts.unmatched).toBe(3);
    const metadata=await lastActivity('match_run');
    expect(metadata).toMatchObject({rows:3,matched:run.counts.matched,unmatched:run.counts.unmatched,judged:run.counts.judged,input:'text',outcome:'success',level:run.level});
    expect(JSON.stringify(metadata)).not.toMatch(/Corrugated|Glitter|S-4128/);
  });

  it('searches the catalog for Swap',async()=>{
    const response=await search(new NextRequest(`${ORIGIN}/api/catalog/search?q=${encodeURIComponent('stretch wrap 18"')}`,{headers:headers()}),ctx);
    expect(response.status).toBe(200);
    const {items}=await response.json() as {items:ScoredItem[]};
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(10);
    expect(items[0]).toEqual({sku:expect.any(String),description:expect.stringMatching(/stretch/i),pack:expect.anything(),category:expect.anything(),listPrice:expect.anything(),listPriceUnit:expect.any(String),score:expect.any(Number)});
  });

  it('saves the reviewed quote with the catalog\'s item details, its unmatched lines and near-misses, and logs quote_create',async()=>{
    const [box,,other]=run.lines;
    const unmatchedLine=run.lines.find(l=>l.outcome==='no_match')!;
    const lines:SaveLine[]=[
      {unmatched:false,sku:box.item!.sku,matchedBy:'auto',originalText:box.rawText,quantity:10,unit:box.unit,unitPrice:0.79,matchScore:box.score,
        ...{description:'client says gold box',listPrice:0.01} as object} as SaveLine,
      {unmatched:true,originalText:unmatchedLine.rawText,quantity:unmatchedLine.quantity,unit:unmatchedLine.unit,quantityUnclear:unmatchedLine.quantityUnclear,
        nearMisses:unmatchedLine.nearMisses.map(n=>({sku:n.sku,score:n.score}))},
    ];
    expect(other).toBeDefined();
    const response=await postQuote({customerName:'Test:db customer',reference:'B5 db test',matchStrictness:run.level,lines});
    expect(response.status).toBe(201);
    const {id}=await response.json() as {id:string};
    created.push(id);
    const [quote]=await adminQuery('select customer_name,reference,match_strictness,created_by from public.quotes where id=$1',[id]);
    expect(quote).toMatchObject({customer_name:'Test:db customer',reference:'B5 db test',match_strictness:run.level,created_by:await userId()});
    const rows=await adminQuery('select position,sku,description,pack,list_price,quantity,unit_price,matched_by,original_text,unmatched,near_misses from public.quote_lines where quote_id=$1 order by position',[id]);
    const [catalogRow]=await adminQuery('select description,list_price from public.catalog_items where sku=$1',[box.item!.sku]);
    expect(rows[0]).toMatchObject({position:1,sku:'12108-BDL',description:catalogRow.description,list_price:catalogRow.list_price,quantity:'10.000',unit_price:'0.7900',matched_by:'auto',unmatched:false,original_text:box.rawText});
    expect(rows[1]).toMatchObject({position:2,sku:null,matched_by:null,unmatched:true,original_text:unmatchedLine.rawText});
    expect(rows[1].near_misses.map((n:{sku:string})=>n.sku)).toEqual(unmatchedLine.nearMisses.map(n=>n.sku));
    expect(await lastActivity('quote_create')).toEqual({lines:2,matched:1,unmatched:1,autoMatched:1,repMatched:0,level:run.level});
  });

  it('refuses a SKU that is not in the catalog and saves nothing',async()=>{
    const before=(await adminQuery('select count(*)::int as n from public.quotes'))[0].n;
    const response=await postQuote({lines:[{unmatched:false,sku:'S-4128',matchedBy:'rep',originalText:'S-4128 boxes',quantity:1,unitPrice:1}]});
    expect(response.status).toBe(400);
    expect((await adminQuery('select count(*)::int as n from public.quotes'))[0].n).toBe(before);
  });
});
