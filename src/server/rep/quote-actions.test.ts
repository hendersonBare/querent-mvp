// @vitest-environment node
import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The quote detail's ⋯ menu actions (task 3.5; spec §4, §5.4): Duplicate quote and Reset sample
// quote, on the signed-in rep's own quotes only. They wrap task 1.5's duplicateQuote and
// resetSample rather than reimplementing them.
useSeededDatabase();

const NOW='2026-09-25T18:00:00.000Z';
const load=async()=>({
  actions:await import('./quote-actions'),
  repo:await import('@/server/repository'),
  service:await import('@/server/quotes/service'),
  detail:await import('./quote-detail'),
  edits:await import('./quote-edits'),
  list:await import('./quotes'),
  badges:await import('./badges'),
});
const caught=(fn:()=>unknown)=>{try{fn();}catch(error){return error;}throw new Error('expected a throw');};
const rejected=async(promise:Promise<unknown>)=>{try{await promise;}catch(error){return error;}throw new Error('expected a rejection');};
/** Every quote number in the database. */
const numbers=async()=>(await import('@/server/repository')).quotes({}).map(q=>q.quote_number).sort();

beforeEach(async()=>{(await import('@/server/quotes/service')).resetSample();});

describe('duplicateRepQuote',()=>{
  it('copies the rep’s quote as a new ready_for_review draft, already read, and lists it',async()=>{
    const {actions,repo,list,badges}=await load();
    const before=badges.repBadges('brandi').quotes;
    const {value:copy,replayed}=actions.duplicateRepQuote('brandi','Q-24817',{now:NOW});
    expect(replayed).toBe(false);
    expect(copy.duplicated_from).toEqual({id:'q-24817',quote_number:'Q-24817'});
    const stored=repo.quote(copy.id)!;
    expect(stored).toMatchObject({quote_number:copy.quote_number,status:'ready_for_review',revision:0,rep_id:'brandi',customer_id:'wasatch',duplicated_from:'q-24817',is_sample:false,unread_for_rep:false});
    // As-is: the same lines at the same prices and bases (no re-pricing).
    const sample=repo.quote('q-24817')!;
    expect(stored.lines.map(l=>[l.item_id,l.qty,l.unit_price,l.price_basis])).toEqual(sample.lines.map(l=>[l.item_id,l.qty,l.unit_price,l.price_basis]));
    // The rep made it, so the badge doesn't move; it is in their Quotes list.
    expect(badges.repBadges('brandi').quotes).toBe(before);
    const rows=(await list.repQuoteList('brandi',{customerId:'wasatch',now:NOW})).rows;
    expect(rows.find(r=>r.quote_number===copy.quote_number)).toMatchObject({status:'ready_for_review',unread:false,total:1122.4});
  });

  it('duplicates a quote in any status (accepted here), and the copy is editable',async()=>{
    const {actions,repo}=await load();
    expect(repo.quoteByNumber('Q-24816')!.status).toBe('accepted');
    const {value:copy}=actions.duplicateRepQuote('brandi','Q-24816',{now:NOW});
    expect(repo.quote(copy.id)).toMatchObject({status:'ready_for_review',duplicated_from:'q-24816',customer_po:null});
  });

  it('is not found for another rep’s quote or an unknown one, and creates nothing',async()=>{
    const {actions,repo}=await load();
    const other=repo.createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
    const before=await numbers();
    expect(caught(()=>actions.duplicateRepQuote('brandi',other.quote_number,{now:NOW}))).toMatchObject({code:'not_found',message:`No quote ${other.quote_number}.`});
    expect(caught(()=>actions.duplicateRepQuote('brandi','Q-99999',{now:NOW}))).toMatchObject({code:'not_found'});
    expect(caught(()=>actions.duplicateRepQuote('mara','Q-24817',{now:NOW}))).toMatchObject({code:'not_found'});
    expect(await numbers()).toEqual(before);
  });

  it('refuses (conflict) once the customer is another rep’s: the copy would be theirs',async()=>{
    const {actions,repo}=await load();
    const before=await numbers();
    expect(repo.setAssignedRep('wasatch','mara')).toBe(true);
    try{
      const error=caught(()=>actions.duplicateRepQuote('brandi','Q-24817',{now:NOW}));
      expect(error).toMatchObject({code:'conflict'});
      expect((error as Error).message).toMatch(/^Wasatch Mechanical Contractors is now Mara \S+’s customer/);
      expect(await numbers()).toEqual(before);
    }finally{repo.setAssignedRep('wasatch','brandi');}
  });

  it('makes one copy per Idempotency-Key: a repeat replays it, a new key makes another',async()=>{
    const {actions}=await load();
    const before=(await numbers()).length;
    const first=actions.duplicateRepQuote('brandi','Q-24817',{now:NOW,idempotencyKey:'dup-key-1'});
    const again=actions.duplicateRepQuote('brandi','q-24817',{now:NOW,idempotencyKey:'dup-key-1'});
    expect(again).toEqual({value:first.value,replayed:true});
    expect((await numbers()).length).toBe(before+1);
    const other=actions.duplicateRepQuote('brandi','Q-24817',{now:NOW,idempotencyKey:'dup-key-2'});
    expect(other.replayed).toBe(false);
    expect(other.value.quote_number).not.toBe(first.value.quote_number);
    expect((await numbers()).length).toBe(before+2);
  });

  it('does not replay a key across quotes',async()=>{
    const {actions}=await load();
    const a=actions.duplicateRepQuote('brandi','Q-24817',{now:NOW,idempotencyKey:'shared-key'});
    const b=actions.duplicateRepQuote('brandi','Q-24816',{now:NOW,idempotencyKey:'shared-key'});
    expect(b.replayed).toBe(false);
    expect(b.value.duplicated_from.quote_number).toBe('Q-24816');
    expect(b.value.id).not.toBe(a.value.id);
  });
});

describe('resetRepSampleQuote',()=>{
  it('restores the seeded prices, lines, notes, terms and freight after the rep’s edits',async()=>{
    const {actions,repo,detail,edits}=await load();
    const seeded=(await detail.repQuoteDetail('brandi','Q-24817',{now:NOW}))!;
    await edits.editRepQuoteLine('brandi','Q-24817','q-24817-1',{unitPrice:22},{now:NOW});
    await edits.removeRepQuoteLine('brandi','Q-24817','q-24817-3',{now:NOW});
    await edits.addRepQuoteLine('brandi','Q-24817',{itemId:'DT-2-60',qty:3},{now:NOW});
    repo.addQuoteNote('q-24817','brandi','Call Dana before sending',NOW);
    repo.updateQuoteTerms('q-24817',{customerNote:'Straps ship from Ogden.',customerPo:'PO-1',validDays:30},NOW);
    repo.setFreightOverride('q-24817',{amount:40,reason:'Hot shot'},NOW);
    expect(repo.quote('q-24817')!.lines.map(l=>l.item_id)).toEqual(['HCS-12-13-2G8','CW-45-045-T1','RS-2-27-JH','DT-2-60']);

    const reset=await actions.resetRepSampleQuote('brandi','Q-24817',{now:NOW});
    // The reseed writes the seeded Activity rows again, so only their ids differ (side panels, task 3.4).
    const withoutActivityIds=(d:typeof seeded)=>({...d,panels:{...d.panels,activity:d.panels.activity.map(({id:_id,...entry})=>entry)}});
    expect(withoutActivityIds(reset)).toEqual(withoutActivityIds(seeded));
    expect(reset.lines.map(l=>[l.sku,l.qty,l.unit_price,l.price_basis])).toEqual([
      ['HCS-12-13-2G8',10,31.5,'last_paid'],['CW-45-045-T1',6,36,'contract'],['GLV-N8-L-1000',4,79,'last_paid'],['RS-2-27-JH',12,22.95,'customer'],
    ]);
    expect(repo.quoteNotes('q-24817')).toEqual([]);
    expect(repo.quote('q-24817')).toMatchObject({customer_note:null,customer_po:null,valid_days:14,freight_override:null,freight_override_reason:null,status:'ready_for_review',revision:0});
  });

  it('resets a sent sample too, and takes it back to unread for the rep: the badge follows the flag',async()=>{
    const {actions,repo,service,list,badges}=await load();
    await service.sendQuote('Q-24817',{repId:'brandi',now:'2026-09-24T15:00:00.000Z'});
    expect(repo.quote('q-24817')).toMatchObject({status:'sent',unread_for_rep:false,unread_for_customer:true});
    const before=badges.repBadges('brandi').quotes;
    await actions.resetRepSampleQuote('brandi','Q-24817',{now:NOW});
    expect(repo.quote('q-24817')).toMatchObject({status:'ready_for_review',revision:0,unread_for_rep:true,unread_for_customer:false});
    expect(repo.quoteRevisions('q-24817')).toEqual([]);
    expect(badges.repBadges('brandi').quotes).toBe(before+1);
    const listed=await list.repQuoteList('brandi',{now:NOW});
    expect(listed.unread).toBe(badges.repBadges('brandi').quotes);
    // The page marks it read once it is on screen again, as when the rep opens any quote.
    list.openRepQuote('brandi','Q-24817');
    expect(badges.repBadges('brandi').quotes).toBe(before);
  });

  it('refuses a quote that isn’t the sample (409), changing nothing',async()=>{
    const {actions,repo}=await load();
    const {value:copy}=actions.duplicateRepQuote('brandi','Q-24817',{now:NOW});
    const stored=repo.quote(copy.id)!;
    for(const target of [copy.quote_number,'Q-24816']){
      const error=await rejected(actions.resetRepSampleQuote('brandi',target,{now:NOW}));
      expect(error).toMatchObject({code:'illegal_transition'});
      expect((error as Error).message).toBe(`Only the sample quote can be reset. ${target} isn’t sample data.`);
    }
    expect(repo.quote(copy.id)).toEqual(stored);
  });

  it('is not found for another rep or an unknown quote',async()=>{
    const {actions}=await load();
    expect(await rejected(actions.resetRepSampleQuote('mara','Q-24817',{now:NOW}))).toMatchObject({code:'not_found'});
    expect(await rejected(actions.resetRepSampleQuote('brandi','Q-99999',{now:NOW}))).toMatchObject({code:'not_found'});
  });

  it('keeps quotes requested in the sample conversation and duplicates of the sample working',async()=>{
    const {actions,repo,detail,intake}={...await load(),intake:await import('@/server/intake/quote-request')};
    // Dana presses Request quote on the pop-up in the sample's own chat (conv-q-24817): a new quote.
    const requested=await intake.requestQuote({customerId:'wasatch',contactId:'dana'},
      {conversation_id:'conv-q-24817',fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:10},{sku:'GLV-N8-L-1000',qty:4}]},{now:NOW});
    expect(requested.replayed).toBe(false);
    // Another request in Dana's own chat, as in the golden flow.
    const chat=repo.createConversation({customerId:'wasatch',contactId:'dana',at:NOW});
    const golden=repo.createQuote({customerId:'wasatch',contactId:'dana',conversationId:chat.id,fulfillment:'will_call',branchId:'slc',at:NOW,
      lines:[{itemId:'CW-45-045-T1',qty:6,unitPrice:36,priceBasis:'contract'}]});
    const {value:copy}=actions.duplicateRepQuote('brandi','Q-24817',{now:NOW});
    const before=[requested.quote.id,golden.id,copy.id].map(id=>repo.quote(id)!);

    await actions.resetRepSampleQuote('brandi','Q-24817',{now:NOW});

    const [fromSampleChat,fromOwnChat,duplicate]=[requested.quote.id,golden.id,copy.id].map(id=>repo.quote(id)!);
    // Unlinked from the rebuilt sample chat and from the sample, otherwise untouched.
    expect(fromSampleChat).toEqual({...before[0],conversation_id:null});
    expect(duplicate).toEqual({...before[2],conversation_id:null,duplicated_from:null});
    expect(fromOwnChat).toEqual(before[1]);
    for(const q of [fromSampleChat,fromOwnChat,duplicate]){
      const d=(await detail.repQuoteDetail('brandi',q.quote_number,{now:NOW}))!;
      expect(d.quote.quote_number).toBe(q.quote_number);
      expect(d.lines).toHaveLength(q.lines.length);
    }
    expect(repo.customerQuotes('wasatch').map(q=>q.quote_number)).toEqual(expect.arrayContaining([fromSampleChat.quote_number,fromOwnChat.quote_number,'Q-24817']));
    // Quote numbers keep counting up: a new quote never takes one that exists.
    const next=repo.createQuote({customerId:'wasatch',fulfillment:'will_call',branchId:'slc',lines:[]});
    expect(await numbers()).toContain(next.quote_number);
    expect(new Set(await numbers()).size).toBe((await numbers()).length);
  });
});
