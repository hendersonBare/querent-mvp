import {afterAll,afterEach,beforeAll,describe,expect,it} from 'vitest';
import type {ItemPopupPayload,QuoteRequestedPayload} from '@/domain';
import type {QuoteRequestInput} from '@/lib/contracts';
import {SEED_DATE,useSeededDatabase} from '@/server/repository/test-db';

useSeededDatabase();

// Request quote (task 2.3): the item pop-up's cart becomes a ready_for_review quote for Brandi,
// priced by the pricing engine (1.1), with freight (1.3) and upsells (1.6) available on it, and the
// chat says "Sent to Brandi for review.". Dana's scripted conversation drives the pop-up, as in the
// golden flow.

const NOW=`${SEED_DATE}T18:00:00.000Z`;
const OPTIONS={now:NOW,on:SEED_DATE};
const DANA={customerId:'wasatch',contactId:'dana'};
const REQUEST='Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We\'ll pick up at SLC.';
const CART=[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T1',qty:6}];
/** Keys a customer may never see, and the seeded unit costs of the two items. */
const FORBIDDEN=/cost|margin|floor|suggest|explanation|basis|internal|price|gp/i;
const SEEDED_COSTS=/\b(?:21\.4|24\.1)\b/;

const keys=(value:unknown):string[]=>Array.isArray(value)?value.flatMap(keys):value&&typeof value==='object'?Object.entries(value).flatMap(([k,v])=>[k,...keys(v)]):[];
/** Every leaf value in `value`. */
const leaves=(value:unknown):unknown[]=>Array.isArray(value)?value.flatMap(leaves):value&&typeof value==='object'?Object.values(value).flatMap(leaves):[value];
/** `amount` as a number in text ("36", "36.00", "$36"), not as digits inside an id or a timestamp. */
const mentions=(text:string,amount:number)=>new RegExp(`(?<![\\w.:-])\\$?${String(amount).replace('.','\\.')}(?:0*)?(?![\\w:]|\\.\\d*[1-9])`).test(text);
let scripted:string|undefined;
beforeAll(()=>{scripted=process.env.QUERENT_SCRIPTED;process.env.QUERENT_SCRIPTED='1';});
afterAll(()=>{if(scripted===undefined)delete process.env.QUERENT_SCRIPTED;else process.env.QUERENT_SCRIPTED=scripted;});
afterEach(async()=>{(await import('@/server/repository')).setAccess('wasatch','items_stock',true);});

let conversations=0;
/** Dana's request and "Type 1" in a new conversation: the item pop-up with the bolts and the Type 1 wheels. */
async function popupConversation(messages=[REQUEST,'Type 1']){
  const {ask}=await import('@/server/pipeline');
  const id=`popup-${++conversations}`;
  let last;
  for(const message of messages)last=await ask('wasatch',id,message,{contactId:'dana'});
  expect(last).toMatchObject({kind:'item_popup'});
  return {id,popup:last!.payload as ItemPopupPayload};
}

const body=(conversation_id:string,over:Partial<QuoteRequestInput>={}):QuoteRequestInput=>({conversation_id,fulfillment:'will_call',branch_id:'slc',lines:CART,...over});
const services=async()=>({
  ...(await import('./quote-request')),
  ...(await import('@/server/repository')),
  ...(await import('@/server/freight/quote')),
  ...(await import('@/server/upsells/service')),
  ...(await import('@/server/rep/badges')),
});

describe('Request quote',()=>{
  it('drafts a ready_for_review quote at Querent\'s suggested prices, with explanations, unread for Brandi',async()=>{
    const {requestQuote,quote,repBadges}=await services();
    const {id,popup}=await popupConversation();
    expect(popup).toEqual({fulfillment:'will_call',branch_id:'slc',lines:[
      {sku:'HCS-12-13-2G8',qty:10,requested_text:'Please quote 10 boxes of the 1/2 in grade 8 hex bolts'},
      {sku:'CW-45-045-T1',qty:6,requested_text:'6 boxes of cut-off wheels'},
    ]});
    const badge=repBadges('brandi',{now:NOW}).quotes;

    const result=requestQuote(DANA,body(id),OPTIONS);
    expect(result).toMatchObject({quote:{quote_number:'Q-24818',status:'ready_for_review'},replayed:false});

    const q=quote(result.quote.id)!;
    expect(q).toMatchObject({status:'ready_for_review',revision:0,customer_id:'wasatch',contact_id:'dana',rep_id:'brandi',conversation_id:id,fulfillment:'will_call',
      branch_id:'slc',request_text:REQUEST,requested_at:NOW,unread_for_rep:true,unread_for_customer:false,is_sample:false,
      ship_to_address:'1800 W 10950 S, South Jordan, UT 84095'});
    // Priced like the mockup's sample quote (same SKUs and qty): last paid on the bolts, the contract on the wheels.
    const sample=quote('q-24817')!;
    expect(q.lines.map(l=>[l.sku,l.qty,l.suggested_basis,l.added_by,l.requested_text])).toEqual([
      ['HCS-12-13-2G8',10,'last_paid','querent','Please quote 10 boxes of the 1/2 in grade 8 hex bolts'],
      ['CW-45-045-T1',6,'contract','querent','6 boxes of cut-off wheels'],
    ]);
    q.lines.forEach((line,i)=>{
      expect(line.suggested_price).toBe(sample.lines[i].suggested_price);
      expect(line.unit_price).toBe(line.suggested_price);
      expect(line.price_basis).toBe(line.suggested_basis);
      expect(line.customer_price).toBe(sample.lines[i].customer_price);
      expect(line.explanation).toBe(sample.lines[i].explanation);
      expect(line.unit_cost).toBeGreaterThan(0);
    });
    expect(q.lines[0].explanation).toMatch(/Last paid \$.* on Aug 12/);
    expect(q.lines[1].explanation).toMatch(/contract/i);

    expect(repBadges('brandi',{now:NOW}).quotes).toBe(badge+1);
  });

  it('logs the request in Activity and confirms in the chat with Brandi\'s name and the quote number',async()=>{
    const {requestQuote,quoteActivity,conversationMessages,history}=await services();
    const {id}=await popupConversation([REQUEST,'Not sure','Type 1']);
    const {quote:created,turn}=requestQuote(DANA,body(id),OPTIONS);

    expect(quoteActivity(created.id).map(a=>[a.actor,a.actor_id,a.kind,a.message,a.at])).toEqual([
      ['customer','dana','requested','Dana requested a quote in Querent chat: 2 items, pickup at SLC',NOW],
      ['querent',null,'matched','Querent matched 2 items after 2 clarifying questions',NOW],
      ['querent',null,'drafted','Draft quote built at Querent\'s suggested prices and sent to Brandi for review',NOW],
    ]);

    const answer=`Sent to Brandi for review. Your quote number is **${created.quote_number}**. Brandi will price it and send it to you here in chat.`;
    const question='Request quote: 10 × HCS-12-13-2G8, 6 × CW-45-045-T1 (pickup at SLC).';
    expect(turn).toMatchObject({question,answer,kind:'quote_requested',outcome:'answered',categories:[]});
    expect(turn).not.toHaveProperty('sql');
    const payload=turn.payload as QuoteRequestedPayload;
    expect(payload).toMatchObject({quote_id:created.id,quote_number:created.quote_number,status:'ready_for_review'});

    const messages=conversationMessages('wasatch',id);
    const popup=messages.findLast(m=>m.kind==='item_popup')!;
    expect(payload.popup_message_id).toBe(popup.id);
    expect(messages.slice(-2).map(m=>[m.role,m.kind,m.content])).toEqual([['customer','text',question],['assistant','quote_requested',answer]]);
    // Reopening the chat shows the confirmation after the pop-up.
    expect(history('wasatch',id).slice(-2).map(t=>[t.kind,t.question])).toEqual([['item_popup','Type 1'],['quote_requested',question]]);
  });

  it('prices freight from the quote (task 1.3): will call is free, delivery goes by distance from the branch',async()=>{
    const {requestQuote,quote,freightForQuote}=await services();
    const pickup=requestQuote(DANA,body((await popupConversation()).id),OPTIONS);
    expect(await freightForQuote(quote(pickup.quote.id)!)).toMatchObject({amount:0,computed:{rule:'will_call'},source:'computed'});

    const delivery=requestQuote(DANA,body((await popupConversation()).id,{fulfillment:'delivery'}),OPTIONS);
    const q=quote(delivery.quote.id)!;
    expect(q).toMatchObject({fulfillment:'delivery',branch_id:'slc',ship_to_address:'1800 W 10950 S, South Jordan, UT 84095',ship_to_lat:40.5513,ship_to_lng:-111.933});
    // Spec §5.3's example: 12 mi straight line from SLC, 15.0 road miles, $25 + $2.50 x 15.0 = $62.50.
    expect(await freightForQuote(q)).toMatchObject({amount:62.5,computed:{rule:'distance',miles:15,formula:'$25.00 + $2.50/mi × 15.0 mi = $62.50'},unresolved:false});
  });

  it('leaves the upsell chips (task 1.6) to the quote: nuts and washers for the bolts',async()=>{
    const {requestQuote,quoteUpsells}=await services();
    const {quote:created}=requestQuote(DANA,body((await popupConversation()).id),OPTIONS);
    const chips=quoteUpsells(created.id,{on:SEED_DATE})!;
    expect(chips.map(c=>c.kind)).toContain('matching_fastener');
    const parts=chips.flatMap(c=>c.kind==='matching_fastener'?[c.evidence.part]:[]);
    expect(parts.sort()).toEqual(['nut','washer']);
    expect(chips.filter(c=>c.kind==='matching_fastener').every(c=>c.anchor.sku==='HCS-12-13-2G8')).toBe(true);
  });

  it('takes the customer\'s edits: qty, removed lines, delivery and another branch',async()=>{
    const {requestQuote,quote}=await services();
    const {id}=await popupConversation();
    const {quote:created}=requestQuote(DANA,body(id,{fulfillment:'delivery',branch_id:'ogden',lines:[{sku:'hcs-12-13-2g8',qty:3}]}),OPTIONS);
    const q=quote(created.id)!;
    expect(q).toMatchObject({fulfillment:'delivery',branch_id:'ogden',branch_code:'Ogden'});
    expect(q.lines.map(l=>[l.sku,l.qty])).toEqual([['HCS-12-13-2G8',3]]);
    // 3 boxes is below the 10-box case: a broken case, priced at list (spec §5.1), and the note says why.
    expect(q.lines[0]).toMatchObject({suggested_basis:'list',unit_price:q.lines[0].list_price});
    expect(q.lines[0].explanation).toMatch(/Broken-case/i);
  });

  it('returns only customer-safe fields: no price, cost, margin, basis or explanation anywhere',async()=>{
    const {requestQuote,quote}=await services();
    const result=requestQuote(DANA,body((await popupConversation()).id),OPTIONS);
    expect(keys(result).filter(k=>FORBIDDEN.test(k))).toEqual([]);
    const values=leaves(result);
    const strings=values.filter((v):v is string=>typeof v==='string');
    expect(strings.join('\n')).not.toMatch(SEEDED_COSTS);
    expect(strings.join('\n')).not.toContain('$');
    const amounts=quote(result.quote.id)!.lines.flatMap(l=>[l.unit_price!,l.suggested_price!,l.customer_price!,l.unit_cost]);
    expect(amounts.every(a=>a>0)).toBe(true);
    for(const amount of amounts){
      expect(values).not.toContain(amount);
      expect(strings.filter(text=>mentions(text,amount))).toEqual([]);
    }
    // The scanners do catch a leak.
    expect(mentions('Bolts at $36.00 each',36)).toBe(true);
    expect(mentions('conv 1f36a-36b 02:13:36Z Q-24836',36)).toBe(false);
  });
});

describe('one quote per pop-up',()=>{
  it('replays the quote when Request quote is pressed again, without a second quote, badge or confirmation',async()=>{
    const {requestQuote,quotes,conversationMessages,repBadges}=await services();
    const {id}=await popupConversation();
    const count=quotes({customerId:'wasatch'}).length,badge=repBadges('brandi',{now:NOW}).quotes;
    const first=requestQuote(DANA,body(id),OPTIONS);
    const again=requestQuote(DANA,body(id,{lines:[{sku:'HCS-12-13-2G8',qty:99}]}),OPTIONS);
    expect(again).toMatchObject({replayed:true,quote:first.quote});
    expect(again.turn).toMatchObject({question:first.turn.question,answer:first.turn.answer,kind:'quote_requested'});
    expect(quotes({customerId:'wasatch'})).toHaveLength(count+1);
    expect(repBadges('brandi',{now:NOW}).quotes).toBe(badge+1);
    expect(conversationMessages('wasatch',id).filter(m=>m.kind==='quote_requested')).toHaveLength(1);
  });

  it('makes a new quote from a new pop-up in the same conversation',async()=>{
    const {requestQuote}=await services();
    const {ask}=await import('@/server/pipeline');
    const {id}=await popupConversation();
    const first=requestQuote(DANA,body(id),OPTIONS);
    expect(await ask('wasatch',id,'Please quote 2 boxes of the 1/2 in grade 8 hex bolts',{contactId:'dana'})).toMatchObject({kind:'item_popup'});
    const second=requestQuote(DANA,body(id,{lines:[{sku:'HCS-12-13-2G8',qty:2}]}),OPTIONS);
    expect(second.replayed).toBe(false);
    expect(second.quote.quote_number).not.toBe(first.quote.quote_number);
  });
});

describe('server-side validation',()=>{
  it.each([
    ['a price',{unit_price:1}],
    ['a cost',{cost:1}],
  ])('refuses %s: the rep sets prices',async(_,extra)=>{
    const {requestQuote,QuoteRequestError}=await services();
    const {id}=await popupConversation();
    expect(()=>requestQuote(DANA,{...body(id),...extra},OPTIONS)).toThrow(QuoteRequestError);
    expect(()=>requestQuote(DANA,{...body(id),...extra},OPTIONS)).toThrow(/Your rep sets the prices/);
    expect(()=>requestQuote(DANA,body(id,{lines:[{sku:'HCS-12-13-2G8',qty:10,unit_price:0.01} as never]}),OPTIONS)).toThrow(/not unit_price/);
  });

  it.each([0,-1,1.5,10000,Number.NaN,'10' as never])('refuses qty %s',async qty=>{
    const {requestQuote}=await services();
    const {id}=await popupConversation();
    expect(()=>requestQuote(DANA,body(id,{lines:[{sku:'HCS-12-13-2G8',qty}]}),OPTIONS)).toThrow('Quantities must be whole numbers from 1 to 9999.');
  });

  it('refuses unknown, unlisted and repeated SKUs, and an empty list',async()=>{
    const {requestQuote}=await services();
    const {id}=await popupConversation();
    const refusal=(lines:QuoteRequestInput['lines'])=>{try{requestQuote(DANA,body(id,{lines}),OPTIONS);}catch(e){return [(e as {status:number}).status,(e as Error).message];}return undefined;};
    expect(refusal([{sku:'NOPE-1',qty:1}])).toEqual([422,'No item has SKU NOPE-1.']);
    expect(refusal([{sku:'GLV-N8-L-1000',qty:1}])).toEqual([422,'GLV-N8-L-1000 isn\'t on your list. Ask for it in the chat to add it.']);
    expect(refusal([{sku:'HCS-12-13-2G8',qty:1},{sku:'hcs-12-13-2g8',qty:2}])).toEqual([422,'HCS-12-13-2G8 is on the request twice.']);
    expect(refusal([])).toEqual([422,'Your list is empty: keep at least one item.']);
  });

  it('refuses an unknown branch or fulfillment, and a body that is not a request',async()=>{
    const {requestQuote}=await services();
    const {id}=await popupConversation();
    expect(()=>requestQuote(DANA,body(id,{branch_id:'boise'}),OPTIONS)).toThrow('Choose a branch: SLC, Ogden, Provo.');
    expect(()=>requestQuote(DANA,body(id,{fulfillment:'drone' as never}),OPTIONS)).toThrow('Choose pickup or delivery.');
    for(const bad of [null,'x',[],{}])expect(()=>requestQuote(DANA,bad,OPTIONS)).toThrow(/incomplete|Choose|empty/);
  });

  it("refuses another customer's conversation as not found, and a chat with no pop-up",async()=>{
    const {requestQuote,createConversation}=await services();
    const {ask}=await import('@/server/pipeline');
    const {id}=await popupConversation();
    expect(()=>requestQuote({customerId:'great-basin',contactId:null},body(id),OPTIONS)).toThrow(expect.objectContaining({status:404,message:'Conversation not found.'}));
    expect(()=>requestQuote(DANA,body('no-such-chat'),OPTIONS)).toThrow(expect.objectContaining({status:404}));
    await ask('wasatch','no-popup','Do you have 1/2 in grade 8 hex bolts in stock?',{contactId:'dana'});
    expect(()=>requestQuote(DANA,body('no-popup'),OPTIONS)).toThrow(expect.objectContaining({status:409,message:'There is no item list to quote in this chat. Ask for the items first.'}));
    createConversation({id:'empty-chat',customerId:'wasatch'});
    expect(()=>requestQuote(DANA,body('empty-chat'),OPTIONS)).toThrow(expect.objectContaining({status:409}));
  });

  it('refuses delivery without a ship-to on file, writing nothing',async()=>{
    const {requestQuote,createConversation,addMessage,quotes}=await services();
    createConversation({id:'great-basin-chat',customerId:'great-basin'});
    addMessage('great-basin','great-basin-chat',{role:'assistant',kind:'item_popup',content:'Here is your list.',payload:{fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:1}]}});
    const who={customerId:'great-basin',contactId:null};
    const request={conversation_id:'great-basin-chat',fulfillment:'delivery' as const,branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:1}]};
    expect(()=>requestQuote(who,request,OPTIONS)).toThrow(expect.objectContaining({status:422,message:'We have no delivery address on file for your account. Choose pickup, or ask Brandi to add one.'}));
    expect(quotes({customerId:'great-basin'})).toEqual([]);
    // Pickup needs no address.
    expect(requestQuote(who,{...request,fulfillment:'will_call'},OPTIONS).quote.status).toBe('ready_for_review');
  });

  it('quotes a pop-up opened before Items & stock was turned off',async()=>{
    const {requestQuote,setAccess}=await services();
    const {id}=await popupConversation();
    setAccess('wasatch','items_stock',false);
    expect(requestQuote(DANA,body(id),OPTIONS).quote.status).toBe('ready_for_review');
  });
});
