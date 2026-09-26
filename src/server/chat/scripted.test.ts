import {afterEach,describe,expect,it} from 'vitest';
import type {ChatMessage,ClarifyPayload,ItemPopupPayload} from '@/domain';
import {useSeededDatabase} from '../repository/test-db';
import type {ChatReply} from './scripted';

useSeededDatabase();

const ctx={customerId:'wasatch'};
type Turn=Pick<ChatMessage,'role'|'kind'|'payload'>;
const setItemsStock=async(enabled:boolean)=>(await import('../repository')).setAccess('wasatch','items_stock',enabled);
afterEach(async()=>{await setItemsStock(true);});

/** Plays Dana's messages in order, threading the history the way the pipeline stores it. */
async function converse(...messages:string[]){
  const {scriptedReply}=await import('./scripted');
  const history:Turn[]=[];
  const replies:ChatReply[]=[];
  for(const message of messages){
    const r=scriptedReply(ctx,message,history);
    history.push({role:'customer',kind:'text',payload:null},{role:'assistant',kind:r.kind,payload:r.payload});
    replies.push(r);
  }
  return replies;
}

const BOLTS='HCS-12-13-2G8 (Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc, box of 50)';
const T1={sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',category_name:'Abrasives & Cutting'};
const T27={sku:'CW-45-045-T27',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 27',pack:'Box of 25',category_name:'Abrasives & Cutting'};
const REQUEST='Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We\'ll pick up at SLC.';

describe('the scripted Dana conversation (golden steps 1–3)',()=>{
  it('answers the stock question from get_stock, at every branch',async()=>{
    const [stock]=await converse('Do you have 1/2 in grade 8 hex bolts in stock?');
    expect(stock).toEqual({
      kind:'text',payload:null,outcome:'answered',categories:['items_stock'],handled:['items_stock'],toolCalls:['get_stock'],rowCount:1,
      content:`Yes. ${BOLTS} is in stock: 64 at SLC, 22 at Ogden and 8 at Provo.`,
    });
  });

  it('matches the bolts, asks "Type 1 or Type 27 cut-off wheels?" instead of guessing, then opens the pop-up',async()=>{
    const [,clarify,popup]=await converse('Do you have 1/2 in grade 8 hex bolts in stock?',REQUEST,'Type 1');
    expect(clarify).toMatchObject({kind:'clarify',outcome:'answered',toolCalls:['search_items'],rowCount:2,categories:[]});
    expect(clarify.content).toBe(`Got it: 10 × ${BOLTS}.\n\nType 1 or Type 27 cut-off wheels?`);
    expect(clarify.payload).toEqual({
      question:'Type 1 or Type 27 cut-off wheels?',round:1,
      line:{requested_text:'6 boxes of cut-off wheels',qty:6,candidates:[T1,T27]},
      cart:{fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:10,requested_text:'Please quote 10 boxes of the 1/2 in grade 8 hex bolts'}]},
    } satisfies ClarifyPayload);

    expect(popup).toMatchObject({kind:'item_popup',outcome:'answered',toolCalls:['propose_cart'],rowCount:2});
    expect(popup.payload).toEqual({fulfillment:'will_call',branch_id:'slc',lines:[
      {sku:'HCS-12-13-2G8',qty:10,requested_text:'Please quote 10 boxes of the 1/2 in grade 8 hex bolts'},
      {sku:'CW-45-045-T1',qty:6,requested_text:'6 boxes of cut-off wheels'},
    ]} satisfies ItemPopupPayload);
    expect(popup.content).toBe(`Here is your list:\n\n- 10 × ${BOLTS}\n- 6 × CW-45-045-T1 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 1, box of 25)\n\nPickup at SLC. Check the quantities, choose pickup or delivery, then press Request quote.`);
  });

  it('is deterministic: the same conversation gives the same replies',async()=>{
    expect(await converse('Do you have 1/2 in grade 8 hex bolts in stock?',REQUEST,'Type 1'))
      .toEqual(await converse('Do you have 1/2 in grade 8 hex bolts in stock?',REQUEST,'Type 1'));
  });

  it('never shows prices or cost in any reply',async()=>{
    for(const r of await converse('Do you have 1/2 in grade 8 hex bolts in stock?',REQUEST,'not sure',REQUEST,'Type 27')){
      expect(r.content).not.toMatch(/\$|cost|price/i);
      expect(JSON.stringify(r.payload)).not.toMatch(/cost|price/i);
    }
  });
});

describe('answering the clarifying question',()=>{
  it.each([['Type 27','CW-45-045-T27'],['27','CW-45-045-T27'],['the type-1 ones','CW-45-045-T1'],['T1 please','CW-45-045-T1'],['cw-45-045-t27','CW-45-045-T27'],['Type 27 cut-off wheels','CW-45-045-T27']])('"%s" picks %s',async(answer,sku)=>{
    const [,resolved]=await converse(REQUEST,answer);
    expect(resolved.kind).toBe('item_popup');
    expect((resolved.payload as ItemPopupPayload).lines.map(l=>[l.sku,l.qty])).toEqual([['HCS-12-13-2G8',10],[sku,6]]);
  });

  it('takes a new qty from the answer',async()=>{
    const [,resolved]=await converse(REQUEST,'Type 1, 8 boxes');
    expect((resolved.payload as ItemPopupPayload).lines[1]).toMatchObject({sku:'CW-45-045-T1',qty:8});
  });

  it('asks again when the answer does not pick one, then lists the candidates and the rep after round 1',async()=>{
    const [,again,third,popup]=await converse(REQUEST,'not sure','both?','Type 27');
    expect(again).toMatchObject({kind:'clarify',toolCalls:[],payload:{round:2}});
    expect(again.content).toBe('I still need to know which cut-off wheels you mean. Type 1 or Type 27 cut-off wheels?\n\n'
      +'- CW-45-045-T1 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 1, box of 25)\n- CW-45-045-T27 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 27, box of 25)\n\n'
      +'Not sure? Brandi Gallegos can help: (801) 111-2222 or brandi.gallegos@herrickindustrial.com.');
    expect(third.payload).toMatchObject({round:3,cart:{lines:[{sku:'HCS-12-13-2G8'}]}});
    expect((popup.payload as ItemPopupPayload).lines.map(l=>l.sku)).toEqual(['HCS-12-13-2G8','CW-45-045-T27']);
  });

  it('keeps the matched lines when the answer also changes the qty',async()=>{
    const [,resolved]=await converse(REQUEST,'Actually, make it 3 boxes of type 27 cut-off wheels');
    expect(resolved.payload).toMatchObject({lines:[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T27',qty:3}]});
  });

  it('treats a new request that does not answer the question as a fresh request',async()=>{
    const [,fresh]=await converse(REQUEST,'Never mind, just quote 2 boxes of hex bolts');
    expect(fresh.kind).toBe('item_popup');
    expect(fresh.payload).toMatchObject({lines:[{sku:'HCS-12-13-2G8',qty:2}]});
    expect((fresh.payload as ItemPopupPayload).lines).toHaveLength(1);
  });
});

describe('quote requests',()=>{
  it('opens the pop-up straight away when every line is clear',async()=>{
    const [popup]=await converse('Need 4 boxes of Type 27 cut-off wheels and 2 boxes of hex bolts, delivered from Ogden');
    expect(popup).toMatchObject({kind:'item_popup',toolCalls:['search_items','propose_cart']});
    expect(popup.payload).toEqual({fulfillment:'delivery',branch_id:'ogden',lines:[
      {sku:'HCS-12-13-2G8',qty:2,requested_text:'2 boxes of hex bolts'},
      {sku:'CW-45-045-T27',qty:4,requested_text:'Need 4 boxes of Type 27 cut-off wheels'},
    ]});
    expect(popup.content).toContain('Delivery from Ogden.');
  });

  it('reads quantities without mistaking sizes for them, and defaults to 1',async()=>{
    const [a]=await converse('Can you send 12 of the 1/2 in grade 8 hex bolts to Provo? Deliver please.');
    expect(a.payload).toMatchObject({fulfillment:'delivery',branch_id:'provo',lines:[{sku:'HCS-12-13-2G8',qty:12}]});
    const [b]=await converse('I want the 1/2 in grade 8 hex bolts, pickup at Salt Lake');
    expect(b.payload).toMatchObject({fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:1}]});
  });
});

describe('stock questions and access',()=>{
  it('lists both cut-off wheels when the type is not given, and one when it is',async()=>{
    const [both]=await converse('Do you carry cut-off wheels?');
    expect(both).toMatchObject({toolCalls:['get_stock'],rowCount:2});
    expect(both.content).toBe('Here\'s what we have:\n\n'
      +'- CW-45-045-T1 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 1, box of 25): 140 at SLC, 60 at Ogden and 35 at Provo\n'
      +'- CW-45-045-T27 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 27, box of 25): 48 at SLC, 20 at Ogden and 10 at Provo');
    const [one]=await converse('How many type 27 cut-off wheels are on hand?');
    expect(one.content).toBe('Yes. CW-45-045-T27 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 27, box of 25) is in stock: 48 at SLC, 20 at Ogden and 10 at Provo.');
  });

  it('does not answer stock when Items & stock is off, and points to the rep',async()=>{
    await setItemsStock(false);
    const [denied]=await converse('Do you have 1/2 in grade 8 hex bolts in stock?');
    expect(denied).toEqual({kind:'text',payload:null,outcome:'restricted',categories:['items_stock'],handled:[],toolCalls:['get_stock'],rowCount:0,
      content:'Stock levels aren\'t available in chat for your account. Brandi Gallegos can check for you: (801) 111-2222 or brandi.gallegos@herrickindustrial.com.'});
  });
});

describe('off-script messages',()=>{
  it('say this is the scripted demo and point to the rep',async()=>{
    const [r]=await converse('What is our open balance?');
    expect(r).toEqual({kind:'text',payload:null,outcome:'no_rows',categories:[],handled:[],toolCalls:[],rowCount:0,
      content:'I\'m running as a scripted demo, so I can only follow the sample conversation: ask whether the 1/2 in grade 8 hex bolts are in stock, then ask for bolts and cut-off wheels to start a quote. For anything else, Brandi Gallegos can help: (801) 111-2222 or brandi.gallegos@herrickindustrial.com.'});
  });
});
