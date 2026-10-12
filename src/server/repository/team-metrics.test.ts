import {beforeAll,describe,expect,it} from 'vitest';
import {db} from '../db';
import {addQuoteActivity,addQuoteLine,createQuote,setQuoteRep} from './quotes';
import {teamQuoteFacts,teamStatusEvents} from './team';
import {clearDemoBook,setQuoteFreightFixture,useSeededDatabase} from './test-db';

// The Team dashboard's live reads (v3 spec §7; decisions 23–25; OA-19; task D3): the cohort is the
// quotes created in [from, to), two instants the browser computed at its local midnight, owned now
// by one of the selected reps. No materialised tables: every call reads the quotes as they are.
useSeededDatabase();
// The demo seed's book (task F1) is dated from the real clock: deleted, so only this file's quotes fall in its fixed windows on any day.
beforeAll(clearDemoBook);

// Denver (MST, UTC-7) midnights for Jan 1 and Jan 11, 2027: after every seeded quote.
const FROM='2027-01-01T07:00:00.000Z',TO='2027-01-11T07:00:00.000Z';
const ALL=['brandi','eli','mara','nora'];
const sql=(text:string,...params:unknown[])=>db().prepare(text).run(...params);

function quoteAt(customerId:string,at:string,lines:{itemId:string;qty:number;unitPrice?:number|null}[]=[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:80}]){
  return createQuote({customerId,fulfillment:'will_call',branchId:'slc',at,lines});
}
function revision(quoteId:string,n:number,total:number,sentAt:string){
  sql("INSERT INTO quote_revisions(id,quote_id,revision,sent_at,sent_by,message,attach_pdf,total,snapshot) VALUES(?,?,?,?,'mara',NULL,1,?,'{}')",`${quoteId}-r${n}`,quoteId,n,sentAt,total);
}

describe('the cohort window [from, to)',()=>{
  const edge:Record<'before'|'sameUtcDayBefore'|'atFrom'|'lastLocalMinute'|'atTo',{id:string}>={} as never;
  beforeAll(()=>{
    edge.before=quoteAt('canyon-ridge','2027-01-01T06:59:59.999Z');
    edge.sameUtcDayBefore=quoteAt('canyon-ridge','2027-01-01T06:30:00.000Z');
    edge.atFrom=quoteAt('canyon-ridge',FROM);
    edge.lastLocalMinute=quoteAt('canyon-ridge','2027-01-11T06:59:59.999Z');
    edge.atTo=quoteAt('canyon-ridge',TO);
  });
  it('includes a quote created at `from` and in the last local minute, and excludes `to` and anything before local midnight',()=>{
    const ids=teamQuoteFacts({from:FROM,to:TO,repIds:ALL}).map(f=>f.id);
    expect(ids).toContain(edge.atFrom.id);
    expect(ids).toContain(edge.lastLocalMinute.id);
    for(const q of [edge.before,edge.sameUtcDayBefore,edge.atTo])expect(ids).not.toContain(q.id);
  });
  it('the same quotes fall in a window computed for another time zone only by its own instants',()=>{
    // Tokyo midnight Jan 1 (UTC+9) is 2026-12-31T15:00Z: the 06:30Z quote is inside that window.
    const ids=teamQuoteFacts({from:'2026-12-31T15:00:00.000Z',to:'2027-01-01T15:00:00.000Z',repIds:ALL}).map(f=>f.id);
    expect(ids).toEqual(expect.arrayContaining([edge.before.id,edge.sameUtcDayBefore.id,edge.atFrom.id]));
    expect(ids).not.toContain(edge.lastLocalMinute.id);
  });
});

describe('teamQuoteFacts',()=>{
  it('counts a reassigned quote under its current owner only',()=>{
    const q=quoteAt('canyon-ridge','2027-01-05T12:00:00.000Z');
    setQuoteRep(q.id,'eli');
    expect(teamQuoteFacts({from:FROM,to:TO,repIds:['eli']}).map(f=>f.id)).toContain(q.id);
    expect(teamQuoteFacts({from:FROM,to:TO,repIds:['mara']}).map(f=>f.id)).not.toContain(q.id);
    expect(teamQuoteFacts({from:FROM,to:TO,repIds:[]})).toEqual([]);
  });

  it('names each quote\'s customer, and narrows to the customers given (Analytics\' customer filter, plan U6)',()=>{
    const q=quoteAt('weber-basin','2027-01-07T12:00:00.000Z');
    setQuoteRep(q.id,'eli');
    expect(teamQuoteFacts({from:FROM,to:TO,repIds:['eli']}).find(f=>f.id===q.id)).toMatchObject({customer_id:'weber-basin',customer_name:'Weber Basin Fabricators'});
    expect(teamQuoteFacts({from:FROM,to:TO,repIds:ALL,customerIds:['weber-basin']}).map(f=>f.customer_id)).toEqual(['weber-basin']);
    expect(teamQuoteFacts({from:FROM,to:TO,repIds:ALL,customerIds:[]})).toEqual([]);
    expect(teamQuoteFacts({from:FROM,to:TO,repIds:ALL,customerIds:null}).length).toBe(teamQuoteFacts({from:FROM,to:TO,repIds:ALL}).length);
    const canyon=teamQuoteFacts({from:FROM,to:TO,repIds:ALL,customerIds:['canyon-ridge']}).map(f=>f.id);
    expect(teamStatusEvents({from:FROM,to:TO,repIds:ALL,customerIds:['canyon-ridge']}).every(e=>canyon.includes(e.quote_id))).toBe(true);
  });

  it('reads the latest sent total, the priced subtotal and cost, recovery × qty, modelled freight, line sources and the decline',async()=>{
    const q=quoteAt('uinta-facility','2027-01-06T12:00:00.000Z',[{itemId:'GLV-N8-L-1000',qty:2,unitPrice:80},{itemId:'SG-CLR-AF',qty:3,unitPrice:null}]);
    addQuoteLine(q.id,{itemId:'FD-45-60Z',qty:4,unitPrice:45,addedBy:'suggestion'},'2027-01-06T12:00:00.000Z');
    addQuoteLine(q.id,{itemId:'WB-4-CS',qty:1,unitPrice:13,addedBy:'upsell'},'2027-01-06T12:00:00.000Z');
    sql('UPDATE quote_lines SET freight_recovery=? WHERE quote_id=? AND line_no=1',30,q.id);
    sql('UPDATE quote_lines SET freight_recovery=? WHERE quote_id=? AND line_no=3',5,q.id);
    revision(q.id,1,250,'2027-01-06T13:00:00.000Z');revision(q.id,2,275.5,'2027-01-06T15:00:00.000Z');
    sql(`UPDATE quotes SET status='declined',revision=2,sent_at=?,responded_at=?,declined_at=?,valid_until='2027-01-20',decline_reason='other',decline_note='Went local',
      fulfillment='delivery',last_rep_touch_at=?,customer_viewed_at=? WHERE id=?`,'2027-01-06T15:00:00.000Z','2027-01-07T15:00:00.000Z','2027-01-07T15:00:00.000Z',
      '2027-01-06T14:00:00.000Z','2027-01-06T16:00:00.000Z',q.id);
    await setQuoteFreightFixture(q.id,{modelled_freight_cents:4213});
    {
      const cost=(sku:string)=>db().prepare('SELECT cost FROM items WHERE id=?').pluck().get(sku) as number;
      const fact=teamQuoteFacts({from:FROM,to:TO,repIds:['nora']}).find(f=>f.id===q.id)!;
      expect(fact).toEqual({id:q.id,quote_number:q.quote_number,rep_id:'nora',customer_id:'uinta-facility',customer_name:'Uinta Facility Services',status:'declined',created_at:'2027-01-06T12:00:00.000Z',
        sent_at:'2027-01-06T15:00:00.000Z',responded_at:'2027-01-07T15:00:00.000Z',valid_until:'2027-01-20',fulfillment:'delivery',
        last_rep_touch_at:'2027-01-06T14:00:00.000Z',customer_viewed_at:'2027-01-06T16:00:00.000Z',decline_reason:'other',decline_note:'Went local',declined_at:'2027-01-07T15:00:00.000Z',
        sent_total:275.5,priced_subtotal:160+180+13,priced_cost:expect.closeTo(2*cost('GLV-N8-L-1000')+4*cost('FD-45-60Z')+cost('WB-4-CS'),2),
        recovered_cents:2*30+4*5,modelled_freight_cents:4213,suggestion_lines:1,upsell_lines:1,suggestions_offered:0});
    }
  });

  it('reads how many suggestions the pop-up behind the quote offered (the quote_requested message names it)',()=>{
    const q=quoteAt('canyon-ridge','2027-01-07T12:00:00.000Z');
    const other=quoteAt('canyon-ridge','2027-01-07T13:00:00.000Z');
    sql("INSERT INTO conversations(id,customer_id,contact_id,started_at) VALUES('team-conv','canyon-ridge',NULL,'2027-01-07T11:00:00.000Z')");
    const message=(id:string,kind:string,payload:unknown)=>sql("INSERT INTO messages(id,conversation_id,role,kind,content,payload,created_at) VALUES(?,'team-conv','assistant',?,'',?,'2027-01-07T11:30:00.000Z')",id,kind,JSON.stringify(payload));
    message('popup-1','item_popup',{fulfillment:'will_call',branch_id:'slc',lines:[],suggestions:[],suggestions_offered:3});
    message('popup-2','item_popup',{fulfillment:'will_call',branch_id:'slc',lines:[]});
    message('req-1','quote_requested',{quote_id:q.id,quote_number:q.quote_number,status:'ready_for_review',popup_message_id:'popup-1'});
    message('req-2','quote_requested',{quote_id:other.id,quote_number:other.quote_number,status:'ready_for_review',popup_message_id:'popup-2'});
    const facts=teamQuoteFacts({from:FROM,to:TO,repIds:['mara']});
    expect(facts.find(f=>f.id===q.id)).toMatchObject({suggestions_offered:3,sent_total:null,status:'ready_for_review',decline_reason:null});
    expect(facts.find(f=>f.id===other.id)).toMatchObject({suggestions_offered:0});
  });
});

describe('teamStatusEvents',()=>{
  it('returns only the status changes of cohort quotes, in time order',()=>{
    const q=quoteAt('canyon-ridge','2027-01-08T12:00:00.000Z');
    const outside=quoteAt('canyon-ridge','2027-02-01T12:00:00.000Z');
    const log=(id:string,kind:string,at:string)=>addQuoteActivity(id,{actor:'rep',kind,message:kind,at});
    log(q.id,'accepted','2027-01-09T12:00:00.000Z');log(q.id,'sent','2027-01-08T14:00:00.000Z');log(q.id,'line_changed','2027-01-08T13:00:00.000Z');
    log(q.id,'reassigned','2027-01-08T15:00:00.000Z');log(outside.id,'sent','2027-02-01T13:00:00.000Z');
    const events=teamStatusEvents({from:FROM,to:TO,repIds:['mara']});
    expect(events.filter(e=>e.quote_id===q.id)).toEqual([{quote_id:q.id,kind:'sent',at:'2027-01-08T14:00:00.000Z'},{quote_id:q.id,kind:'accepted',at:'2027-01-09T12:00:00.000Z'}]);
    expect(events.some(e=>e.quote_id===outside.id)).toBe(false);
    expect(teamStatusEvents({from:FROM,to:TO,repIds:['eli']}).some(e=>e.quote_id===q.id)).toBe(false);
  });
});
