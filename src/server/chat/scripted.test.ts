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
const wheel=(sku:string,description:string)=>({sku,description:`Cut-off wheel ${description}`,pack:'Box of 25',category_name:'Abrasives & Cutting'});
const T1=wheel('CW-45-045-T1','4.5 x .045 x 7/8 in, Type 1');
const T27=wheel('CW-45-045-T27','4.5 x .045 x 7/8 in, Type 27');
const T27_090=wheel('CW-45-090-T27','4.5 x .090 x 7/8 in, Type 27');
const T1_6=wheel('CW-6-045-T1','6 x .045 x 7/8 in, Type 1');
const FLAP={sku:'FD-45-60Z',description:expect.stringContaining('Flap disc'),pack:expect.any(String),category_name:'Abrasives & Cutting'};
const REQUEST='Please quote 10 boxes of the 1/2 in grade 8 hex bolts and 6 boxes of cut-off wheels. We\'ll pick up at SLC.';
const BOLTS_LINE={sku:'HCS-12-13-2G8',qty:10,requested_text:'10 boxes of the 1/2 in grade 8 hex bolts'};
const BRANDI={name:'Brandi Gallegos',initials:'BG',title:expect.any(String),phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'};
const ROUND_2='I still need to know which cut-off wheels you mean. Type 1 or Type 27 cut-off wheels?\n\nChoose one below, or drop the line. Not sure? Call Brandi Gallegos.';

const open=(r:ChatReply)=>(r.payload as ClarifyPayload).open;
const lines=(r:ChatReply)=>(r.payload as ItemPopupPayload).lines.map(l=>[l.sku,l.qty]);

describe('the scripted Dana conversation (golden steps 1–3)',()=>{
  it('answers the stock question from get_stock, at every branch',async()=>{
    const [stock]=await converse('Do you have 1/2 in grade 8 hex bolts in stock?');
    expect(stock).toEqual({
      kind:'text',payload:null,outcome:'answered',categories:['items_stock'],handled:['items_stock'],toolCalls:['get_stock'],rowCount:1,
      content:`Yes. ${BOLTS} is in stock: 64 at SLC, 22 at Ogden and 8 at Provo.`,
    });
  });

  it('matches every line with search_items: the bolts match, the wheels get "Type 1 or Type 27 cut-off wheels?" instead of a guess, then the pop-up',async()=>{
    const [,clarify,popup]=await converse('Do you have 1/2 in grade 8 hex bolts in stock?',REQUEST,'Type 1');
    expect(clarify).toMatchObject({kind:'clarify',outcome:'answered',toolCalls:['search_items'],categories:['items_stock'],handled:['items_stock']});
    expect(clarify.rowCount).toBeGreaterThan(5);
    expect(clarify.content).toBe(`Got it: 10 × ${BOLTS}.\n\nType 1 or Type 27 cut-off wheels?`);
    expect(clarify.payload).toEqual({
      open:[{requested_text:'6 boxes of cut-off wheels',qty:6,text:'cut-off wheels',question:'Type 1 or Type 27 cut-off wheels?',round:1,candidates:[T1,T27,T27_090,T1_6,FLAP],choices:[]}],
      cart:{fulfillment:'will_call',branch_id:'slc',lines:[BOLTS_LINE]},
      dropped:[],rep:null,
    } satisfies ClarifyPayload);

    expect(popup).toMatchObject({kind:'item_popup',outcome:'answered',toolCalls:['search_items','propose_cart'],rowCount:2,categories:['items_stock'],handled:['items_stock']});
    expect(popup.payload).toEqual({fulfillment:'will_call',branch_id:'slc',lines:[
      BOLTS_LINE,
      {sku:'CW-45-045-T1',qty:6,requested_text:'6 boxes of cut-off wheels'},
    ]} satisfies ItemPopupPayload);
    expect(popup.content).toBe(`Here is your list:\n\n- 10 × ${BOLTS}\n- 6 × CW-45-045-T1 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 1, box of 25)\n\nPickup at SLC. Check the quantities, choose pickup or delivery, then press Request quote.`);
  });

  it('is deterministic: the same conversation gives the same replies',async()=>{
    expect(await converse('Do you have 1/2 in grade 8 hex bolts in stock?',REQUEST,'not sure','Type 1'))
      .toEqual(await converse('Do you have 1/2 in grade 8 hex bolts in stock?',REQUEST,'not sure','Type 1'));
  });

  it('never shows prices or cost in any reply',async()=>{
    for(const r of await converse('Do you have 1/2 in grade 8 hex bolts in stock?',REQUEST,'not sure','no idea',REQUEST,'Type 27','CW-45-090-T27')){
      expect(r.content).not.toMatch(/\$|cost|price/i);
      expect(JSON.stringify(r.payload)).not.toMatch(/\$|cost|price|margin/i);
    }
  });

  it('agrees with the SKU scorer: the bolts are a confident match, and the wheels get the same question',async()=>{
    const {searchItemsTool}=await import('./tools');
    const verdict=(query:string)=>{const r=searchItemsTool(ctx,{query});if(!r.ok)throw new Error(r.reason);const [line]=r.data.lines;return {confident:line.confident,question:line.question,sku:line.candidates[0]?.sku};};
    expect(verdict('the 1/2 in grade 8 hex bolts')).toEqual({confident:true,question:null,sku:'HCS-12-13-2G8'});
    expect(verdict('6 boxes of cut-off wheels')).toMatchObject({confident:false,question:'Type 1 or Type 27 cut-off wheels?'});
    expect(verdict('cut-off wheels, Type 1')).toEqual({confident:true,question:null,sku:T1.sku});
  });
});

describe('the clarification loop: rounds, candidate buttons and the rep',()=>{
  it('asks again after a reply that settles nothing, now with the top 3 wheels as buttons and Brandi\'s contact (round 2)',async()=>{
    const [first,second,third]=await converse(REQUEST,'not sure','both?');
    expect(open(first)).toMatchObject([{round:1,choices:[]}]);
    expect(first.payload).toMatchObject({rep:null});
    expect(second).toMatchObject({kind:'clarify',outcome:'answered',categories:['items_stock'],toolCalls:['search_items']});
    expect(second.content).toBe(ROUND_2);
    expect(second.payload).toEqual({
      open:[{requested_text:'6 boxes of cut-off wheels',qty:6,text:'cut-off wheels',question:'Type 1 or Type 27 cut-off wheels?',round:2,candidates:[T1,T27,T27_090,T1_6,FLAP],choices:[T1,T27,T27_090]}],
      cart:{fulfillment:'will_call',branch_id:'slc',lines:[BOLTS_LINE]},dropped:[],rep:BRANDI,
    } satisfies ClarifyPayload);
    // The buttons and the rep stay until the line is settled.
    expect(open(third)).toMatchObject([{round:3,choices:[T1,T27,T27_090]}]);
    expect(third.payload).toMatchObject({rep:BRANDI});
  });

  it('a candidate button picks that wheel and opens the pop-up',async()=>{
    const {pickMessage}=await import('./clarify');
    const [,,popup]=await converse(REQUEST,'not sure',pickMessage(T27_090));
    expect(popup).toMatchObject({kind:'item_popup',toolCalls:['propose_cart']});
    expect(lines(popup)).toEqual([['HCS-12-13-2G8',10],['CW-45-090-T27',6]]);
  });

  it('Drop this line drops the wheels and opens the pop-up with the bolts, saying so',async()=>{
    const {dropMessage}=await import('./clarify');
    const [,round2,popup]=await converse(REQUEST,'not sure',dropMessage(open((await converse(REQUEST))[0])[0]));
    expect(round2.kind).toBe('clarify');
    expect(popup).toMatchObject({kind:'item_popup',toolCalls:['propose_cart']});
    expect(lines(popup)).toEqual([['HCS-12-13-2G8',10]]);
    expect(popup.content).toMatch(/^Dropped “6 boxes of cut-off wheels”\.\n\nHere is your list:\n\n- 10 × HCS-12-13-2G8/);
  });

  it('a typed drop works too, and dropping the only line leaves nothing to quote',async()=>{
    const [,dropped]=await converse('Please quote 6 boxes of cut-off wheels','drop the wheels');
    expect(dropped).toMatchObject({kind:'text',payload:null,categories:['items_stock']});
    expect(dropped.content).toMatch(/^Dropped “6 boxes of cut-off wheels”\. That leaves nothing to quote/);
  });

  it('keeps each line\'s own round: settling one line leaves the other where it was',async()=>{
    const [first,second]=await converse('Please quote 2 boxes of hex bolts and 6 boxes of cut-off wheels','the 1/2 in grade 8 ones');
    expect(open(first).map(l=>[l.requested_text,l.question,l.round])).toEqual([
      ['2 boxes of hex bolts','Grade 5 or Grade 8 hex cap screws?',1],
      ['6 boxes of cut-off wheels','Type 1 or Type 27 cut-off wheels?',1],
    ]);
    expect(first.content).toBe('I need a detail on 2 lines:\n\n- 2 boxes of hex bolts: Grade 5 or Grade 8 hex cap screws?\n- 6 boxes of cut-off wheels: Type 1 or Type 27 cut-off wheels?');
    expect(second.payload).toMatchObject({cart:{lines:[{sku:'HCS-12-13-2G8',qty:2}]},open:[{requested_text:'6 boxes of cut-off wheels',round:1,choices:[]}],rep:null});
    expect(second.content).toBe(`Got it: 2 × ${BOLTS}.\n\nType 1 or Type 27 cut-off wheels?`);
  });
});

describe('answering the clarifying question',()=>{
  it.each([['Type 1','CW-45-045-T1'],['the type-1 ones','CW-45-045-T1'],['T1 please','CW-45-045-T1'],['1','CW-45-045-T1'],['cw-45-045-t27','CW-45-045-T27'],['CW-6-045-T1','CW-6-045-T1']])('"%s" picks %s',async(answer,sku)=>{
    const [,resolved]=await converse(REQUEST,answer);
    expect(resolved.kind).toBe('item_popup');
    expect(lines(resolved)).toEqual([['HCS-12-13-2G8',10],[sku,6]]);
  });

  it.each(['Type 27','27','Type 27 cut-off wheels'])('"%s" narrows the line to the two Type 27 wheels without guessing, which counts as a round',async answer=>{
    const [,narrowed,resolved]=await converse(REQUEST,answer,'.045');
    expect(narrowed).toMatchObject({kind:'clarify',toolCalls:['search_items']});
    expect(open(narrowed)).toEqual([{requested_text:'6 boxes of cut-off wheels',qty:6,text:'cut-off wheels Type 27',question:'.045 in or .090 in cut-off wheels?',round:2,candidates:[T27,T27_090],choices:[T27,T27_090]}]);
    expect(narrowed.content).toBe('I still need to know which cut-off wheels you mean. .045 in or .090 in cut-off wheels?\n\nChoose one below, or drop the line. Not sure? Call Brandi Gallegos.');
    expect(narrowed.payload).toMatchObject({rep:BRANDI});
    expect(lines(resolved)).toEqual([['HCS-12-13-2G8',10],['CW-45-045-T27',6]]);
  });

  it('takes a new qty from the answer',async()=>{
    const [,resolved]=await converse(REQUEST,'Type 1, 8 boxes');
    expect((resolved.payload as ItemPopupPayload).lines[1]).toMatchObject({sku:'CW-45-045-T1',qty:8});
  });

  it('keeps the matched lines and the new qty while it narrows',async()=>{
    const [,narrowed,resolved]=await converse(REQUEST,'Actually, make it 3 boxes of type 27 cut-off wheels','CW-45-045-T27');
    expect(narrowed.payload).toMatchObject({cart:{lines:[BOLTS_LINE]},open:[{qty:3,question:'.045 in or .090 in cut-off wheels?'}]});
    expect(resolved.payload).toMatchObject({lines:[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T27',qty:3}]});
  });

  it('treats a new request that does not answer the question as a fresh request',async()=>{
    const [,fresh]=await converse(REQUEST,'Never mind, just quote 2 boxes of the 1/2 in grade 8 hex bolts');
    expect(fresh.kind).toBe('item_popup');
    expect(lines(fresh)).toEqual([['HCS-12-13-2G8',2]]);
  });

  it('takes pickup or delivery from the answer',async()=>{
    const [,resolved]=await converse(REQUEST,'Type 1, and deliver them from Provo');
    expect(resolved.payload).toMatchObject({fulfillment:'delivery',branch_id:'provo'});
  });
});

describe('quote requests',()=>{
  it('opens the pop-up straight away when every line is clear, in the order Dana named them',async()=>{
    const [popup]=await converse('Need 4 boxes of Type 1 cut-off wheels and 2 boxes of the 1/2 in grade 8 hex bolts, delivered from Ogden');
    expect(popup).toMatchObject({kind:'item_popup',toolCalls:['search_items','propose_cart']});
    expect(popup.payload).toEqual({fulfillment:'delivery',branch_id:'ogden',lines:[
      {sku:'CW-45-045-T1',qty:4,requested_text:'4 boxes of Type 1 cut-off wheels'},
      {sku:'HCS-12-13-2G8',qty:2,requested_text:'2 boxes of the 1/2 in grade 8 hex bolts'},
    ]});
    expect(popup.content).toContain('Delivery from Ogden.');
  });

  it('never guesses a SKU: vague lines are asked about, even for items Dana usually buys',async()=>{
    const [wheels]=await converse('Need 4 boxes of Type 27 cut-off wheels');
    expect(open(wheels).map(l=>l.question)).toEqual(['.045 in or .090 in cut-off wheels?']);
    const [bolts]=await converse('Please quote 2 boxes of hex bolts');
    expect(open(bolts).map(l=>l.question)).toEqual(['Grade 5 or Grade 8 hex cap screws?']);
  });

  it('reads quantities without mistaking sizes for them, and defaults to 1',async()=>{
    const [a]=await converse('Can you send 12 of the 1/2 in grade 8 hex bolts? Deliver them from Provo please.');
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

  it('does not match items, clarify or open the pop-up when Items & stock is off, and points to the rep',async()=>{
    const content='I can\'t look up items in chat for your account. Brandi Gallegos can take your order: (801) 111-2222 or brandi.gallegos@herrickindustrial.com.';
    const {scriptedReply}=await import('./scripted');
    const [pending]=await converse(REQUEST);
    await setItemsStock(false);
    const denied={kind:'text',payload:null,outcome:'restricted',categories:['items_stock'],handled:[],toolCalls:['search_items'],rowCount:0,content};
    expect((await converse(REQUEST))[0]).toEqual(denied);
    expect((await converse('Please quote 2 boxes of the 1/2 in grade 8 hex bolts'))[0]).toEqual(denied);
    // An open request is not continued either: no buttons, no candidates.
    for(const answer of ['not sure','CW-45-045-T1','Drop “6 boxes of cut-off wheels”'])
      expect(scriptedReply(ctx,answer,[{role:'assistant',kind:'clarify',payload:pending.payload}])).toEqual(denied);
  });
});

describe('analytics categories (task 0.4 carry-forward)',()=>{
  it('logs the request, clarifying and pop-up turns under Items & stock; off-script turns under none',async()=>{
    const replies=await converse(REQUEST,'not sure','Type 1','What is our open balance?');
    expect(replies.map(r=>[r.kind,r.categories,r.handled])).toEqual([
      ['clarify',['items_stock'],['items_stock']],
      ['clarify',['items_stock'],['items_stock']],
      ['item_popup',['items_stock'],['items_stock']],
      ['text',[],[]],
    ]);
  });
});

describe('off-script messages',()=>{
  it('say this is the scripted demo and point to the rep',async()=>{
    const [r]=await converse('What is our open balance?');
    expect(r).toEqual({kind:'text',payload:null,outcome:'no_rows',categories:[],handled:[],toolCalls:[],rowCount:0,
      content:'I\'m running as a scripted demo, so I can only follow the sample conversation: ask whether the 1/2 in grade 8 hex bolts are in stock, then ask for bolts and cut-off wheels to start a quote. For anything else, Brandi Gallegos can help: (801) 111-2222 or brandi.gallegos@herrickindustrial.com.'});
  });

  it('while a request is open, count as a reply that settles nothing',async()=>{
    const [,r]=await converse(REQUEST,'What is our open balance?');
    expect(r).toMatchObject({kind:'clarify',payload:{open:[{round:2}],rep:BRANDI}});
  });
});
