// @vitest-environment node
import {beforeEach,describe,expect,it} from 'vitest';
import {useSeededDatabase} from '@/server/repository/test-db';

// The rep's edits to a draft (task 3.3; spec §4, §5.4): they autosave through the repository, act
// only on the rep's own quote, refuse sent / accepted / expired quotes (the repository itself
// doesn't check status: task 1.5 carry-forward), validate typed prices server-side, and log Activity.
useSeededDatabase();

const NOW='2026-09-25T18:00:00.000Z';
const load=async()=>({
  edits:await import('./quote-edits'),
  repo:await import('@/server/repository'),
  service:await import('@/server/quotes/service'),
  detail:await import('./quote-detail'),
});

beforeEach(async()=>{(await import('@/server/quotes/service')).resetSample();});

const line=<L extends {id:string}>(q:{lines:L[]},id:string)=>q.lines.find(l=>l.id===id)!;

describe('the detail model',()=>{
  it('builds the sample for Brandi: header, lines with pricing facts, floors, freight and sendCheck',async()=>{
    const {detail}=await load();
    const d=(await detail.repQuoteDetail('brandi','Q-24817',{now:NOW}))!;
    expect(d.quote).toMatchObject({quote_number:'Q-24817',status:'ready_for_review',contact_name:'Dana Ortiz',contact_title:'Purchasing',branch_code:'SLC',is_sample:true});
    expect(d).toMatchObject({as_of:NOW,editable:true,valid_until:'2026-10-09'});
    expect(d.lines.map(l=>[l.sku,l.qty,l.unit_price,l.price_basis,l.pricing?.floor])).toEqual([
      ['HCS-12-13-2G8',10,31.5,'last_paid',0.2],['CW-45-045-T1',6,36,'contract',0.25],['GLV-N8-L-1000',4,79,'last_paid',0.3],['RS-2-27-JH',12,22.95,'customer',0.2],
    ]);
    const bolts=d.lines[0].pricing!;
    expect(bolts).toMatchObject({branchId:'slc',scarcityEnabled:false,on:'2026-09-25',sources:{customer_price:30.95,list_price:38.95,cost:21.4,last_paid:{unit_price:31.5,order_date:'2026-08-12'}}});
    expect(bolts.stock?.branches.map(b=>[b.branch_code,b.available])).toEqual([['SLC',64],['Ogden',22],['Provo',8]]);
    expect(d.floors).toContainEqual({rep_id:'brandi',category_id:'safety',margin_floor:0.3});
    expect(d.freight).toMatchObject({amount:0,unresolved:false,computed:{rule:'will_call'}});
    expect(d.send_check).toEqual({can_send:true,status_problem:null,blockers:[],below_floor_count:1,subtotal:1122.4,total:1122.4,revision:1});
  });

  it('is not found for another rep, and read-only (effective status) once sent',async()=>{
    const {detail,repo,service}=await load();
    const other=repo.createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
    expect(await detail.repQuoteDetail('brandi',other.quote_number)).toBeUndefined();
    expect(await detail.repQuoteDetail('mara',other.quote_number)).toBeDefined();
    expect(await detail.repQuoteDetail('brandi','Q-99999')).toBeUndefined();

    const copy=service.duplicateQuote('Q-24817',{repId:'brandi',now:'2026-09-24T15:00:00.000Z'});
    await service.sendQuote(copy.id,{repId:'brandi',now:'2026-09-24T16:00:00.000Z'});
    const sent=(await detail.repQuoteDetail('brandi',copy.quote_number,{now:NOW}))!;
    expect(sent).toMatchObject({editable:false,valid_until:'2026-10-08',quote:{status:'sent',revision:1}});
    // Past valid_until the sent quote reads as expired, before any sweep stores it.
    const later=(await detail.repQuoteDetail('brandi',copy.quote_number,{now:'2026-10-09T00:00:00.000Z'}))!;
    expect(later).toMatchObject({editable:false,quote:{status:'expired'}});
  });
});

describe('editing a line',()=>{
  it('switches the price basis: the line takes that option’s price, and Activity says so',async()=>{
    const {edits,repo}=await load();
    const d=await edits.editRepQuoteLine('brandi','Q-24817','q-24817-1',{basis:'list'},{now:NOW});
    expect(line(d,'q-24817-1')).toMatchObject({unit_price:38.95,price_basis:'list',suggested_basis:'last_paid'});
    expect(d.send_check.subtotal).toBe(1196.9);
    expect(repo.quote('q-24817')).toMatchObject({updated_at:NOW});
    expect(repo.quoteActivity('q-24817').at(-1)).toMatchObject({actor:'rep',actor_id:'brandi',kind:'line_changed',at:NOW,
      message:'Brandi changed Hex cap screw 1/2-13 x 2 in (HCS-12-13-2G8): price List $38.95'});
  });

  it('takes any typed price as Custom, even below floor (it only warns)',async()=>{
    const {edits}=await load();
    const d=await edits.editRepQuoteLine('brandi','Q-24817','q-24817-1',{unitPrice:22},{now:NOW});
    expect(line(d,'q-24817-1')).toMatchObject({unit_price:22,price_basis:'custom'});
    expect(d.send_check).toMatchObject({can_send:true,below_floor_count:2});
    const free=await edits.editRepQuoteLine('brandi','Q-24817','q-24817-1',{unitPrice:0},{now:NOW});
    expect(line(free,'q-24817-1')).toMatchObject({unit_price:0,price_basis:'custom'});
    // Clearing the price (Undo back to an unpriced line) leaves it unpriced, which blocks Send.
    const cleared=await edits.editRepQuoteLine('brandi','Q-24817','q-24817-1',{unitPrice:null},{now:NOW});
    expect(line(cleared,'q-24817-1')).toMatchObject({unit_price:null,price_basis:null});
    expect(cleared.send_check.blockers.map(b=>b.code)).toEqual(['no_price']);
  });

  it('re-prices on a qty change: a line on Querent’s pick follows it, and the suggestion is stored',async()=>{
    const {edits,repo}=await load();
    const d=await edits.editRepQuoteLine('brandi','Q-24817','q-24817-1',{qty:5},{now:NOW});
    expect(line(d,'q-24817-1')).toMatchObject({qty:5,unit_price:38.95,price_basis:'list',suggested_price:38.95,suggested_basis:'list'});
    expect(repo.quote('q-24817')!.lines[0].explanation).toMatch(/^Broken-case quantity: 5 is less than a full case of 10/);
    expect(repo.quoteActivity('q-24817').at(-1)!.message).toBe('Brandi changed Hex cap screw 1/2-13 x 2 in (HCS-12-13-2G8): qty 10 to 5, price List $38.95');
  });

  it('refuses bad input with 400 and changes nothing',async()=>{
    const {edits,repo}=await load();
    const {QuoteActionError}=await import('@/server/quotes');
    const bad=async(body:unknown,message:RegExp)=>{
      const error=await edits.editRepQuoteLine('brandi','Q-24817','q-24817-1',body,{now:NOW}).catch(e=>e);
      expect(error).toBeInstanceOf(QuoteActionError);
      expect(error).toMatchObject({code:'invalid_input',httpStatus:400});
      expect(error.message).toMatch(message);
    };
    await bad({unitPrice:-1},/below \$0/);
    await bad({unitPrice:31.955},/dollars and cents/);
    await bad({unitPrice:'31.95'},/dollars and cents/);
    await bad({unitPrice:2_000_000},/over \$1,000,000/);
    await bad({qty:2.5},/whole quantity/);
    await bad({qty:-1},/below 0/);
    await bad({basis:'market'},/price basis/);
    await bad({basis:'contract'},/Contract has no price for HCS-12-13-2G8/);
    await bad({},/Nothing to change/);
    await bad(null,/./);
    await bad({unitPrice:30,cost:1},/./);
    expect(repo.quote('q-24817')!.lines[0]).toMatchObject({qty:10,unit_price:31.5,price_basis:'last_paid'});
  });

  it('is not found for an unknown line, or another rep’s quote',async()=>{
    const {edits,repo}=await load();
    await expect(edits.editRepQuoteLine('brandi','Q-24817','nope',{qty:1})).rejects.toMatchObject({code:'not_found',httpStatus:404});
    const other=repo.createQuote({customerId:'canyon-ridge',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'GLV-N8-L-1000',qty:1,unitPrice:82}]});
    await expect(edits.editRepQuoteLine('brandi',other.id,other.lines[0].id,{qty:2})).rejects.toMatchObject({code:'not_found'});
    expect(repo.quote(other.id)!.lines[0].qty).toBe(1);
  });
});

describe('only a draft the rep can send is editable (canEditDraft, spec §5.4)',()=>{
  it('refuses every edit on an accepted quote, and writes nothing',async()=>{
    const {edits,repo}=await load();
    const accepted=repo.quoteByNumber('Q-24816')!;
    expect(accepted.status).toBe('accepted');
    const target=accepted.lines[0];
    const refused=(p:Promise<unknown>)=>expect(p).rejects.toMatchObject({code:'illegal_transition',httpStatus:409,message:'Q-24816 was accepted, so it can\'t be edited. Duplicate it to quote again.'});
    await refused(edits.editRepQuoteLine('brandi','Q-24816',target.id,{unitPrice:1}));
    await refused(edits.addRepQuoteLine('brandi','Q-24816',{itemId:'FD-45-60Z'}));
    await refused(edits.removeRepQuoteLine('brandi','Q-24816',target.id));
    expect(repo.quoteByNumber('Q-24816')).toEqual(accepted);
  });

  it('refuses a sent quote and one past valid_until, and allows changes_requested',async()=>{
    const {edits,repo,service}=await load();
    const copy=service.duplicateQuote('Q-24817',{repId:'brandi',now:'2026-09-24T15:00:00.000Z'});
    await service.sendQuote(copy.id,{repId:'brandi',now:'2026-09-24T16:00:00.000Z'});
    const lineId=repo.quote(copy.id)!.lines[0].id;
    await expect(edits.editRepQuoteLine('brandi',copy.id,lineId,{qty:3},{now:NOW})).rejects.toMatchObject({code:'illegal_transition',message:/was sent to the customer/});
    await expect(edits.editRepQuoteLine('brandi',copy.id,lineId,{qty:3},{now:'2026-10-09T00:00:00.000Z'})).rejects.toMatchObject({code:'illegal_transition',message:/expired/});

    service.requestChanges('wasatch',copy.id,{revision:1,note:'Make it 12 boxes.',now:'2026-09-25T10:00:00.000Z'});
    const d=await edits.editRepQuoteLine('brandi',copy.id,lineId,{qty:12},{now:NOW});
    expect(d).toMatchObject({editable:true,quote:{status:'changes_requested'}});
    expect(line(d,lineId).qty).toBe(12);
  });
});

describe('adding, removing and putting back a line',()=>{
  it('adds an item by SKU at qty 1, priced by the engine, as the rep’s line',async()=>{
    const {edits,repo}=await load();
    const {detail,line_id}=await edits.addRepQuoteLine('brandi','Q-24817',{itemId:'fd-45-60z'},{now:NOW});
    expect(line_id).toBe('q-24817-5');
    const added=line(detail,line_id);
    expect(added).toMatchObject({sku:'FD-45-60Z',qty:1,added_by:'rep',line_no:5});
    expect(added.unit_price).toBe(added.suggested_price);
    expect(added.price_basis).toBe(added.suggested_basis);
    expect(repo.quoteActivity('q-24817').at(-1)).toMatchObject({kind:'line_added',message:'Brandi added Flap disc 4.5 in (FD-45-60Z), qty 1'});
    await expect(edits.addRepQuoteLine('brandi','Q-24817',{itemId:'NOPE-1'})).rejects.toMatchObject({code:'invalid_input',message:'No item NOPE-1 in the catalog.'});
    await expect(edits.addRepQuoteLine('brandi','Q-24817',{itemId:'FD-45-60Z',qty:0.5})).rejects.toMatchObject({code:'invalid_input'});
  });

  it('removes a line, then puts it back in its place with its price and what Dana asked for',async()=>{
    const {edits,repo}=await load();
    const straps=repo.quote('q-24817')!.lines[3];
    const custom=await edits.editRepQuoteLine('brandi','Q-24817',straps.id,{unitPrice:21.5},{now:NOW});
    expect(line(custom,straps.id).price_basis).toBe('custom');
    const removed=await edits.removeRepQuoteLine('brandi','Q-24817','q-24817-2',{now:NOW});
    expect(removed.lines.map(l=>l.line_no)).toEqual([1,3,4]);
    expect(repo.quoteActivity('q-24817').at(-1)).toMatchObject({kind:'line_removed',message:'Brandi removed Cut-off wheel 4.5 x .045 x 7/8 in (CW-45-045-T1)'});
    await expect(edits.removeRepQuoteLine('brandi','Q-24817','q-24817-2')).rejects.toMatchObject({code:'not_found'});

    // Undo sends the number, price and basis; who added the line, its match score and Dana's words come from the removed line.
    const {detail}=await edits.addRepQuoteLine('brandi','Q-24817',{itemId:'CW-45-045-T1',qty:6,restore:{lineNo:2,unitPrice:36,basis:'contract'}},{now:NOW});
    expect(detail.lines.map(l=>[l.line_no,l.sku,l.unit_price,l.price_basis])).toEqual([
      [1,'HCS-12-13-2G8',31.5,'last_paid'],[2,'CW-45-045-T1',36,'contract'],[3,'GLV-N8-L-1000',79,'last_paid'],[4,'RS-2-27-JH',21.5,'custom'],
    ]);
    expect(detail.lines[1]).toMatchObject({requested_text:'the usual cut-off wheels',match_score:0.95,added_by:'querent'});
    expect(repo.quoteActivity('q-24817').at(-1)!.message).toBe('Brandi put back Cut-off wheel 4.5 x .045 x 7/8 in (CW-45-045-T1)');
    // Put back once: a second Undo of the same line finds nothing to restore.
    await expect(edits.addRepQuoteLine('brandi','Q-24817',{itemId:'CW-45-045-T1',qty:6,restore:{lineNo:2,unitPrice:36,basis:'contract'}},{now:NOW}))
      .rejects.toMatchObject({code:'not_found',message:'No removed line 2 of CW-45-045-T1 to put back on Q-24817.'});

    // A custom price comes back as it was, and the line is still Querent's.
    await edits.removeRepQuoteLine('brandi','Q-24817',straps.id,{now:NOW});
    const back=await edits.addRepQuoteLine('brandi','Q-24817',{itemId:'RS-2-27-JH',qty:12,restore:{lineNo:4,unitPrice:21.5,basis:'custom'}},{now:NOW});
    expect(line(back.detail,straps.id)).toMatchObject({unit_price:21.5,price_basis:'custom',added_by:'querent',match_score:0.9,
      requested_text:'2 in ratchet straps, maybe 12 (then: 27 ft with J-hooks)'});
  });

  it('never takes who added a line, its match score or the request from the client (cleanup 13)',async()=>{
    const {edits,repo}=await load();
    const before=repo.quote('q-24817')!.lines.length;
    // The old Undo payload's provenance fields are refused outright.
    for(const extra of [{addedBy:'querent'},{matchScore:0.99},{requestedText:'what Dana never said'}]){
      await expect(edits.addRepQuoteLine('brandi','Q-24817',{itemId:'FD-45-60Z',qty:2,restore:{lineNo:9,unitPrice:40,basis:'custom',...extra}},{now:NOW}))
        .rejects.toMatchObject({code:'invalid_input'});
    }
    // Restoring a line that was never removed (here, one the rep never had) is refused, so an Add can't pass for Querent's line.
    await expect(edits.addRepQuoteLine('brandi','Q-24817',{itemId:'FD-45-60Z',qty:2,restore:{lineNo:9,unitPrice:40,basis:'custom'}},{now:NOW}))
      .rejects.toMatchObject({code:'not_found'});
    // Nor another item under a removed line's number: the record is for the item that was removed.
    await edits.removeRepQuoteLine('brandi','Q-24817','q-24817-3',{now:NOW});
    await expect(edits.addRepQuoteLine('brandi','Q-24817',{itemId:'FD-45-60Z',qty:2,restore:{lineNo:3,unitPrice:40,basis:'custom'}},{now:NOW}))
      .rejects.toMatchObject({code:'not_found'});
    expect(repo.quote('q-24817')!.lines).toHaveLength(before-1);
    // A rep's own added line comes back as the rep's, with no match score.
    const {line_id}=await edits.addRepQuoteLine('brandi','Q-24817',{itemId:'FD-45-60Z',qty:2},{now:NOW});
    const added=repo.quote('q-24817')!.lines.find(l=>l.id===line_id)!;
    await edits.removeRepQuoteLine('brandi','Q-24817',line_id,{now:NOW});
    const {detail}=await edits.addRepQuoteLine('brandi','Q-24817',{itemId:'FD-45-60Z',qty:2,restore:{lineNo:added.line_no,unitPrice:40,basis:'custom'}},{now:NOW});
    expect(line(detail,line_id)).toMatchObject({added_by:'rep',match_score:null,requested_text:null});
  });
});

describe('item search for Add item',()=>{
  it('finds by name or SKU, exact SKU first, with the starting price and stock at the quote branch',async()=>{
    const {edits}=await load();
    const straps=edits.searchRepQuoteItems('brandi','Q-24817','ratchet strap',{now:NOW})!;
    expect(straps.map(i=>i.sku)).toContain('RS-2-30-FH');
    expect(straps.find(i=>i.sku==='RS-2-27-JH')).toMatchObject({on_quote:true,available:7,branch_code:'SLC'});
    expect(straps.find(i=>i.sku==='RS-2-30-FH')).toMatchObject({on_quote:false});
    const exact=edits.searchRepQuoteItems('brandi','Q-24817','hn-12-13-g8',{now:NOW})!;
    expect(exact[0]).toMatchObject({sku:'HN-12-13-G8'});
    expect(exact[0].price).toBeGreaterThan(0);
    expect(edits.searchRepQuoteItems('brandi','Q-24817','   ')).toEqual([]);
    expect(edits.searchRepQuoteItems('brandi','Q-24817','zzqx')).toEqual([]);
    expect(edits.searchRepQuoteItems('mara','Q-24817','strap')).toBeUndefined();
  });
});
