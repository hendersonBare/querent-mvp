import {afterEach,describe,expect,it} from 'vitest';
import type {ClarifyPayload,ItemPopupPayload} from '@/domain';
import {useSeededDatabase} from '../repository/test-db';

useSeededDatabase();

// The clarification loop's engine (task 2.2): per-line request state, round counting, the candidate
// buttons and the rep's contact from round 2, and the button replies (pick a candidate, drop a line).

const ctx={customerId:'wasatch',today:'2026-09-23'};
const clarify=()=>import('./clarify');
const setItemsStock=async(enabled:boolean)=>(await import('../repository')).setAccess('wasatch','items_stock',enabled);
afterEach(async()=>{await setItemsStock(true);});

const PICKUP_SLC={fulfillment:'will_call',branch_id:'slc'} as const;
const WHEELS=['CW-45-045-T1','CW-45-045-T27','CW-45-090-T27','CW-6-045-T1','FD-45-60Z'];
const BRANDI={name:'Brandi Gallegos',initials:'BG',title:expect.any(String),phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'};

/** search_items for some requested lines, one per line. */
async function search(...lines:string[]){
  const {searchItemsTool}=await import('./tools');
  const result=searchItemsTool(ctx,{query:lines.join('\n')});
  if(!result.ok)throw new Error(result.reason);
  return result.data.lines;
}
/** A request as the matcher leaves it. */
async function request(...lines:string[]){
  const {startRequest}=await clarify();
  return startRequest(await search(...lines),PICKUP_SLC);
}
const skus=(state:ClarifyPayload)=>state.open.map(l=>l.candidates.map(c=>c.sku));
const rounds=(state:ClarifyPayload)=>state.open.map(l=>[l.requested_text,l.round]);

describe('line-resolution state',()=>{
  it('matches the confident lines and opens the rest in round 1 with the 1.4 question',async()=>{
    const state=await request('Please quote 10 boxes of the 1/2 in grade 8 hex bolts','6 boxes of cut-off wheels');
    expect(state.cart).toEqual({...PICKUP_SLC,lines:[{sku:'HCS-12-13-2G8',qty:10,requested_text:'Please quote 10 boxes of the 1/2 in grade 8 hex bolts'}]});
    expect(state.open).toEqual([{
      requested_text:'6 boxes of cut-off wheels',qty:6,round:1,text:'cut-off wheels',choices:[],
      // History fills only a missing size, so the type is still asked (task 1.4 carry-forward).
      question:'Type 1 or Type 27 cut-off wheels?',
      candidates:WHEELS.map(sku=>expect.objectContaining({sku})),
    }]);
    expect(state).toMatchObject({dropped:[],rep:null});
  });

  it('gives every unconfident line its own question, and a line with no qty a qty of 1',async()=>{
    const state=await request('cut-off wheels','2 in ratchet straps','widgets');
    expect(state.cart.lines).toEqual([]);
    expect(state.open.map(l=>[l.requested_text,l.qty,l.question])).toEqual([
      ['cut-off wheels',1,'Type 1 or Type 27 cut-off wheels?'],
      ['2 in ratchet straps',1,'27 ft or 30 ft ratchet straps?'],
      ['widgets',1,'I couldn\'t find that item. Can you describe it another way, or give the SKU?'],
    ]);
    expect(skus(state)[2]).toEqual([]);
  });

  it('carries candidates as identity only: no stock, prices or cost',async()=>{
    const {present}=await clarify();
    const state=present(ctx,{...await request('cut-off wheels'),open:(await request('cut-off wheels')).open.map(l=>({...l,round:2}))});
    const keys=(v:unknown):string[]=>Array.isArray(v)?v.flatMap(keys):v&&typeof v==='object'?Object.entries(v).flatMap(([k,x])=>[k,...keys(x)]):[];
    expect(new Set(keys(state.open))).toEqual(new Set(['requested_text','qty','question','round','candidates','choices','text','sku','description','pack','category_name']));
    expect(JSON.stringify(state)).not.toMatch(/\$|cost|price|margin|stock|available/i);
  });
});

describe('round counting ("after 2 rounds")',()=>{
  it('moves every open line to the next round when a reply settles nothing',async()=>{
    const {advance}=await clarify();
    const first=await request('6 boxes of cut-off wheels','2 in ratchet straps');
    const second=advance(first,[]);
    const third=advance(second,[]);
    expect([rounds(first),rounds(second),rounds(third)]).toEqual([
      [['6 boxes of cut-off wheels',1],['2 in ratchet straps',1]],
      [['6 boxes of cut-off wheels',2],['2 in ratchet straps',2]],
      [['6 boxes of cut-off wheels',3],['2 in ratchet straps',3]],
    ]);
  });

  it('leaves the other lines in their round when a reply picks or drops a line',async()=>{
    const {advance}=await clarify();
    const first=await request('6 boxes of cut-off wheels','2 in ratchet straps');
    const picked=advance(first,[{kind:'match',index:0,sku:'CW-45-045-T1'}]);
    expect(picked.cart.lines).toEqual([{sku:'CW-45-045-T1',qty:6,requested_text:'6 boxes of cut-off wheels'}]);
    expect(rounds(picked)).toEqual([['2 in ratchet straps',1]]);
    const dropped=advance(advance(first,[]),[{kind:'drop',index:1}]);
    expect(rounds(dropped)).toEqual([['6 boxes of cut-off wheels',2]]);
    expect(dropped.dropped).toEqual([{requested_text:'2 in ratchet straps',qty:1}]);
  });

  it('counts a reply that narrows a line without settling it as a round',async()=>{
    const {advance}=await clarify();
    const first=await request('6 boxes of cut-off wheels');
    const [narrowed]=await search('cut-off wheels Type 27');
    const next=advance(first,[{kind:'refine',index:0,line:narrowed}]);
    expect(next.open).toEqual([expect.objectContaining({
      requested_text:'6 boxes of cut-off wheels',qty:6,round:2,text:'cut-off wheels Type 27',question:'.045 in or .090 in cut-off wheels?',
    })]);
    expect(skus(next)[0].slice(0,2)).toEqual(['CW-45-045-T27','CW-45-090-T27']);
  });

  it('starts lines added mid-request in round 1, and matches the confident ones',async()=>{
    const {advance}=await clarify();
    const first=advance(await request('6 boxes of cut-off wheels'),[]);
    const next=advance(first,[],{added:await search('12 of the 2 in x 30 ft ratchet straps','2 in ratchet straps')});
    expect(rounds(next)).toEqual([['6 boxes of cut-off wheels',3],['2 in ratchet straps',1]]);
    expect(next.cart.lines).toEqual([{sku:'RS-2-30-FH',qty:12,requested_text:'12 of the 2 in x 30 ft ratchet straps'}]);
  });
});

describe('what the customer sees: candidate buttons and the rep from round 2',()=>{
  it('shows no buttons and no rep in round 1',async()=>{
    const {present}=await clarify();
    const shown=present(ctx,await request('6 boxes of cut-off wheels'));
    expect(shown.open[0].choices).toEqual([]);
    expect(shown.rep).toBeNull();
  });

  it('shows the top 3 candidates as buttons and the assigned rep\'s name, phone and email from round 2',async()=>{
    const {advance,present}=await clarify();
    const round2=present(ctx,advance(await request('6 boxes of cut-off wheels'),[]));
    expect(round2.open[0].choices.map(c=>c.sku)).toEqual(['CW-45-045-T1','CW-45-045-T27','CW-45-090-T27']);
    expect(round2.open[0].choices[0]).toEqual({sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',category_name:'Abrasives & Cutting'});
    expect(round2.rep).toEqual(BRANDI);
    const round3=present(ctx,advance(round2,[]));
    expect(round3.open[0].choices).toHaveLength(3);
    expect(round3.rep).toEqual(BRANDI);
  });

  it('shows fewer buttons when there are fewer candidates, and none for an unknown item',async()=>{
    const {advance,present}=await clarify();
    const shown=present(ctx,advance(await request('smoke safety glasses or clear','widgets'),[]));
    expect(shown.open.map(l=>l.choices.length)).toEqual([2,0]);
  });

  it('shows buttons only on lines in round 2 or later, and the rep while any line is',async()=>{
    const {advance,present}=await clarify();
    const shown=present(ctx,advance(await request('6 boxes of cut-off wheels'),[],{added:await search('2 in ratchet straps')}));
    expect(shown.open.map(l=>[l.round,l.choices.length])).toEqual([[2,3],[1,0]]);
    expect(shown.rep).toEqual(BRANDI);
  });

  it('shows no rep when none is assigned',async()=>{
    const {advance,present}=await clarify();
    expect(present({customerId:'nobody'},advance(await request('cut-off wheels'),[])).rep).toBeNull();
  });
});

describe('button replies',()=>{
  it('a candidate button picks that candidate for its line',async()=>{
    const {pickMessage,readAction}=await clarify();
    const state=await request('6 boxes of cut-off wheels','2 in ratchet straps');
    const t27=state.open[0].candidates[1];
    expect(pickMessage(t27)).toBe('CW-45-045-T27 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 27)');
    expect(readAction(pickMessage(t27),state)).toEqual([{kind:'match',index:0,sku:'CW-45-045-T27'}]);
    expect(readAction('RS-2-30-FH please',state)).toEqual([{kind:'match',index:1,sku:'RS-2-30-FH'}]);
    // Typed SKUs work in any case, never by prefix, and only for the line's candidates.
    expect(readAction('cw-45-045-t1',state)).toEqual([{kind:'match',index:0,sku:'CW-45-045-T1'}]);
    expect(readAction('CW-45-045-T1X',state)).toEqual([]);
    expect(readAction('HCS-12-13-2G8',state)).toEqual([]);
    expect(readAction('CW-45-045-T1 and RS-2-27-JH',state)).toEqual([{kind:'match',index:0,sku:'CW-45-045-T1'},{kind:'match',index:1,sku:'RS-2-27-JH'}]);
    expect(readAction('CW-45-045-T1 or CW-45-045-T27?',state)).toEqual([]);
  });

  it('takes a stated qty with a typed pick, but never from the button\'s description',async()=>{
    const {readAction}=await clarify();
    const state=await request('6 boxes of cut-off wheels');
    expect(readAction('CW-45-045-T1, 8 boxes',state)).toEqual([{kind:'match',index:0,sku:'CW-45-045-T1',qty:8}]);
    expect(readAction('CW-45-045-T1 (Wheel, 12 boxes of 25)',state)).toEqual([{kind:'match',index:0,sku:'CW-45-045-T1'}]);
  });

  it('a Drop button drops the line it names; a typed drop works when it is clear which line',async()=>{
    const {dropMessage,readAction}=await clarify();
    const two=await request('6 boxes of cut-off wheels','2 in ratchet straps');
    expect(dropMessage(two.open[1])).toBe('Drop “2 in ratchet straps”');
    expect(readAction(dropMessage(two.open[1]),two)).toEqual([{kind:'drop',index:1}]);
    expect(readAction('drop the wheels',two)).toEqual([{kind:'drop',index:0}]);
    expect(readAction('Please remove the ratchet straps line.',two)).toEqual([{kind:'drop',index:1}]);
    expect(readAction('drop it',two)).toEqual([]);
    const one=await request('6 boxes of cut-off wheels');
    expect(readAction('skip that line',one)).toEqual([{kind:'drop',index:0}]);
    expect(readAction('Forget it',one)).toEqual([{kind:'drop',index:0}]);
    // Not drops: other words that start the same way, or a line that isn't open.
    expect(readAction('Drop cloths, 2 boxes',one)).toEqual([]);
    expect(readAction('I dropped the ball',one)).toEqual([]);
  });
});

describe('continuing a request from a new search (live chat)',()=>{
  it('matches, refines, repeats and adds by candidate overlap',async()=>{
    const {continueWith}=await clarify();
    const state=await request('Please quote 10 boxes of the 1/2 in grade 8 hex bolts','6 boxes of cut-off wheels','2 in ratchet straps');
    const again=await search('10 boxes HCS-12-13-2G8','6 boxes Type 1 cut-off wheels','2 in ratchet straps, 30 ft','nitrile gloves');
    const {outcomes,added}=continueWith(state,again);
    expect(outcomes).toEqual([{kind:'match',index:0,sku:'CW-45-045-T1',qty:6},{kind:'match',index:1,sku:'RS-2-30-FH',qty:undefined}]);
    expect(added.map(l=>l.requested_text)).toEqual(['nitrile gloves']);
    const narrowed=continueWith(state,await search('Type 27 cut-off wheels'));
    expect(narrowed.outcomes).toEqual([{kind:'refine',index:0,line:expect.objectContaining({question:'.045 in or .090 in cut-off wheels?'}),qty:undefined}]);
  });
});

describe('replies',()=>{
  const ask=async()=>{const {requestReply}=await clarify();return requestReply;};

  it('round 1: what matched, then the question, as a clarify reply with no buttons',async()=>{
    const r=(await ask())(ctx,undefined,await request('Please quote 10 boxes of the 1/2 in grade 8 hex bolts','6 boxes of cut-off wheels'),{toolCalls:['search_items']});
    expect(r).toMatchObject({kind:'clarify',outcome:'answered',categories:['items_stock'],handled:['items_stock'],toolCalls:['search_items']});
    expect(r.content).toBe('Got it: 10 × HCS-12-13-2G8 (Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc, box of 50).\n\nType 1 or Type 27 cut-off wheels?');
    expect((r.payload as ClarifyPayload).open[0].choices).toEqual([]);
  });

  it('round 2: says the line is still open and points to the buttons and the rep',async()=>{
    const {advance}=await clarify();
    const before=await request('Please quote 10 boxes of the 1/2 in grade 8 hex bolts','6 boxes of cut-off wheels');
    const r=(await ask())(ctx,before,advance(before,[]));
    expect(r.content).toBe('I still need to know which cut-off wheels you mean. Type 1 or Type 27 cut-off wheels?\n\nChoose one below, or drop the line. Not sure? Call Brandi Gallegos.');
    expect(r.payload).toMatchObject({rep:BRANDI,open:[{round:2,choices:[{sku:'CW-45-045-T1'},{sku:'CW-45-045-T27'},{sku:'CW-45-090-T27'}]}],cart:{lines:[{sku:'HCS-12-13-2G8'}]}});
  });

  it('names a line by its item words, without the qty or the request words',async()=>{
    const {advance}=await clarify();
    for(const said of ['Please quote the cut-off wheels','Need 6 boxes of cut-off wheels','some cut-off wheels']){
      const before=await request(said);
      expect((await ask())(ctx,before,advance(before,[])).content).toMatch(/^I still need to know which cut-off wheels you mean\. /);
    }
  });

  it('asks about several open lines at once',async()=>{
    const {advance}=await clarify();
    const before=await request('6 boxes of cut-off wheels','2 in ratchet straps');
    expect((await ask())(ctx,undefined,before).content).toBe('I need a detail on 2 lines:\n\n- 6 boxes of cut-off wheels: Type 1 or Type 27 cut-off wheels?\n- 2 in ratchet straps: 27 ft or 30 ft ratchet straps?');
    expect((await ask())(ctx,before,advance(before,[])).content).toBe('I still need a detail on 2 lines:\n\n- 6 boxes of cut-off wheels: Type 1 or Type 27 cut-off wheels?\n- 2 in ratchet straps: 27 ft or 30 ft ratchet straps?\n\nChoose below, or drop a line you can\'t settle. Not sure? Call Brandi Gallegos.');
    const picked=advance(before,[{kind:'match',index:1,sku:'RS-2-27-JH'}]);
    expect((await ask())(ctx,before,picked).content).toBe('Got it: 1 × RS-2-27-JH (Ratchet strap 2 in x 27 ft, 3,333 lb WLL, J-hooks, each).\n\nType 1 or Type 27 cut-off wheels?');
  });

  it('opens the item pop-up once every line is matched, through propose_cart',async()=>{
    const {advance}=await clarify();
    const before=await request('Please quote 10 boxes of the 1/2 in grade 8 hex bolts','6 boxes of cut-off wheels');
    const r=(await ask())(ctx,before,advance(before,[{kind:'match',index:0,sku:'CW-45-045-T1'}]));
    expect(r).toMatchObject({kind:'item_popup',toolCalls:['propose_cart'],rowCount:2,categories:['items_stock'],handled:['items_stock']});
    expect(r.payload).toEqual({...PICKUP_SLC,lines:[
      {sku:'HCS-12-13-2G8',qty:10,requested_text:'Please quote 10 boxes of the 1/2 in grade 8 hex bolts'},
      {sku:'CW-45-045-T1',qty:6,requested_text:'6 boxes of cut-off wheels'},
    ]} satisfies ItemPopupPayload);
    expect(r.content).toMatch(/^Here is your list:\n\n- 10 × HCS-12-13-2G8 .*\n- 6 × CW-45-045-T1 .*\n\nPickup at SLC\./);
  });

  it('opens the pop-up with the rest when the customer drops the last open line, and says so',async()=>{
    const {advance}=await clarify();
    const before=advance(await request('Please quote 10 boxes of the 1/2 in grade 8 hex bolts','6 boxes of cut-off wheels'),[]);
    const r=(await ask())(ctx,before,advance(before,[{kind:'drop',index:0}]));
    expect(r.kind).toBe('item_popup');
    expect((r.payload as ItemPopupPayload).lines.map(l=>l.sku)).toEqual(['HCS-12-13-2G8']);
    expect(r.content).toMatch(/^Dropped “6 boxes of cut-off wheels”\.\n\nHere is your list:/);
  });

  it('says there is nothing to quote when every line is dropped',async()=>{
    const {advance}=await clarify();
    const before=await request('6 boxes of cut-off wheels');
    const r=(await ask())(ctx,before,advance(before,[{kind:'drop',index:0}]));
    expect(r).toMatchObject({kind:'text',payload:null,categories:['items_stock']});
    expect(r.content).toBe('Dropped “6 boxes of cut-off wheels”. That leaves nothing to quote: tell me what you need. Brandi Gallegos can help too: (801) 111-2222 or brandi.gallegos@herrickindustrial.com.');
  });

  it('does not open the pop-up when Items & stock is off',async()=>{
    const {advance}=await clarify();
    const before=await request('6 boxes of cut-off wheels');
    await setItemsStock(false);
    expect((await ask())(ctx,before,advance(before,[{kind:'match',index:0,sku:'CW-45-045-T1'}]))).toMatchObject({kind:'text',outcome:'restricted',toolCalls:['propose_cart']});
  });
});

describe('the open request in a conversation',()=>{
  it('is the last assistant message when it is a clarifying reply in this shape',async()=>{
    const {pendingRequest}=await clarify();
    const state=await request('6 boxes of cut-off wheels');
    expect(pendingRequest([{role:'customer'},{role:'assistant',kind:'clarify',payload:state},{role:'customer'}])).toBe(state);
    expect(pendingRequest([{role:'assistant',kind:'clarify',payload:state},{role:'assistant',kind:'text',payload:null}])).toBeUndefined();
    // A clarify payload from before task 2.2 is not resumed.
    expect(pendingRequest([{role:'assistant',kind:'clarify',payload:{question:'Type 1 or Type 27 cut-off wheels?',round:1,line:{},cart:{}}}])).toBeUndefined();
    expect(pendingRequest([])).toBeUndefined();
  });
});

describe('pickup or delivery',()=>{
  it('reads delivery and a branch from the message, else keeps what the request had',async()=>{
    const {whereIn}=await clarify();
    expect(whereIn('We\'ll pick up at SLC.')).toEqual({fulfillment:'will_call',branch_id:'slc'});
    expect(whereIn('delivered from Ogden')).toEqual({fulfillment:'delivery',branch_id:'ogden'});
    expect(whereIn('Type 1',{fulfillment:'delivery',branch_id:'provo'})).toEqual({fulfillment:'delivery',branch_id:'provo'});
    expect(whereIn('anything')).toEqual({fulfillment:'will_call',branch_id:'slc'});
  });
});
