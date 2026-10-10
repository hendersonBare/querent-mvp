// @vitest-environment node
import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// last_rep_touch_at (v3 spec §3, decision 25; task A2): set when the owning rep opens the quote
// detail or makes any edit (lines, terms, fulfillment, freight, notes, send). It never moves
// updated_at by itself, and another rep's open or a refused edit leaves it alone.
useSeededDatabase();

const NOW='2026-09-25T18:00:00.000Z';
const load=async()=>({
  edits:await import('./quote-edits'),
  panels:await import('./quote-panel-edits'),
  send:await import('./quote-send'),
  detail:await import('./quote-detail'),
  repo:await import('@/server/repository'),
  service:await import('@/server/quotes/service'),
});
const touched=async(id='q-24817')=>(await import('@/server/repository')).quoteTouchClocks(id)!.last_rep_touch_at;
const at=(minutes:number)=>new Date(Date.parse(NOW)+minutes*60_000).toISOString();

beforeEach(async()=>{(await import('@/server/quotes/service')).resetSample();});

describe('opening the quote detail',()=>{
  it('touches the quote for its own rep when asked to (the GET route and the page), without moving updated_at',async()=>{
    const {detail,repo}=await load();
    const before=repo.quote('q-24817')!.updated_at;
    await detail.repQuoteDetail('brandi','Q-24817',{now:NOW});
    expect(await touched()).toBeNull();
    await detail.repQuoteDetail('brandi','Q-24817',{now:NOW,touch:true});
    expect(await touched()).toBe(NOW);
    expect(repo.quote('q-24817')!.updated_at).toBe(before);
  });

  it('leaves another rep’s quote untouched (it reads as not found)',async()=>{
    const {detail}=await load();
    expect(await detail.repQuoteDetail('mara','Q-24817',{now:NOW,touch:true})).toBeUndefined();
    expect(await touched()).toBeNull();
  });
});

describe('every edit touches the quote',()=>{
  it.each([
    ['a line change',async({edits}:Awaited<ReturnType<typeof load>>,now:string)=>{await edits.editRepQuoteLine('brandi','Q-24817','q-24817-1',{qty:12},{now});}],
    ['an added line',async({edits}:Awaited<ReturnType<typeof load>>,now:string)=>{await edits.addRepQuoteLine('brandi','Q-24817',{itemId:'HN-12-13-G8',qty:2},{now});}],
    ['a removed line',async({edits}:Awaited<ReturnType<typeof load>>,now:string)=>{await edits.removeRepQuoteLine('brandi','Q-24817','q-24817-4',{now});}],
    ['the terms',async({panels}:Awaited<ReturnType<typeof load>>,now:string)=>{await panels.editRepQuoteTerms('brandi','Q-24817',{customerPo:'7790'},{now});}],
    ['the fulfillment',async({panels}:Awaited<ReturnType<typeof load>>,now:string)=>{await panels.editRepQuoteFulfillment('brandi','Q-24817',{branchId:'ogden'},{now});}],
    ['a freight override',async({panels}:Awaited<ReturnType<typeof load>>,now:string)=>{await panels.overrideRepQuoteFreight('brandi','Q-24817',{amount:40,reason:'Customer truck'},{now});}],
    ['clearing the freight override',async({panels}:Awaited<ReturnType<typeof load>>,now:string)=>{await panels.clearRepQuoteFreight('brandi','Q-24817',{now});}],
    ['an internal note',async({panels}:Awaited<ReturnType<typeof load>>,now:string)=>{await panels.addRepQuoteNote('brandi','Q-24817',{body:'Call Dana first'},{now});}],
    ['the send',async({send}:Awaited<ReturnType<typeof load>>,now:string)=>{await send.sendRepQuote('brandi','Q-24817',{revision:1,total:1122.4},{now});}],
  ])('%s',async(_name,edit)=>{
    const modules=await load();
    expect(await touched()).toBeNull();
    await edit(modules,at(5));
    expect(await touched()).toBe(at(5));
  });

  it('is not touched by an edit the quote refuses, or by another rep',async()=>{
    const {edits,service}=await load();
    await expect(edits.editRepQuoteLine('mara','Q-24817','q-24817-1',{qty:12},{now:NOW})).rejects.toMatchObject({code:'not_found'});
    expect(await touched()).toBeNull();
    await service.sendQuote('q-24817',{repId:'brandi',now:NOW});
    await expect(edits.editRepQuoteLine('brandi','Q-24817','q-24817-1',{qty:12},{now:at(5)})).rejects.toMatchObject({code:'illegal_transition'});
    expect(await touched()).toBeNull();
  });
});
