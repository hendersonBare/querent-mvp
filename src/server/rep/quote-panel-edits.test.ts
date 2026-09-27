// @vitest-environment node
import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The quote detail's side panels (task 3.4; spec §4, §5.3, §5.4): the panels' facts, and the
// rep's edits from them (pickup or delivery, branch, freight override, terms, internal notes).
// Every edit acts only on the rep's own quote, refuses sent / accepted / expired quotes like the
// line edits, validates server-side, logs Activity and answers the fresh detail.
useSeededDatabase();

const NOW='2026-09-25T18:00:00.000Z';
const load=async()=>({
  edits:await import('./quote-panel-edits'),
  detail:await import('./quote-detail'),
  repo:await import('@/server/repository'),
  service:await import('@/server/quotes/service'),
});
const activity=async(quoteId:string)=>(await import('@/server/repository')).quoteActivity(quoteId).map(a=>a.message);
const refusal=async(promise:Promise<unknown>)=>{
  try{await promise;}catch(error){return {code:(error as {code?:string}).code,message:(error as Error).message};}
  throw new Error('Expected the edit to be refused.');
};

beforeEach(async()=>{(await import('@/server/quotes/service')).resetSample();});

describe('the panels in the detail',()=>{
  it('carries the customer panel: contact, account, terms, balances, limit, last order, win rate and tax status',async()=>{
    const {detail}=await load();
    const {panels}=(await detail.repQuoteDetail('brandi','Q-24817',{now:NOW}))!;
    expect(panels.customer).toEqual({
      contact:{name:'Dana Ortiz',title:'Purchasing',phone:'(801) 555-0142',email:'dana.ortiz@wasatchmechanical.example'},
      account_number:'WAS-1142',terms:'Net 30',open_balance:18420,past_due_balance:0,credit_limit:50000,tax_status:'taxable',tax_state:'UT',
      last_order:expect.objectContaining({order_date:'2026-09-09'}),
      // 17 of the 24 decided quotes in the seeded year were won (71%); Q-24817 is still open.
      win_rate:{rate:17/24,won:17,lost:7,open:1},
    });
    expect(panels.branches).toEqual([{id:'slc',code:'SLC',name:expect.any(String)},{id:'ogden',code:'Ogden',name:expect.any(String)},{id:'provo',code:'Provo',name:expect.any(String)}]);
    expect(panels.notes).toEqual([]);
    expect(panels.activity.map(a=>a.message)).toEqual([
      'Dana asked for bolts, cut-off wheels, gloves and straps in Querent chat','Querent matched 4 items after 1 clarifying question','Draft quote built and sent to Brandi for review',
    ]);
  });

  it('counts a sent quote past valid_until as lost in the win rate (winRate over effective statuses)',async()=>{
    const {detail,service}=await load();
    const copy=service.duplicateQuote('Q-24817',{repId:'brandi',now:'2026-09-01T15:00:00.000Z'});
    await service.sendQuote(copy.id,{repId:'brandi',now:'2026-09-01T16:00:00.000Z'});
    const {panels}=(await detail.repQuoteDetail('brandi','Q-24817',{now:NOW}))!;
    expect(panels.customer.win_rate).toEqual({rate:17/25,won:17,lost:8,open:1});
  });
});

describe('pickup or delivery',()=>{
  it('switches to delivery: freight is priced by distance from the branch, the totals follow, and Activity says so',async()=>{
    const {edits,repo}=await load();
    const d=await edits.editRepQuoteFulfillment('brandi','Q-24817',{fulfillment:'delivery'},{now:NOW});
    expect(d.quote).toMatchObject({fulfillment:'delivery',branch_code:'SLC'});
    expect(d.freight).toMatchObject({amount:62.5,source:'computed',unresolved:false,computed:{rule:'distance',miles:15,formula:'$25.00 + $2.50/mi × 15.0 mi = $62.50'}});
    expect(d.send_check).toMatchObject({subtotal:1122.4,total:1184.9,can_send:true});
    expect(d.panels.activity.at(-1)).toMatchObject({actor:'rep',actor_id:'brandi',kind:'fulfillment_changed',message:'Brandi switched to delivery from SLC',at:NOW});
    expect(repo.quote('q-24817')!.fulfillment).toBe('delivery');
  });

  it('changes the branch: the freight origin and the stock shown move with it',async()=>{
    const {edits}=await load();
    await edits.editRepQuoteFulfillment('brandi','Q-24817',{fulfillment:'delivery'},{now:NOW});
    const d=await edits.editRepQuoteFulfillment('brandi','Q-24817',{branchId:'ogden'},{now:NOW});
    expect(d.quote).toMatchObject({branch_id:'ogden',branch_code:'Ogden'});
    expect(d.freight.computed.miles).toBeGreaterThan(40);
    expect(d.freight.computed.explanation).toMatch(/ mi from Ogden: /);
    expect(d.lines.every(l=>l.pricing?.branchId==='ogden')).toBe(true);
    expect(d.panels.activity.at(-1)!.message).toBe('Brandi changed the branch from SLC to Ogden');
    const back=await edits.editRepQuoteFulfillment('brandi','Q-24817',{fulfillment:'will_call',branchId:'slc'},{now:NOW});
    expect(back.freight).toMatchObject({amount:0,computed:{rule:'will_call'}});
    expect(back.panels.activity.slice(-2).map(a=>a.message)).toEqual(['Brandi switched to will call at SLC','Brandi changed the branch from Ogden to SLC']);
  });

  it('logs nothing when nothing changes, and refuses an unknown branch or an empty body (400)',async()=>{
    const {edits}=await load();
    const before=await activity('q-24817');
    await edits.editRepQuoteFulfillment('brandi','Q-24817',{fulfillment:'will_call',branchId:'slc'},{now:NOW});
    expect(await activity('q-24817')).toEqual(before);
    for(const body of [{branchId:'moab'},{},{fulfillment:'ship'},{fulfillment:'delivery',extra:1},undefined,'delivery']){
      expect(await refusal(edits.editRepQuoteFulfillment('brandi','Q-24817',body,{now:NOW}))).toMatchObject({code:'invalid_input'});
    }
    expect(await activity('q-24817')).toEqual(before);
  });
});

describe('freight override',()=>{
  it('sets freight by hand with a reason: the totals use it and Activity logs it (task 1.3)',async()=>{
    const {edits,repo}=await load();
    await edits.editRepQuoteFulfillment('brandi','Q-24817',{fulfillment:'delivery'},{now:NOW});
    const d=await edits.overrideRepQuoteFreight('brandi','Q-24817',{amount:80,reason:'  Liftgate truck for the job site  '},{now:NOW});
    expect(d.freight).toMatchObject({amount:80,source:'override',override:{amount:80,reason:'Liftgate truck for the job site'},computed:{rule:'distance',amount:62.5}});
    expect(d.send_check.total).toBe(1202.4);
    expect(d.panels.activity.at(-1)).toMatchObject({kind:'freight_override',actor_id:'brandi',message:'Freight set to $80.00: Liftgate truck for the job site'});
    expect(repo.quote('q-24817')).toMatchObject({freight_override:80,freight_override_reason:'Liftgate truck for the job site'});
    // The same override again changes nothing and logs nothing.
    const count=(await activity('q-24817')).length;
    await edits.overrideRepQuoteFreight('brandi','Q-24817',{amount:80,reason:'Liftgate truck for the job site'},{now:NOW});
    expect(await activity('q-24817')).toHaveLength(count);
  });

  it('requires a reason and a price in cents (400), writing nothing',async()=>{
    const {edits,repo}=await load();
    for(const body of [{amount:80},{amount:80,reason:'   '},{amount:-1,reason:'x'},{amount:12.345,reason:'x'},{amount:'80',reason:'x'},{amount:100_000.01,reason:'x'},
      {amount:80,reason:'x'.repeat(301)},{amount:80,reason:'x',note:'extra'},undefined]){
      expect(await refusal(edits.overrideRepQuoteFreight('brandi','Q-24817',body,{now:NOW}))).toMatchObject({code:'invalid_input'});
    }
    expect(await refusal(edits.overrideRepQuoteFreight('brandi','Q-24817',{amount:80,reason:''},{now:NOW}))).toEqual({code:'invalid_input',message:'Say why freight is set by hand.'});
    expect(repo.quote('q-24817')).toMatchObject({freight_override:null,freight_override_reason:null});
  });

  it('goes back to distance-based freight, logged; clearing when there is no override logs nothing',async()=>{
    const {edits}=await load();
    await edits.editRepQuoteFulfillment('brandi','Q-24817',{fulfillment:'delivery'},{now:NOW});
    await edits.overrideRepQuoteFreight('brandi','Q-24817',{amount:0,reason:'Free delivery promised by phone'},{now:NOW});
    const d=await edits.clearRepQuoteFreight('brandi','Q-24817',{now:NOW});
    expect(d.freight).toMatchObject({amount:62.5,source:'computed',override:null});
    expect(d.panels.activity.at(-1)!.message).toBe('Freight override removed: back to distance-based freight.');
    const count=d.panels.activity.length;
    expect((await edits.clearRepQuoteFreight('brandi','Q-24817',{now:NOW})).panels.activity).toHaveLength(count);
  });

  it('resolves call for freight, but never the "delivery needs a ship-to" blocker',async()=>{
    const {edits,repo,detail}=await load();
    const q=repo.createQuote({customerId:'wasatch',contactId:'dana',fulfillment:'delivery',branchId:'slc',shipTo:null,at:NOW,
      lines:[{itemId:'HCS-12-13-2G8',qty:2,unitPrice:31.5,priceBasis:'custom'}]});
    const before=(await detail.repQuoteDetail('brandi',q.quote_number,{now:NOW}))!;
    expect(before.freight).toMatchObject({unresolved:true,computed:{rule:'no_ship_to'}});
    expect(before.send_check.blockers.map(b=>b.code)).toEqual(['no_ship_to','call_for_freight']);
    const after=await edits.overrideRepQuoteFreight('brandi',q.quote_number,{amount:95,reason:'Carrier quote'},{now:NOW});
    expect(after.freight).toMatchObject({unresolved:false,amount:95});
    expect(after.send_check).toMatchObject({can_send:false,blockers:[expect.objectContaining({code:'no_ship_to'})]});
  });
});

describe('quote terms',()=>{
  it('sets valid for 7, 14 or 30 days: the draft\'s valid-until moves with it',async()=>{
    const {edits}=await load();
    const d=await edits.editRepQuoteTerms('brandi','Q-24817',{validDays:30},{now:NOW});
    expect(d.quote.valid_days).toBe(30);
    expect(d.valid_until).toBe('2026-10-25');
    expect(d.panels.activity.at(-1)).toMatchObject({kind:'terms_changed',message:'Brandi made the quote valid for 30 days'});
    expect((await edits.editRepQuoteTerms('brandi','Q-24817',{validDays:7},{now:NOW})).valid_until).toBe('2026-10-02');
  });

  it('adds, changes and removes the customer PO and the printed note, each logged',async()=>{
    const {edits}=await load();
    let d=await edits.editRepQuoteTerms('brandi','Q-24817',{customerPo:' 7781 ',customerNote:'Straps ship from Ogden.'},{now:NOW});
    expect(d.quote).toMatchObject({customer_po:'7781',customer_note:'Straps ship from Ogden.'});
    expect(d.panels.activity.slice(-2).map(a=>a.message)).toEqual(['Brandi added customer PO 7781','Brandi updated the note printed on the quote']);
    d=await edits.editRepQuoteTerms('brandi','Q-24817',{customerPo:'7782'},{now:NOW});
    expect(d.panels.activity.at(-1)!.message).toBe('Brandi changed the customer PO to 7782');
    d=await edits.editRepQuoteTerms('brandi','Q-24817',{customerPo:'',customerNote:null},{now:NOW});
    expect(d.quote).toMatchObject({customer_po:null,customer_note:null});
    expect(d.panels.activity.slice(-2).map(a=>a.message)).toEqual(['Brandi removed the customer PO','Brandi removed the note printed on the quote']);
    const count=d.panels.activity.length;
    expect((await edits.editRepQuoteTerms('brandi','Q-24817',{customerPo:'  ',validDays:14},{now:NOW})).panels.activity).toHaveLength(count);
  });

  it('refuses other valid-for days, overlong text and unknown fields (400)',async()=>{
    const {edits,repo}=await load();
    for(const body of [{validDays:10},{validDays:'14'},{customerPo:'x'.repeat(41)},{customerNote:'x'.repeat(1001)},{customerPo:7781},{validUntil:'2026-12-01'},{},undefined]){
      expect(await refusal(edits.editRepQuoteTerms('brandi','Q-24817',body,{now:NOW}))).toMatchObject({code:'invalid_input'});
    }
    expect(repo.quote('q-24817')).toMatchObject({valid_days:14,customer_po:null,customer_note:null});
  });
});

describe('internal notes',()=>{
  it('adds a note for the team; Activity says one was added, not what it says',async()=>{
    const {edits}=await load();
    const d=await edits.addRepQuoteNote('brandi','Q-24817',{body:'  Dana usually takes the straps from Ogden.  '},{now:NOW});
    expect(d.panels.notes).toEqual([expect.objectContaining({rep_id:'brandi',rep_name:'Brandi Gallegos',body:'Dana usually takes the straps from Ogden.',created_at:NOW})]);
    expect(d.panels.activity.at(-1)).toMatchObject({kind:'note_added',message:'Brandi added an internal note'});
    expect(d.panels.activity.map(a=>a.message).join(' ')).not.toContain('Ogden');
  });

  it('refuses an empty or overlong note (400)',async()=>{
    const {edits}=await load();
    for(const body of [{body:''},{body:'   '},{body:'x'.repeat(2001)},{text:'hi'},undefined]){
      expect(await refusal(edits.addRepQuoteNote('brandi','Q-24817',body,{now:NOW}))).toMatchObject({code:'invalid_input'});
    }
  });
});

describe('editable states (spec §5.4) and ownership',()=>{
  const everyEdit=async(quoteNumber:string,now=NOW)=>{
    const {edits}=await load();
    return Promise.all([
      refusal(edits.editRepQuoteFulfillment('brandi',quoteNumber,{fulfillment:'delivery'},{now})),
      refusal(edits.editRepQuoteFulfillment('brandi',quoteNumber,{branchId:'provo'},{now})),
      refusal(edits.overrideRepQuoteFreight('brandi',quoteNumber,{amount:5,reason:'x'},{now})),
      refusal(edits.clearRepQuoteFreight('brandi',quoteNumber,{now})),
      refusal(edits.editRepQuoteTerms('brandi',quoteNumber,{validDays:30,customerPo:'1'},{now})),
      refusal(edits.addRepQuoteNote('brandi',quoteNumber,{body:'x'},{now})),
    ]);
  };

  it('refuses every panel edit on accepted, sent and expired quotes (409), changing nothing',async()=>{
    const {repo,service}=await load();
    const accepted=repo.quoteByNumber('Q-24816')!;
    expect(accepted.status).toBe('accepted');
    const copy=service.duplicateQuote('Q-24817',{repId:'brandi',now:'2026-09-24T15:00:00.000Z'});
    await service.sendQuote(copy.id,{repId:'brandi',now:'2026-09-24T16:00:00.000Z'});
    const sent=repo.quote(copy.id)!;
    const cases:[string,string,string,RegExp][]=[
      [accepted.quote_number,accepted.id,NOW,/was accepted, so it can't be edited/],
      [sent.quote_number,sent.id,NOW,/was sent to the customer/],
      // Past valid_until the sent quote is expired, before any sweep stores it.
      [sent.quote_number,sent.id,'2026-10-09T00:00:00.000Z',/expired, so it can't be edited/],
    ];
    for(const [number,id,now,message] of cases){
      const before={quote:repo.quote(id),notes:repo.quoteNotes(id),activity:repo.quoteActivity(id)};
      for(const r of await everyEdit(number,now))expect(r).toMatchObject({code:'illegal_transition',message:expect.stringMatching(message)});
      expect({quote:repo.quote(id),notes:repo.quoteNotes(id),activity:repo.quoteActivity(id)}).toEqual(before);
    }
  });

  it('allows edits while changes_requested',async()=>{
    const {edits,repo,service}=await load();
    const copy=service.duplicateQuote('Q-24817',{repId:'brandi',now:'2026-09-24T15:00:00.000Z'});
    await service.sendQuote(copy.id,{repId:'brandi',now:'2026-09-24T16:00:00.000Z'});
    service.requestChanges('wasatch',copy.id,{revision:1,note:'Deliver it instead, please.',now:'2026-09-25T09:00:00.000Z'});
    const d=await edits.editRepQuoteFulfillment('brandi',copy.quote_number,{fulfillment:'delivery'},{now:NOW});
    expect(d).toMatchObject({editable:true,quote:{status:'changes_requested',fulfillment:'delivery'}});
    await edits.overrideRepQuoteFreight('brandi',copy.quote_number,{amount:45,reason:'Same route as their Friday order'},{now:NOW});
    await edits.editRepQuoteTerms('brandi',copy.quote_number,{customerPo:'7790'},{now:NOW});
    await edits.addRepQuoteNote('brandi',copy.quote_number,{body:'Asked for delivery on rev 1.'},{now:NOW});
    expect(repo.quote(copy.id)).toMatchObject({fulfillment:'delivery',freight_override:45,customer_po:'7790'});
  });

  it('answers not found for another rep\'s quote and an unknown one',async()=>{
    const {repo}=await load();
    const other=repo.createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
    for(const number of [other.quote_number,'Q-99999'])for(const r of await everyEdit(number))expect(r).toMatchObject({code:'not_found'});
    expect(repo.quote(other.id)).toMatchObject({fulfillment:'will_call',freight_override:null,customer_po:null});
    expect(repo.quoteNotes(other.id)).toEqual([]);
  });
});
