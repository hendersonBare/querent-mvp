import {afterEach,describe,expect,it} from 'vitest';
import type {ChatMessage,ClarifyPayload,ItemPopupPayload} from '@/domain';
import {useSeededDatabase} from '../repository/test-db';
import type {ChatReply} from './scripted';

useSeededDatabase();

const ctx={customerId:'timpanogos'};
type Turn=Pick<ChatMessage,'role'|'kind'|'payload'>;
const setItemsStock=async(enabled:boolean)=>(await import('../repository')).setAccess('timpanogos','items_stock',enabled);
afterEach(async()=>{await setItemsStock(true);});

/** Plays Megan's messages in order, threading the history the way the pipeline stores it. */
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

const TAPE='T902170 (Clear Acrylic Tape, Hand Length, 2"x110yd 1.8 MIL, case of 36)';
const wrap=(sku:string,description:string)=>({sku,description:`${description}, Hand Length, 18"x1500' 80 Gauge`,pack:'Case of 4',category_name:'Stretch Wrap'});
const CAST=wrap('SF188CAST','Cast Stretch Wrap');
const BLOWN=wrap('SF188','Blown Stretch Wrap');
const BLACK=wrap('SF188B','Black Blown Stretch Wrap');
const BLUE={...CAST,sku:'SF188CBLUE',description:`${CAST.description}, Blue`};
const GREEN={...CAST,sku:'SF188CGREEN',description:`${CAST.description}, Green`};
const REQUEST='Please quote 10 cases of the 2 in 1.8 mil acrylic tape and 6 cases of 18 in 80 gauge stretch wrap. We\'ll pick up at Spanish Fork.';
const TAPE_LINE={sku:'T902170',qty:10,requested_text:'10 cases of the 2 in 1.8 mil acrylic tape'};
const QUESTION='Cast stretch wrap, blown stretch wrap or black blown stretch wrap?';
const WRAP_LINE='6 cases of 18 in 80 gauge stretch wrap';
const LANDON={name:'Landon Richards',initials:'LR',title:'Account Executive',phone:'(385) 327-3166',email:'landon@boxtpackaging.com'};
const ROUND_2=`I still need to know which 18 in 80 gauge stretch wrap you mean. ${QUESTION}\n\nChoose one below, or drop the line. Not sure? Call Landon Richards.`;

const open=(r:ChatReply)=>(r.payload as ClarifyPayload).open;
const lines=(r:ChatReply)=>(r.payload as ItemPopupPayload).lines.map(l=>[l.sku,l.qty]);

describe('the scripted Megan conversation (golden steps 1–3)',()=>{
  it('answers the stock question from get_stock, at every branch',async()=>{
    const [stock]=await converse('Do you have 2 in acrylic tape in stock?');
    expect(stock).toEqual({
      kind:'text',payload:null,outcome:'answered',categories:['items_stock'],handled:['items_stock'],toolCalls:['get_stock'],rowCount:1,
      content:`Yes. ${TAPE} is in stock: 86 at Spanish Fork.`,
    });
  });

  it('matches every line with search_items: the tape matches, the wrap gets a cast-or-blown question instead of a guess, then the pop-up',async()=>{
    const [,clarify,popup]=await converse('Do you have 2 in acrylic tape in stock?',REQUEST,'Cast');
    expect(clarify).toMatchObject({kind:'clarify',outcome:'answered',toolCalls:['search_items'],categories:['items_stock'],handled:['items_stock']});
    expect(clarify.rowCount).toBeGreaterThan(5);
    expect(clarify.content).toBe(`Got it: 10 × ${TAPE}.\n\n${QUESTION}`);
    expect(clarify.payload).toEqual({
      open:[{requested_text:WRAP_LINE,qty:6,text:'18 in 80 gauge stretch wrap',question:QUESTION,round:1,candidates:[CAST,BLOWN,BLACK,BLUE,GREEN],choices:[]}],
      cart:{fulfillment:'will_call',branch_id:'spanish-fork',lines:[TAPE_LINE]},
      dropped:[],rep:null,
    } satisfies ClarifyPayload);

    expect(popup).toMatchObject({kind:'item_popup',outcome:'answered',toolCalls:['search_items','propose_cart'],rowCount:2,categories:['items_stock'],handled:['items_stock']});
    expect(popup.payload).toEqual({fulfillment:'will_call',branch_id:'spanish-fork',lines:[
      TAPE_LINE,
      {sku:'SF188CAST',qty:6,requested_text:WRAP_LINE},
    ]} satisfies ItemPopupPayload);
    expect(popup.content).toBe(`Here is your list:\n\n- 10 × ${TAPE}\n- 6 × SF188CAST (Cast Stretch Wrap, Hand Length, 18"x1500' 80 Gauge, case of 4)\n\nPickup at Spanish Fork. Check the quantities, choose pickup or delivery, then press Request quote.`);
  });

  it('is deterministic: the same conversation gives the same replies',async()=>{
    expect(await converse('Do you have 2 in acrylic tape in stock?',REQUEST,'not sure','Cast'))
      .toEqual(await converse('Do you have 2 in acrylic tape in stock?',REQUEST,'not sure','Cast'));
  });

  it('never shows prices or cost in any reply',async()=>{
    for(const r of await converse('Do you have 2 in acrylic tape in stock?',REQUEST,'not sure','no idea',REQUEST,'blown','SF188B')){
      expect(r.content).not.toMatch(/\$|cost|price/i);
      expect(JSON.stringify(r.payload)).not.toMatch(/\$|cost|price|margin/i);
    }
  });

  it('agrees with the SKU scorer: the tape is a confident match, and the wrap gets the same question',async()=>{
    const {searchItemsTool}=await import('./tools');
    const verdict=(query:string)=>{const r=searchItemsTool(ctx,{query});if(!r.ok)throw new Error(r.reason);const [line]=r.data.lines;return {confident:line.confident,question:line.question,sku:line.candidates[0]?.sku};};
    expect(verdict('the 2 in 1.8 mil acrylic tape')).toEqual({confident:true,question:null,sku:'T902170'});
    expect(verdict(WRAP_LINE)).toMatchObject({confident:false,question:QUESTION});
    expect(verdict('18 in 80 gauge stretch wrap, clear cast')).toEqual({confident:true,question:null,sku:CAST.sku});
  });
});

describe('the clarification loop: rounds, candidate buttons and the rep',()=>{
  it('asks again after a reply that settles nothing, now with the top 3 wraps as buttons and Landon\'s contact (round 2)',async()=>{
    const [first,second,third]=await converse(REQUEST,'not sure','both?');
    expect(open(first)).toMatchObject([{round:1,choices:[]}]);
    expect(first.payload).toMatchObject({rep:null});
    expect(second).toMatchObject({kind:'clarify',outcome:'answered',categories:['items_stock'],toolCalls:['search_items']});
    expect(second.content).toBe(ROUND_2);
    expect(second.payload).toEqual({
      open:[{requested_text:WRAP_LINE,qty:6,text:'18 in 80 gauge stretch wrap',question:QUESTION,round:2,candidates:[CAST,BLOWN,BLACK,BLUE,GREEN],choices:[CAST,BLOWN,BLACK]}],
      cart:{fulfillment:'will_call',branch_id:'spanish-fork',lines:[TAPE_LINE]},dropped:[],rep:LANDON,
    } satisfies ClarifyPayload);
    // The buttons and the rep stay until the line is settled.
    expect(open(third)).toMatchObject([{round:3,choices:[CAST,BLOWN,BLACK]}]);
    expect(third.payload).toMatchObject({rep:LANDON});
  });

  it('a candidate button picks that wrap and opens the pop-up',async()=>{
    const {pickMessage}=await import('./clarify');
    const [,,popup]=await converse(REQUEST,'not sure',pickMessage(BLACK));
    expect(popup).toMatchObject({kind:'item_popup',toolCalls:['propose_cart']});
    expect(lines(popup)).toEqual([['T902170',10],['SF188B',6]]);
  });

  it('Drop this line drops the wrap and opens the pop-up with the tape, saying so',async()=>{
    const {dropMessage}=await import('./clarify');
    const [,round2,popup]=await converse(REQUEST,'not sure',dropMessage(open((await converse(REQUEST))[0])[0]));
    expect(round2.kind).toBe('clarify');
    expect(popup).toMatchObject({kind:'item_popup',toolCalls:['propose_cart']});
    expect(lines(popup)).toEqual([['T902170',10]]);
    expect(popup.content).toMatch(/^Dropped “6 cases of 18 in 80 gauge stretch wrap”\.\n\nHere is your list:\n\n- 10 × T902170/);
  });

  it('a typed drop works too, and dropping the only line leaves nothing to quote',async()=>{
    const [,dropped]=await converse('Please quote 6 cases of stretch wrap','drop the wrap');
    expect(dropped).toMatchObject({kind:'text',payload:null,categories:['items_stock']});
    expect(dropped.content).toMatch(/^Dropped “6 cases of stretch wrap”\. That leaves nothing to quote/);
  });

  it('keeps each line\'s own round: settling one line leaves the other where it was',async()=>{
    const [first,second]=await converse('Please quote 2 cases of acrylic tape and 6 cases of stretch wrap','the 2 in 1.8 mil ones');
    expect(open(first).map(l=>[l.requested_text,l.question,l.round])).toEqual([
      ['2 cases of acrylic tape','2 in or 3 in clear acrylic tape?',1],
      ['6 cases of stretch wrap','Blown stretch wrap or cast stretch wrap?',1],
    ]);
    expect(first.content).toBe('I need a detail on 2 lines:\n\n- 2 cases of acrylic tape: 2 in or 3 in clear acrylic tape?\n- 6 cases of stretch wrap: Blown stretch wrap or cast stretch wrap?');
    expect(second.payload).toMatchObject({cart:{lines:[{sku:'T902170',qty:2}]},open:[{requested_text:'6 cases of stretch wrap',round:1,choices:[]}],rep:null});
    expect(second.content).toBe(`Got it: 2 × ${TAPE}.\n\nBlown stretch wrap or cast stretch wrap?`);
  });
});

describe('answering the clarifying question',()=>{
  it.each([['Cast','SF188CAST'],['cast please','SF188CAST'],['blown','SF188'],['black','SF188B'],['blue','SF188CBLUE'],['sf188b','SF188B'],['SF188CAST','SF188CAST']])('"%s" picks %s',async(answer,sku)=>{
    const [,resolved]=await converse(REQUEST,answer);
    expect(resolved.kind).toBe('item_popup');
    expect(lines(resolved)).toEqual([['T902170',10],[sku,6]]);
  });

  it('narrows a line without guessing, which counts as a round, then settles it',async()=>{
    const [first,narrowed,resolved]=await converse('Need 4 cases of cast stretch wrap','18 in, 80 gauge','clear');
    expect(open(first)).toMatchObject([{question:'18 in or 20 in cast stretch wrap?',round:1}]);
    expect(narrowed).toMatchObject({kind:'clarify',toolCalls:['search_items']});
    expect(open(narrowed)[0].round).toBe(2);
    expect(open(narrowed)[0].question).not.toBe('18 in or 20 in cast stretch wrap?');
    expect(narrowed.payload).toMatchObject({rep:LANDON});
    expect(lines(resolved)).toEqual([['SF188CAST',4]]);
  });

  it('takes a new qty from the answer',async()=>{
    const [,resolved]=await converse(REQUEST,'Cast, 8 cases');
    expect((resolved.payload as ItemPopupPayload).lines[1]).toMatchObject({sku:'SF188CAST',qty:8});
  });

  it('keeps the matched lines and takes the new qty',async()=>{
    const [,resolved]=await converse(REQUEST,'Actually, make it 3 cases of the cast stretch wrap');
    expect(resolved.payload).toMatchObject({lines:[{sku:'T902170',qty:10},{sku:'SF188CAST',qty:3}]});
  });

  it('treats a new request that does not answer the question as a fresh request',async()=>{
    const [,fresh]=await converse(REQUEST,'Never mind, just quote 2 cases of the 2 in 1.8 mil acrylic tape');
    expect(fresh.kind).toBe('item_popup');
    expect(lines(fresh)).toEqual([['T902170',2]]);
  });

  it('takes pickup or delivery from the answer',async()=>{
    const [,resolved]=await converse(REQUEST,'Cast, and deliver them');
    expect(resolved.payload).toMatchObject({fulfillment:'delivery',branch_id:'spanish-fork'});
  });
});

describe('quote requests',()=>{
  it('opens the pop-up straight away when every line is clear, in the order Megan named them',async()=>{
    const [popup]=await converse('Need 4 cases of 18 in 80 gauge clear cast stretch wrap and 2 cases of the 2 in 1.8 mil acrylic tape, delivered');
    expect(popup).toMatchObject({kind:'item_popup',toolCalls:['search_items','propose_cart']});
    expect(popup.payload).toEqual({fulfillment:'delivery',branch_id:'spanish-fork',lines:[
      {sku:'SF188CAST',qty:4,requested_text:'4 cases of 18 in 80 gauge clear cast stretch wrap'},
      {sku:'T902170',qty:2,requested_text:'2 cases of the 2 in 1.8 mil acrylic tape'},
    ]});
    expect(popup.content).toContain('Delivery from Spanish Fork.');
  });

  it('never guesses a SKU: vague lines are asked about, even for items Megan usually buys',async()=>{
    const [wrapped]=await converse('Need 4 cases of cast stretch wrap');
    expect(open(wrapped).map(l=>l.question)).toEqual(['18 in or 20 in cast stretch wrap?']);
    const [taped]=await converse('Please quote 2 cases of acrylic tape');
    expect(open(taped).map(l=>l.question)).toEqual(['2 in or 3 in clear acrylic tape?']);
  });

  it('reads quantities without mistaking sizes for them, and defaults to 1',async()=>{
    const [a]=await converse('Can you send 12 of the 2 in 1.8 mil acrylic tape? Deliver them please.');
    expect(a.payload).toMatchObject({fulfillment:'delivery',branch_id:'spanish-fork',lines:[{sku:'T902170',qty:12}]});
    const [b]=await converse('I want the 2 in 1.8 mil acrylic tape, pickup at Spanish Fork');
    expect(b.payload).toMatchObject({fulfillment:'will_call',branch_id:'spanish-fork',lines:[{sku:'T902170',qty:1}]});
  });
});

describe('stock questions and access',()=>{
  it('lists both hand wraps when cast or blown is not given, and one when it is',async()=>{
    const [both]=await converse('Do you carry stretch wrap?');
    expect(both).toMatchObject({toolCalls:['get_stock'],rowCount:2});
    expect(both.content).toBe('Here\'s what we have:\n\n'
      +'- SF188CAST (Cast Stretch Wrap, Hand Length, 18"x1500\' 80 Gauge, case of 4): 64 at Spanish Fork\n'
      +'- SF188 (Blown Stretch Wrap, Hand Length, 18"x1500\' 80 Gauge, case of 4): 72 at Spanish Fork');
    const [one]=await converse('How many blown stretch wrap are on hand?');
    expect(one.content).toBe('Yes. SF188 (Blown Stretch Wrap, Hand Length, 18"x1500\' 80 Gauge, case of 4) is in stock: 72 at Spanish Fork.');
  });

  it('answers a stock question in the middle of a request and keeps the request open where it was (2.2 follow-up)',async()=>{
    const [clarify,stock,popup]=await converse(REQUEST,'Do you have 2 in acrylic tape in stock?','Cast');
    // The stock answer, then the open question again; the line stays in round 1 (a side question is no answer).
    expect(stock).toMatchObject({kind:'clarify',outcome:'answered',categories:['items_stock'],handled:['items_stock']});
    expect(stock.toolCalls).toContain('get_stock');
    expect(stock.content).toBe(`Yes. ${TAPE} is in stock: 86 at Spanish Fork.\n\nBack to your quote request: ${QUESTION}`);
    expect(stock.payload).toEqual(clarify.payload);
    // So "Cast" still answers the wrap.
    expect(popup.kind).toBe('item_popup');
    expect(lines(popup)).toEqual([['T902170',10],['SF188CAST',6]]);
    // In round 2 the buttons and Landon come back with it.
    const [,round2,again]=await converse(REQUEST,'not sure','Do you have 2 in acrylic tape in stock?');
    expect(again.payload).toEqual(round2.payload);
    expect(open(again)[0]).toMatchObject({round:2,choices:[CAST,BLOWN,BLACK]});
    expect(again.content).toContain(`\n\nBack to your quote request: ${ROUND_2}`);
  });

  it('does not answer stock when Items & stock is off, and points to the rep',async()=>{
    await setItemsStock(false);
    const [denied]=await converse('Do you have 2 in acrylic tape in stock?');
    expect(denied).toEqual({kind:'text',payload:null,outcome:'restricted',categories:['items_stock'],handled:[],toolCalls:['get_stock'],rowCount:0,
      content:'Stock levels aren\'t available in chat for your account. Landon Richards can check for you: (385) 327-3166 or landon@boxtpackaging.com.'});
  });

  it('does not match items, clarify or open the pop-up when Items & stock is off, and points to the rep',async()=>{
    const content='I can\'t look up items in chat for your account. Landon Richards can take your order: (385) 327-3166 or landon@boxtpackaging.com.';
    const {scriptedReply}=await import('./scripted');
    const [pending]=await converse(REQUEST);
    await setItemsStock(false);
    const denied={kind:'text',payload:null,outcome:'restricted',categories:['items_stock'],handled:[],toolCalls:['search_items'],rowCount:0,content};
    expect((await converse(REQUEST))[0]).toEqual(denied);
    expect((await converse('Please quote 2 cases of the 2 in 1.8 mil acrylic tape'))[0]).toEqual(denied);
    // An open request is not continued either: no buttons, no candidates.
    for(const answer of ['not sure','SF188CAST',`Drop “${WRAP_LINE}”`])
      expect(scriptedReply(ctx,answer,[{role:'assistant',kind:'clarify',payload:pending.payload}])).toEqual(denied);
  });
});

describe('analytics categories (task 0.4 carry-forward)',()=>{
  it('logs the request, clarifying and pop-up turns under Items & stock; off-script turns under none',async()=>{
    const replies=await converse(REQUEST,'not sure','Cast','What is our open balance?');
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
      content:'I\'m running as a scripted demo, so I can only follow the sample conversation: ask whether the 2 in acrylic tape is in stock, then ask for tape and stretch wrap to start a quote. For anything else, Landon Richards can help: (385) 327-3166 or landon@boxtpackaging.com.'});
  });

  it('while a request is open, count as a reply that settles nothing',async()=>{
    const [,r]=await converse(REQUEST,'What is our open balance?');
    expect(r).toMatchObject({kind:'clarify',payload:{open:[{round:2}],rep:LANDON}});
  });
});
