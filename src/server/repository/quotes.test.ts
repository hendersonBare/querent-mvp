import {describe,expect,it} from 'vitest';
import type {Quote,QuoteSnapshot} from '@/domain';
import {
  addQuoteActivity,addQuoteLine,addQuoteNote,addQuoteRevision,createQuote,customerQuote,customerQuoteRevision,customerQuotes,markQuoteRead,quote,quoteActivity,quoteByNumber,quoteNotes,
  quoteRevision,quoteRevisions,quotes,removeQuoteLine,resetSampleQuote,restoreQuoteLine,saveQuoteTransition,setFreightOverride,unreadQuoteCount,updateQuoteFulfillment,updateQuoteLine,updateQuoteTerms,
} from './quotes';
import {inTransaction} from './sql';
import {useSeededDatabase} from './test-db';

useSeededDatabase();

const T0='2026-09-24T10:00:00.000Z',T1='2026-09-24T11:00:00.000Z',T2='2026-09-24T12:00:00.000Z';
let sample:Quote;
const newQuote=(customerId='wasatch')=>createQuote({customerId,fulfillment:'will_call',branchId:'slc',at:T0,lines:[{itemId:'HCS-12-13-2G5',qty:10,unitPrice:21.95,priceBasis:'customer'}]});

describe('reading quotes',()=>{
  it('returns the sample quote Q-24817 with its lines and cost',()=>{
    sample=quote('q-24817')!;
    expect(sample).toMatchObject({id:'q-24817',quote_number:'Q-24817',customer_id:'wasatch',customer_name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',contact_id:'dana',contact_name:'Dana Ortiz',
      rep_id:'brandi',rep_name:'Brandi Gallegos',status:'ready_for_review',revision:0,conversation_id:'conv-q-24817',requested_at:'2026-09-23T16:14:00.000Z',created_at:'2026-09-23T16:15:00.000Z',
      fulfillment:'will_call',branch_id:'slc',branch_code:'SLC',requested_date:'2026-09-24',ship_to_address:'1800 W 10950 S, South Jordan, UT 84095',freight_override:null,valid_days:14,valid_until:null,
      unread_for_rep:true,unread_for_customer:false,is_sample:true,duplicated_from:null});
    expect(sample.lines.map(l=>[l.sku,l.qty,l.unit_price,l.price_basis,l.unit_cost])).toEqual([
      ['HCS-12-13-2G8',10,31.5,'last_paid',21.4],['CW-45-045-T1',6,36,'contract',24.1],['GLV-N8-L-1000',4,79,'last_paid',58],['RS-2-27-JH',12,22.95,'customer',14.2],
    ]);
    expect(sample.lines[0]).toEqual({id:'q-24817-1',quote_id:'q-24817',line_no:1,item_id:'HCS-12-13-2G8',sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',
      case_qty:10,category_id:'fasteners',category_name:'Fasteners',list_price:38.95,qty:10,unit_price:31.5,price_basis:'last_paid',suggested_price:31.5,suggested_basis:'last_paid',customer_price:30.95,unit_cost:21.4,
      explanation:'Last paid $31.50 on Aug 12, above customer price $30.95. +$5.50 GP vs customer price.',requested_text:'1/2 in grade 8 hex bolts, 10 boxes',match_score:0.92,added_by:'querent'});
  });

  it('finds a quote by number in any case, and nothing for unknown ones',()=>{
    expect(quoteByNumber('q-24817')).toEqual(sample);
    expect(quoteByNumber('Q-1')).toBeUndefined();
    expect(quote('nope')).toBeUndefined();
  });

  it('lists quotes newest first with subtotal, cost and margin of priced lines',()=>{
    const list=quotes().slice(3); // the seed's three aging quotes (task A2) come first: they are dated from the reset time
    expect(quotes()).toHaveLength(28);
    expect(list.map(q=>q.quote_number).slice(0,2)).toEqual(['Q-24817','Q-24816']);
    expect(list[0]).toMatchObject({status:'ready_for_review',line_count:4,subtotal:1122.4,cost_total:761,sent_total:null,unread_for_rep:true,is_sample:true,customer_name:'Wasatch Mechanical Contractors',rep_name:'Brandi Gallegos'});
    expect(list[0].margin).toBeCloseTo(361.4/1122.4,10);
    expect(list[1]).toMatchObject({status:'accepted',sent_total:655.25,revision:1,sent_at:'2026-09-07T16:20:00.000Z',valid_until:'2026-09-21'});
  });

  it('filters the list by status, customer and rep',()=>{
    expect(quotes({statuses:['accepted']})).toHaveLength(17);
    expect(quotes({statuses:['expired','ready_for_review']})).toHaveLength(8);
    expect(quotes({customerId:'wasatch',repId:'brandi'})).toHaveLength(28);
    expect(quotes({customerId:'great-basin'})).toEqual([]);
    expect(quotes({repId:'mara'})).toEqual([]);
    expect(quotes({statuses:[]})).toEqual([]);
  });

  it('counts quotes unread by the rep',()=>{
    expect(unreadQuoteCount('brandi')).toBe(1);
    expect(unreadQuoteCount('mara')).toBe(0);
  });
});

describe('creating a quote',()=>{
  it('creates a ready_for_review quote with the next number, the customer\'s rep, and cost from the item',()=>{
    const created=createQuote({customerId:'wasatch',contactId:'dana',conversationId:'conv-q-24817',requestText:'10 boxes of grade 5 bolts and nuts',fulfillment:'delivery',branchId:'slc',requestedDate:'2026-09-25',at:T0,
      lines:[{itemId:'HCS-12-13-2G5',qty:10,unitPrice:21.95,priceBasis:'customer',suggestedPrice:21.95,suggestedBasis:'customer',customerPrice:21.95,explanation:'Customer price.',requestedText:'grade 5 bolts',matchScore:0.88},{itemId:'HN-12-13-G5',qty:5}]});
    expect(created).toMatchObject({id:'q-24818',quote_number:'Q-24818',status:'ready_for_review',revision:0,rep_id:'brandi',contact_name:'Dana Ortiz',request_text:'10 boxes of grade 5 bolts and nuts',
      requested_at:T0,created_at:T0,updated_at:T0,sent_at:null,fulfillment:'delivery',branch_code:'SLC',requested_date:'2026-09-25',
      ship_to_address:'1800 W 10950 S, South Jordan, UT 84095',ship_to_lat:40.5513,ship_to_lng:-111.933,valid_days:14,unread_for_rep:true,unread_for_customer:false,is_sample:false});
    expect(created.lines.map(l=>[l.id,l.line_no,l.sku,l.qty,l.unit_price,l.suggested_basis,l.unit_cost,l.added_by])).toEqual([
      ['q-24818-1',1,'HCS-12-13-2G5',10,21.95,'customer',14.6,'querent'],['q-24818-2',2,'HN-12-13-G5',5,null,null,6.9,'querent'],
    ]);
    expect(unreadQuoteCount('brandi')).toBe(2);
  });

  it('uses the given ship-to, or none for a customer without an address',()=>{
    expect(createQuote({customerId:'great-basin',fulfillment:'will_call',branchId:'provo',lines:[]})).toMatchObject({quote_number:'Q-24819',rep_id:'brandi',ship_to_address:null,contact_id:null,lines:[]});
    expect(createQuote({customerId:'wasatch',fulfillment:'delivery',branchId:'ogden',shipTo:{address:'1 Job Site Rd, Ogden, UT 84401',lat:41.2,lng:-111.97},lines:[]}))
      .toMatchObject({quote_number:'Q-24820',ship_to_address:'1 Job Site Rd, Ogden, UT 84401',ship_to_lat:41.2,ship_to_lng:-111.97});
  });

  it('writes nothing when an item is unknown, a qty is invalid, or the customer has no rep',()=>{
    const before=quotes().length;
    expect(()=>createQuote({customerId:'wasatch',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'HCS-12-13-2G5',qty:1},{itemId:'NOPE',qty:1}]})).toThrow('Unknown item NOPE');
    expect(()=>createQuote({customerId:'wasatch',fulfillment:'will_call',branchId:'slc',lines:[{itemId:'HCS-12-13-2G5',qty:1.5}]})).toThrow(RangeError);
    expect(()=>createQuote({customerId:'nobody',fulfillment:'will_call',branchId:'slc',lines:[]})).toThrow('has no assigned rep');
    expect(quotes()).toHaveLength(before);
    expect(newQuote().quote_number).toBe('Q-24821');
  });

  it('rolls back every write in a failed transaction',()=>{
    const before=quotes().length;
    expect(()=>inTransaction(()=>{newQuote();throw new Error('stop');})).toThrow('stop');
    expect(quotes()).toHaveLength(before);
  });
});

describe('editing lines, terms, fulfillment and freight',()=>{
  it('adds a rep line at the end with cost from the item',()=>{
    const id=newQuote().id;
    const line=addQuoteLine(id,{itemId:'FW-12-SAE',qty:5,unitPrice:6.95,priceBasis:'customer'},T1);
    expect(line).toMatchObject({line_no:2,sku:'FW-12-SAE',qty:5,unit_price:6.95,unit_cost:4.1,added_by:'rep'});
    expect(addQuoteLine(id,{itemId:'HN-12-13-G5',qty:5,addedBy:'upsell'})?.added_by).toBe('upsell');
    expect(quote(id)?.updated_at).not.toBe(T0);
    expect(addQuoteLine('nope',{itemId:'FW-12-SAE',qty:1})).toBeUndefined();
    expect(()=>addQuoteLine(id,{itemId:'NOPE',qty:1})).toThrow('Unknown item');
    expect(quote(id)?.lines).toHaveLength(3);
  });

  it('updates only the fields given, and only lines on that quote',()=>{
    const q=newQuote();const lineId=q.lines[0].id;
    expect(updateQuoteLine(q.id,lineId,{qty:12},T1)).toMatchObject({qty:12,unit_price:21.95,price_basis:'customer'});
    expect(updateQuoteLine(q.id,lineId,{unitPrice:23,priceBasis:'custom'})).toMatchObject({qty:12,unit_price:23,price_basis:'custom'});
    expect(updateQuoteLine(q.id,lineId,{unitPrice:null,priceBasis:null})).toMatchObject({unit_price:null,price_basis:null});
    expect(updateQuoteLine(q.id,lineId,{suggestedPrice:22.5,suggestedBasis:'list',customerPrice:21.95,explanation:'Broken-case quantity.'})).toMatchObject({suggested_price:22.5,suggested_basis:'list',explanation:'Broken-case quantity.'});
    expect(updateQuoteLine(q.id,lineId,{})).toMatchObject({qty:12});
    expect(updateQuoteLine(q.id,'nope',{qty:1})).toBeUndefined();
    expect(updateQuoteLine(q.id,'q-24817-1',{qty:1})).toBeUndefined();
    expect(quote('q-24817')?.lines[0].qty).toBe(10);
    expect(()=>updateQuoteLine(q.id,lineId,{qty:-1})).toThrow(RangeError);
  });

  it('removes a line without renumbering; a new line takes the number after the highest one left',()=>{
    const q=newQuote();addQuoteLine(q.id,{itemId:'HN-12-13-G5',qty:5});addQuoteLine(q.id,{itemId:'FW-12-SAE',qty:5});
    expect(removeQuoteLine(q.id,`${q.id}-2`)).toBe(true);
    expect(removeQuoteLine(q.id,`${q.id}-2`)).toBe(false);
    expect(quote(q.id)?.lines.map(l=>l.line_no)).toEqual([1,3]);
    expect(addQuoteLine(q.id,{itemId:'LW-12-ZP',qty:5})?.line_no).toBe(4);
  });

  it('restores a removed line under its old number, with who added it, its match score and request as removed (task 3.3 Undo, cleanup 13)',()=>{
    const q=newQuote();addQuoteLine(q.id,{itemId:'HN-12-13-G5',qty:5,requestedText:'nuts',matchScore:0.81,addedBy:'upsell'});addQuoteLine(q.id,{itemId:'FW-12-SAE',qty:5});
    removeQuoteLine(q.id,`${q.id}-2`,T1);
    const back=restoreQuoteLine(q.id,2,{itemId:'HN-12-13-G5',qty:5,unitPrice:9.5,priceBasis:'custom'},T2);
    expect(back).toMatchObject({id:`${q.id}-2`,line_no:2,sku:'HN-12-13-G5',unit_price:9.5,requested_text:'nuts',match_score:0.81,added_by:'upsell'});
    expect(back!.unit_cost).toBeGreaterThan(0);
    expect(quote(q.id)).toMatchObject({updated_at:T2});
    expect(quote(q.id)?.lines.map(l=>l.line_no)).toEqual([1,2,3]);
    // Once only; and only a line that was removed, of that item, from that quote.
    expect(restoreQuoteLine(q.id,2,{itemId:'HN-12-13-G5',qty:5})).toBeUndefined();
    expect(restoreQuoteLine(q.id,9,{itemId:'LW-12-ZP',qty:1})).toBeUndefined();
    removeQuoteLine(q.id,`${q.id}-3`);
    expect(restoreQuoteLine(q.id,3,{itemId:'LW-12-ZP',qty:1})).toBeUndefined();
    expect(restoreQuoteLine(newQuote().id,3,{itemId:'FW-12-SAE',qty:1})).toBeUndefined();
    expect(restoreQuoteLine('nope',3,{itemId:'FW-12-SAE',qty:1})).toBeUndefined();
    expect(quote(q.id)?.lines.map(l=>l.line_no)).toEqual([1,2]);
  });

  it('puts a restored line at the end when a line added since took its number',()=>{
    const q=newQuote();addQuoteLine(q.id,{itemId:'HN-12-13-G5',qty:5});addQuoteLine(q.id,{itemId:'FW-12-SAE',qty:5,addedBy:'upsell'});
    removeQuoteLine(q.id,`${q.id}-3`);
    // The highest number is free again, so the next Add takes it.
    expect(addQuoteLine(q.id,{itemId:'LW-12-ZP',qty:1})?.line_no).toBe(3);
    expect(restoreQuoteLine(q.id,3,{itemId:'FW-12-SAE',qty:5})).toMatchObject({line_no:4,sku:'FW-12-SAE',added_by:'upsell'});
  });

  it('updates quote terms',()=>{
    const q=newQuote();
    expect(updateQuoteTerms(q.id,{validDays:30,customerPo:'7790',customerNote:'Deliver to gate 3'},T1)).toBe(true);
    expect(quote(q.id)).toMatchObject({valid_days:30,customer_po:'7790',customer_note:'Deliver to gate 3',updated_at:T1});
    expect(updateQuoteTerms(q.id,{customerPo:null})).toBe(true);
    expect(quote(q.id)).toMatchObject({valid_days:30,customer_po:null,customer_note:'Deliver to gate 3'});
    expect(updateQuoteTerms('nope',{validDays:7})).toBe(false);
    expect(()=>updateQuoteTerms(q.id,{validDays:10 as 7})).toThrow();
  });

  it('updates pickup or delivery, branch, day and ship-to',()=>{
    const q=newQuote();
    expect(updateQuoteFulfillment(q.id,{fulfillment:'delivery',branchId:'ogden',requestedDate:'2026-09-28'})).toBe(true);
    expect(quote(q.id)).toMatchObject({fulfillment:'delivery',branch_code:'Ogden',requested_date:'2026-09-28',ship_to_address:'1800 W 10950 S, South Jordan, UT 84095'});
    expect(updateQuoteFulfillment(q.id,{shipTo:null})).toBe(true);
    expect(quote(q.id)).toMatchObject({ship_to_address:null,ship_to_lat:null,ship_to_lng:null});
    expect(updateQuoteFulfillment('nope',{fulfillment:'will_call'})).toBe(false);
  });

  it('sets and clears a freight override, which needs a reason',()=>{
    const q=newQuote();
    expect(setFreightOverride(q.id,{amount:75,reason:'  Liftgate needed '})).toBe(true);
    expect(quote(q.id)).toMatchObject({freight_override:75,freight_override_reason:'Liftgate needed'});
    expect(setFreightOverride(q.id,null)).toBe(true);
    expect(quote(q.id)).toMatchObject({freight_override:null,freight_override_reason:null});
    expect(()=>setFreightOverride(q.id,{amount:-1,reason:'x'})).toThrow(RangeError);
    expect(()=>setFreightOverride(q.id,{amount:10,reason:' '})).toThrow('needs a reason');
    expect(setFreightOverride('nope',null)).toBe(false);
  });
});

describe('status transitions and unread flags',()=>{
  it('persists a transition only from the expected status',()=>{
    const q=newQuote();
    expect(saveQuoteTransition(q.id,{from:'ready_for_review',to:'sent',revision:1,sentAt:T1,validUntil:'2026-10-08',unreadForRep:false,unreadForCustomer:true,at:T1})).toBe(true);
    expect(quote(q.id)).toMatchObject({status:'sent',revision:1,sent_at:T1,valid_until:'2026-10-08',unread_for_rep:false,unread_for_customer:true,updated_at:T1});
    expect(saveQuoteTransition(q.id,{from:'ready_for_review',to:'sent',revision:2})).toBe(false);
    expect(quote(q.id)?.revision).toBe(1);
    expect(saveQuoteTransition(q.id,{from:'sent',to:'changes_requested',respondedAt:T2,changeRequestNote:'Need 20 boxes',unreadForRep:true,at:T2})).toBe(true);
    expect(quote(q.id)).toMatchObject({status:'changes_requested',responded_at:T2,change_request_note:'Need 20 boxes',unread_for_rep:true,sent_at:T1});
    expect(saveQuoteTransition(q.id,{from:'sent',to:'accepted',fulfillmentTime:T2,customerPo:'7791'})).toBe(false);
    expect(saveQuoteTransition('nope',{from:'sent',to:'accepted'})).toBe(false);
  });

  it('marks a quote read for the rep or the customer without touching updated_at',()=>{
    const q=newQuote();
    expect(markQuoteRead(q.id,'rep')).toBe(true);
    expect(quote(q.id)).toMatchObject({unread_for_rep:false,updated_at:T0});
    saveQuoteTransition(q.id,{from:'ready_for_review',to:'sent',unreadForCustomer:true});
    expect(markQuoteRead(q.id,'customer')).toBe(true);
    expect(quote(q.id)?.unread_for_customer).toBe(false);
    expect(markQuoteRead('nope','rep')).toBe(false);
  });
});

const SNAPSHOT:QuoteSnapshot={quote_number:'Q-X',revision:1,customer:{name:'Wasatch Mechanical Contractors',account_number:'WAS-1142'},contact:'Dana Ortiz',rep:'Brandi Gallegos',
  fulfillment:'will_call',branch:'SLC',valid_until:'2026-10-08',subtotal:219.5,freight:0,total:219.5,lines:[{sku:'HCS-12-13-2G5',description:'Hex cap screw',pack:'Box of 50',qty:10,unit_price:21.95,total:219.5}]};

describe('revisions',()=>{
  it('reads the seeded revision of an accepted quote',()=>{
    const [rev]=quoteRevisions('q-24816');
    expect(rev).toMatchObject({id:'q-24816-r1',revision:1,sent_by:'brandi',attach_pdf:true,total:655.25,sent_at:'2026-09-07T16:20:00.000Z'});
    expect(rev.snapshot).toMatchObject({quote_number:'Q-24816',revision:1,fulfillment:'delivery',branch:'SLC',subtotal:592.75,freight:62.5,total:655.25});
    expect(rev.snapshot.lines.map(l=>l.sku)).toEqual(['CW-45-045-T1','GLV-N8-L-1000','FD-45-60Z']);
    expect(quoteRevisions('q-24817')).toEqual([]);
  });

  it('stores a frozen snapshot that cannot be overwritten',()=>{
    const q=newQuote();
    const stored=addQuoteRevision(q.id,{revision:1,sentBy:'brandi',message:'Hi Dana',total:219.5,snapshot:SNAPSHOT,sentAt:T1});
    expect(stored).toEqual({id:`${q.id}-r1`,quote_id:q.id,revision:1,sent_at:T1,sent_by:'brandi',message:'Hi Dana',attach_pdf:true,total:219.5,snapshot:SNAPSHOT});
    expect(()=>addQuoteRevision(q.id,{revision:1,sentBy:'brandi',total:1,snapshot:{...SNAPSHOT,total:1}})).toThrow();
    expect(quoteRevision(q.id,1)).toEqual(stored);
    expect(addQuoteRevision(q.id,{revision:2,sentBy:'brandi',attachPdf:false,total:219.5,snapshot:{...SNAPSHOT,revision:2}})).toMatchObject({revision:2,attach_pdf:false,message:null});
    expect(quoteRevisions(q.id).map(r=>r.revision)).toEqual([1,2]);
    expect(quoteRevision(q.id,3)).toBeUndefined();
  });
});

describe('activity and internal notes',()=>{
  it('reads and appends activity in time order',()=>{
    expect(quoteActivity('q-24817').map(a=>[a.actor,a.kind])).toEqual([['customer','requested'],['querent','matched'],['querent','drafted']]);
    const q=newQuote();
    const entry=addQuoteActivity(q.id,{actor:'rep',actorId:'brandi',kind:'freight_override',message:'Freight set to $75.00: Liftgate needed',at:T1});
    expect(entry).toMatchObject({quote_id:q.id,at:T1,actor:'rep',actor_id:'brandi',kind:'freight_override'});
    expect(typeof entry.id).toBe('number');
    addQuoteActivity(q.id,{actor:'system',kind:'expired',message:'Expired',at:T2});
    expect(quoteActivity(q.id).map(a=>[a.kind,a.actor_id])).toEqual([['freight_override','brandi'],['expired',null]]);
  });

  it('adds and lists internal notes with the rep\'s name',()=>{
    const q=newQuote();
    expect(addQuoteNote(q.id,'brandi','Call Dana about straps',T1)).toMatchObject({quote_id:q.id,rep_id:'brandi',rep_name:'Brandi Gallegos',body:'Call Dana about straps',created_at:T1});
    addQuoteNote(q.id,'brandi','Second note',T2);
    expect(quoteNotes(q.id).map(n=>n.body)).toEqual(['Call Dana about straps','Second note']);
    expect(quoteNotes('q-24817')).toEqual([]);
  });
});

describe('customer-safe quote reads',()=>{
  it('lists the customer\'s quotes with the last sent total only',()=>{
    const list=customerQuotes('wasatch');
    expect(list.find(q=>q.quote_number==='Q-24817')).toEqual({id:'q-24817',quote_number:'Q-24817',status:'ready_for_review',revision:0,requested_at:'2026-09-23T16:14:00.000Z',sent_at:null,valid_until:null,total:null,unread:false});
    expect(list.find(q=>q.quote_number==='Q-24816')).toMatchObject({status:'accepted',revision:1,total:655.25});
    expect(customerQuotes('great-basin').map(q=>q.quote_number)).toEqual(['Q-24819']);
    expect(customerQuotes('canyon-ridge')).toEqual([]);
  });

  it('shows one quote with its last sent revision, only to its own customer',()=>{
    const view=customerQuote('wasatch','Q-24816');
    expect(view).toMatchObject({id:'q-24816',status:'accepted',total:655.25,customer_po:'7777',fulfillment_time:'2026-09-10T15:00:00.000Z',change_request_note:null});
    expect(view?.sent).toMatchObject({revision:1,attach_pdf:true,message:'Hi Dana, quote Q-24816 is ready for you.'});
    expect(view?.sent?.snapshot.lines[0]).toEqual({sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',qty:4,unit_price:36,total:144});
    expect(customerQuote('wasatch','q-24817')?.sent).toBeNull();
    expect(customerQuote('great-basin','Q-24816')).toBeUndefined();
    expect(customerQuote('wasatch','nope')).toBeUndefined();
  });

  it('copies only customer fields from a snapshot, whatever else it holds',()=>{
    const q=newQuote();
    const leaky={...SNAPSHOT,internal_notes:'Margin is thin',lines:[{...SNAPSHOT.lines[0],unit_cost:14.6,margin:0.33}]} as unknown as QuoteSnapshot;
    addQuoteRevision(q.id,{revision:1,sentBy:'brandi',total:219.5,snapshot:leaky});
    expect(quoteRevision(q.id,1)?.snapshot).toHaveProperty('internal_notes');
    expect(customerQuote('wasatch',q.id)?.sent?.snapshot).toEqual(SNAPSHOT);
    expect(customerQuoteRevision('wasatch',q.id)?.snapshot).toEqual(SNAPSHOT);
  });

  it('passes the frozen terms, rep contact and letterhead to the customer field by field, and nothing else in them (task 4.1)',()=>{
    const q=newQuote();
    const printed={terms:'Net 30',rep_contact:{name:'Brandi Gallegos',title:'Inside Sales',phone:'(801) 111-2222',email:'b@example.com'},
      letterhead:{supplier:'Herrick Industrial Supply',website:'herrickindustrial.com',branch:'Salt Lake City',address:'1480 W 2100 S',city:'Salt Lake City',state:'UT',zip:'84119',phone:'(801) 555-0120'}};
    const leaky={...SNAPSHOT,...printed,rep_contact:{...printed.rep_contact,margin_floor:0.3},letterhead:{...printed.letterhead,internal_notes:'Margin is thin'}} as unknown as QuoteSnapshot;
    addQuoteRevision(q.id,{revision:1,sentBy:'brandi',total:219.5,snapshot:leaky});
    expect(customerQuoteRevision('wasatch',q.id)?.snapshot).toEqual({...SNAPSHOT,...printed});
    expect(customerQuote('wasatch',q.id)?.sent?.snapshot).toEqual({...SNAPSHOT,...printed});
  });

  it('the seeded history froze them too, as sendQuote does',()=>{
    expect(customerQuoteRevision('wasatch','Q-24816')?.snapshot).toMatchObject({terms:'Net 30',
      rep_contact:{name:'Brandi Gallegos',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'},
      letterhead:{supplier:'Herrick Industrial Supply',branch:'Salt Lake City',address:'1480 W 2100 S',phone:'(801) 555-0120'},ship_to:'1800 W 10950 S, South Jordan, UT 84095'});
  });

  it('reads one sent revision for the customer PDF (task 4.1): the latest by default, only the customer\'s own, never a draft',()=>{
    const latest=customerQuoteRevision('wasatch','q-24816');
    expect(latest).toMatchObject({quote_id:'q-24816',revision:1,sent_at:customerQuote('wasatch','Q-24816')!.sent!.sent_at,rep:{id:'brandi',name:'Brandi Gallegos',phone:'(801) 111-2222'}});
    expect(latest?.snapshot).toMatchObject({quote_number:'Q-24816',fulfillment:'delivery',branch:'SLC',freight:62.5,freight_miles:15,total:655.25});
    expect(customerQuoteRevision('wasatch','Q-24816',1)).toEqual(latest);
    expect(customerQuoteRevision('wasatch','Q-24816',2)).toBeUndefined();
    // Q-24817 is ready_for_review: it has no sent revision, so its draft prices never reach the customer.
    expect(customerQuoteRevision('wasatch','Q-24817')).toBeUndefined();
    expect(customerQuoteRevision('wasatch','Q-24817',0)).toBeUndefined();
    expect(customerQuoteRevision('great-basin','Q-24816')).toBeUndefined();
    expect(customerQuoteRevision('wasatch','nope')).toBeUndefined();

    const q=newQuote();
    addQuoteRevision(q.id,{revision:1,sentBy:'brandi',total:219.5,snapshot:SNAPSHOT});
    addQuoteRevision(q.id,{revision:2,sentBy:'brandi',total:300,snapshot:{...SNAPSHOT,revision:2,total:300}});
    expect(customerQuoteRevision('wasatch',q.quote_number)).toMatchObject({revision:2,snapshot:{revision:2,total:300}});
    expect(customerQuoteRevision('wasatch',q.id,1)).toMatchObject({revision:1,snapshot:{revision:1,total:SNAPSHOT.total}});
  });

  it('says per revision whether the rep left Attach PDF on (task 5.1: the preview modal offers Download)',()=>{
    expect(customerQuoteRevision('wasatch','Q-24816')?.attach_pdf).toBe(true);
    const q=newQuote();
    addQuoteRevision(q.id,{revision:1,sentBy:'brandi',total:219.5,snapshot:SNAPSHOT,attachPdf:false});
    addQuoteRevision(q.id,{revision:2,sentBy:'brandi',total:300,snapshot:{...SNAPSHOT,revision:2,total:300},attachPdf:true});
    expect(customerQuoteRevision('wasatch',q.id,1)?.attach_pdf).toBe(false);
    expect(customerQuoteRevision('wasatch',q.id)?.attach_pdf).toBe(true);
  });
});

describe('resetSampleQuote',()=>{
  it('rebuilds Q-24817 as seeded and leaves other quotes alone',()=>{
    updateQuoteLine('q-24817','q-24817-1',{qty:99,unitPrice:1});
    removeQuoteLine('q-24817','q-24817-4');
    addQuoteNote('q-24817','brandi','Scratch note');
    saveQuoteTransition('q-24817',{from:'ready_for_review',to:'sent',revision:1});
    const others=quotes().length;
    expect(quote('q-24818')?.conversation_id).toBe('conv-q-24817');
    expect(resetSampleQuote()).toEqual(sample);
    expect(quoteNotes('q-24817')).toEqual([]);
    expect(quoteActivity('q-24817')).toHaveLength(3);
    expect(quotes()).toHaveLength(others);
    // Q-24818 was asked for in the sample conversation, which the reset rebuilds.
    expect(quote('q-24818')).toMatchObject({status:'ready_for_review',conversation_id:null});
  });
});
