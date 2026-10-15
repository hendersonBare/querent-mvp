// @vitest-environment node
import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {adminQuery} from '../../../scripts/lib/local-admin';
import {DEV_USERS} from '../../../scripts/lib/dev-users';
import {signedInClient} from '../../../scripts/lib/test-clients';
import {
  EXAMPLE_QUOTE_ID,createQuote,deleteQuote,getCatalogItems,getOrgSettings,getQuote,listQuotes,loadCatalog,
  logActivity,setMatchStrictness,updateQuote,type Db,type QuoteLineInput,
} from './index';

// Repository round trips against the local Supabase stack (npm run test:db; needs `npm run db:start`
// and `npm run db:reset`). Every call goes through PostgREST as a signed-in dev user, so RLS applies.

const TAG=`db-test:${Date.now()}`;
const [REP,REP2]=DEV_USERS;
let rep:Db,rep2:Db,repId:string;

const matched=(over:Partial<QuoteLineInput>={}):QuoteLineInput=>({
  sku:'M1044',description:'White Corrugated Mailers 10x4x4"',pack:'Each',listPrice:0.84,quantity:3,unit:'each',
  quantityUnclear:false,unitPrice:0.845,matchedBy:'auto',originalText:'3 white mailers 10 x 4 x 4',unmatched:false,matchScore:0.91,nearMisses:[],...over,
});
const unmatched=(over:Partial<QuoteLineInput>={}):QuoteLineInput=>({
  sku:null,description:null,pack:null,listPrice:null,quantity:5,unit:'roll',quantityUnclear:true,unitPrice:null,matchedBy:null,
  originalText:'5 rolls of the blue tape we had last time',unmatched:true,matchScore:0.41,
  nearMisses:[{sku:'T902',description:'Packing tape',pack:'Case of 36',listPrice:2.1,score:0.41},{sku:'T903',description:'Packing tape 3"',pack:null,listPrice:null,score:0.38}],...over,
});

beforeAll(async()=>{
  ({db:rep,userId:repId}=await signedInClient(REP.email));
  ({db:rep2}=await signedInClient(REP2.email));
});
afterAll(async()=>{
  await adminQuery('delete from public.quotes where reference like $1',[`${TAG}%`]);
});

describe('catalog',()=>{
  it('loadCatalog pages past PostgREST\'s 1,000-row cap and returns all 1,555 rows',async()=>{
    const rows=await loadCatalog(rep);
    expect(rows).toHaveLength(1555);
    expect(new Set(rows.map(r=>r.sku)).size).toBe(1555);
    expect(rows.find(r=>r.sku==='M1044')).toEqual({sku:'M1044',description:'White Corrugated Mailers 10x4x4"',category:'boxes',pack:'Each',caseQty:50,listPrice:0.84,keywords:expect.stringContaining('mailers')});
  });

  it('getCatalogItems returns the rows for the SKUs it knows',async()=>{
    expect((await getCatalogItems(rep,['M1044','NO-SUCH-SKU'])).map(r=>r.sku)).toEqual(['M1044']);
    expect(await getCatalogItems(rep,[])).toEqual([]);
  });
});

describe('quotes',()=>{
  let id:string;

  it('createQuote saves a quote and its lines in one call, in order, with the org\'s strictness',async()=>{
    const result=await createQuote(rep,{customerName:'Test customer',reference:`${TAG} one`,lines:[matched(),matched({sku:'M962',description:'White Literature Mailers',quantity:10,unitPrice:1.2,matchedBy:'rep',originalText:'10 lit mailers'}),unmatched()]});
    expect(result).toMatchObject({ok:true});
    if(!result.ok)return;
    id=result.id;
    const quote=await getQuote(rep,id);
    expect(quote).toMatchObject({id,customerName:'Test customer',reference:`${TAG} one`,isExample:false,matchStrictness:'strict',createdBy:repId,createdByEmail:REP.email,lineCount:3,unmatchedCount:1,total:14.54});
    expect(quote!.lines.map(l=>[l.position,l.sku,l.matchedBy,l.unmatched])).toEqual([[1,'M1044','auto',false],[2,'M962','rep',false],[3,null,null,true]]);
    expect(quote!.lines[0]).toMatchObject({quantity:3,unitPrice:0.845,listPrice:0.84,unit:'each',quantityUnclear:false,matchScore:0.91,originalText:'3 white mailers 10 x 4 x 4',nearMisses:[]});
    expect(quote!.lines[2]).toMatchObject({quantity:5,unitPrice:null,quantityUnclear:true,originalText:'5 rolls of the blue tape we had last time',nearMisses:unmatched().nearMisses});
  });

  it('listQuotes shows the summary: line count, unmatched count, and the total of matched priced lines (each rounded to cents)',async()=>{
    const rows=await listQuotes(rep);
    const row=rows.find(r=>r.id===id);
    // 3 × 0.845 = 2.535 → 2.54, plus 10 × 1.20 = 12.00; the unmatched line has no price.
    expect(row).toMatchObject({customerName:'Test customer',lineCount:3,unmatchedCount:1,total:14.54,isExample:false,createdByEmail:REP.email});
    expect(rows.map(r=>r.createdAt)).toEqual([...rows.map(r=>r.createdAt)].sort().reverse());
  });

  it('updateQuote changes the header alone and keeps the lines',async()=>{
    expect(await updateQuote(rep,id,{reference:`${TAG} renamed`})).toMatchObject({ok:true});
    const quote=await getQuote(rep,id);
    expect(quote).toMatchObject({reference:`${TAG} renamed`,customerName:'Test customer',lineCount:3,total:14.54});
  });

  it('updateQuote replaces the lines (quantity and price edits) atomically',async()=>{
    const quote=(await getQuote(rep,id))!;
    const lines=quote.lines.map(({id:_id,position:_p,createdAt:_c,updatedAt:_u,...line})=>line);
    lines[0]={...lines[0],quantity:4,unitPrice:1};
    lines[2]={...lines[2],sku:'T902',description:'Packing tape',matchedBy:'rep',unmatched:false,unitPrice:2.5};
    expect(await updateQuote(rep,id,{customerName:'Renamed customer',lines})).toMatchObject({ok:true});
    const after=(await getQuote(rep,id))!;
    // 4 × 1 + 10 × 1.20 + 5 × 2.50
    expect(after).toMatchObject({customerName:'Renamed customer',lineCount:3,unmatchedCount:0,total:28.5});
    expect(after.lines.map(l=>[l.position,l.sku,l.quantity,l.unitPrice])).toEqual([[1,'M1044',4,1],[2,'M962',10,1.2],[3,'T902',5,2.5]]);
  });

  it('rejects invalid lines with a clear result and saves nothing',async()=>{
    const before=(await getQuote(rep,id))!;
    for(const bad of [matched({quantity:0}),matched({quantity:-2}),matched({unitPrice:-1}),matched({sku:null}),matched({originalText:''}),unmatched({matchedBy:'auto'}),matched({matchedBy:null})]){
      const result=await updateQuote(rep,id,{reference:'should not stick',lines:[matched(),bad]});
      expect(result,JSON.stringify(bad)).toMatchObject({ok:false,error:'invalid'});
    }
    expect(await getQuote(rep,id)).toEqual(before);
    const created=await createQuote(rep,{customerName:'x',reference:`${TAG} invalid`,lines:[matched({unitPrice:-5})]});
    expect(created).toMatchObject({ok:false,error:'invalid'});
    expect((await listQuotes(rep)).filter(r=>r.reference===`${TAG} invalid`)).toEqual([]);
  });

  it('every signed-in user can read and edit any quote (one company, all users equal)',async()=>{
    expect((await getQuote(rep2,id))?.id).toBe(id);
    expect(await updateQuote(rep2,id,{reference:`${TAG} by rep2`})).toMatchObject({ok:true});
  });

  it('deleteQuote removes the quote and its lines; a second delete is not_found',async()=>{
    expect(await deleteQuote(rep,id)).toEqual({ok:true});
    expect(await getQuote(rep,id)).toBeNull();
    expect((await adminQuery('select count(*)::int as n from public.quote_lines where quote_id=$1',[id]))[0].n).toBe(0);
    expect(await deleteQuote(rep,id)).toMatchObject({ok:false,error:'not_found'});
    expect(await updateQuote(rep,id,{reference:'gone'})).toMatchObject({ok:false,error:'not_found'});
    expect(await getQuote(rep,'not-a-uuid')).toBeNull();
  });
});

describe('the example quote',()=>{
  it('is seeded: 3 matched priced lines and 1 unmatched line with near-misses',async()=>{
    const quote=(await getQuote(rep,EXAMPLE_QUOTE_ID))!;
    expect(quote).toMatchObject({isExample:true,customerName:'Example customer',reference:'Example quote',lineCount:4,unmatchedCount:1});
    expect(quote.lines.filter(l=>!l.unmatched).every(l=>l.sku&&l.unitPrice!==null&&l.quantity!==null)).toBe(true);
    expect(quote.lines.filter(l=>l.unmatched)).toHaveLength(1);
    expect(quote.lines.find(l=>l.unmatched)!.nearMisses.length).toBeGreaterThanOrEqual(3);
    expect(quote.total).toBeGreaterThan(0);
    expect((await listQuotes(rep)).find(r=>r.id===EXAMPLE_QUOTE_ID)?.isExample).toBe(true);
  });

  it('cannot be updated or deleted through the repository, and says why',async()=>{
    const before=await getQuote(rep,EXAMPLE_QUOTE_ID);
    expect(await deleteQuote(rep,EXAMPLE_QUOTE_ID)).toMatchObject({ok:false,error:'example'});
    expect(await updateQuote(rep,EXAMPLE_QUOTE_ID,{reference:'hijacked'})).toMatchObject({ok:false,error:'example'});
    expect(await updateQuote(rep,EXAMPLE_QUOTE_ID,{lines:[matched()]})).toMatchObject({ok:false,error:'example'});
    expect(await getQuote(rep,EXAMPLE_QUOTE_ID)).toEqual(before);
  });
});

describe('settings',()=>{
  afterAll(async()=>{await setMatchStrictness(rep,'strict');});

  it('org settings start at strict and record who changed them',async()=>{
    expect(await getOrgSettings(rep)).toMatchObject({matchStrictness:'strict'});
    expect(await setMatchStrictness(rep,'balanced')).toMatchObject({ok:true,settings:{matchStrictness:'balanced',updatedBy:repId}});
    expect(await getOrgSettings(rep2)).toMatchObject({matchStrictness:'balanced',updatedBy:repId});
    expect(await setMatchStrictness(rep,'nonsense' as 'strict')).toMatchObject({ok:false,error:'invalid'});
  });

  it('a new quote records the strictness in force when it was matched, unless the caller names one',async()=>{
    await setMatchStrictness(rep,'lenient');
    const a=await createQuote(rep,{customerName:'',reference:`${TAG} lenient`,lines:[matched()]});
    const b=await createQuote(rep,{customerName:'',reference:`${TAG} named`,matchStrictness:'balanced',lines:[matched()]});
    expect(a.ok&&b.ok).toBe(true);
    if(a.ok)expect((await getQuote(rep,a.id))?.matchStrictness).toBe('lenient');
    if(b.ok)expect((await getQuote(rep,b.id))?.matchStrictness).toBe('balanced');
  });
});

describe('activity',()=>{
  it('logActivity stores the action and only safe metadata: never customer text',async()=>{
    expect(await logActivity(rep,'match_run',{lines:3,matched:2,level:'strict',customer:'Acme Ltd',line:'12x10x8 kraft boxes'})).toEqual({ok:true});
    const [row]=await adminQuery('select action, metadata, user_id from public.activity_log where user_id=$1 order by id desc limit 1',[repId]);
    expect(row).toEqual({action:'match_run',metadata:{lines:3,matched:2,level:'strict'},user_id:repId});
  });

  it('the database refuses text metadata and rows for another user, even past the repository',async()=>{
    const text=await rep.from('activity_log').insert({action:'match_run',metadata:{customer:'Acme Ltd'}});
    expect(text.error).not.toBeNull();
    const nested=await rep.from('activity_log').insert({action:'match_run',metadata:{lines:[{text:'tape'}]}});
    expect(nested.error).not.toBeNull();
    const other=(await adminQuery('select id from auth.users where email=$1',[REP2.email]))[0].id as string;
    const spoofed=await rep.from('activity_log').insert({action:'login',metadata:{},user_id:other});
    expect(spoofed.error).not.toBeNull();
    const unknown=await rep.from('activity_log').insert({action:'drop_everything' as 'login',metadata:{}});
    expect(unknown.error).not.toBeNull();
  });
});
