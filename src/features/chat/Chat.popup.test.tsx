import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {ItemPopupPayload} from '@/domain';
import type {API,ChatAnswer,ChatTurn,ItemPopupContext,Principal,QuoteRequestResult} from '@/lib/contracts';
import {siteRoutes} from '@/components/customer/test-fixtures';
import {CustomerChat,quoteRequestedAfter} from './Chat';

// The item pop-up in the customer chat (task 2.3): it opens when Querent's reply carries the
// matched list, Request quote adds the confirmation, and the bell reads its notifications again (plan U10).

const user:Principal={user_id:'u1',role:'customer_user',customer_id:'wasatch',name:'Wasatch Mechanical Contractors',user_name:'Dana Ortiz',rep_id:null,rep_role:null,contact_id:'dana'};
const PAYLOAD:ItemPopupPayload={fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T1',qty:6}]};
const CONTEXT:ItemPopupContext={
  items:[
    {sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',stock:[{branch_id:'slc',available:64}]},
    {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',stock:[{branch_id:'slc',available:140}]},
  ],
  branches:[{id:'slc',code:'SLC',name:'Salt Lake City'}],stock_shown:true,ship_to:null,rep_name:'Brandi Gallegos',
};
const POPUP_TEXT='Here is your list: two items.';
const POPUP:ChatAnswer={answer:POPUP_TEXT,categories:['items_stock'],outcome:'answered',row_count:2,kind:'item_popup',payload:PAYLOAD};
const CONFIRMATION='Sent to Brandi for review. Your quote number is **Q-24818**. Brandi will price it and send it to you here in chat.';
const RESULT:QuoteRequestResult={quote:{id:'q-24818',quote_number:'Q-24818',status:'ready_for_review'},replayed:false,turn:{
  id:'m-2',question:'Request quote: 10 × HCS-12-13-2G8, 6 × CW-45-045-T1 (pickup at SLC).',answer:CONFIRMATION,categories:[],outcome:'answered',row_count:2,
  kind:'quote_requested',payload:{quote_id:'q-24818',quote_number:'Q-24818',status:'ready_for_review',popup_message_id:'p-1'},
}};
const turn=(t:Partial<ChatTurn>&Pick<ChatTurn,'id'|'question'|'answer'>):ChatTurn=>({categories:[],outcome:'answered',row_count:0,...t});

function makeApi(history:ChatTurn[]=[]){
  const get=vi.fn(async(path:string):Promise<unknown>=>{
    if(path in siteRoutes)return siteRoutes[path as keyof typeof siteRoutes];
    if(path.startsWith('customer/history/'))return history;
    if(path.startsWith('customer/item-popup?'))return CONTEXT;
    throw new Error(`unexpected get ${path}`);
  });
  const send=vi.fn(async(path:string):Promise<unknown>=>{
    if(path==='customer/chat')return POPUP;
    if(path==='customer/quote-requests')return RESULT;
    throw new Error(`unexpected send ${path}`);
  });
  return {api:{get,send} as unknown as API,get,send};
}
const quoteLoads=(get:ReturnType<typeof vi.fn>)=>get.mock.calls.filter(([path])=>path==='customer/notifications').length;

beforeEach(()=>{localStorage.clear();});

describe('the item pop-up in the chat',()=>{
  it('opens when the list arrives; Request quote confirms in the chat and the bell reads again',async()=>{
    const {api,get,send}=makeApi();
    render(<CustomerChat api={api} user={user} signOut={()=>{}}/>);
    const box=await screen.findByLabelText('Ask a question');
    fireEvent.change(box,{target:{value:'Type 1'}});
    fireEvent.click(screen.getByLabelText('Send'));

    const dialog=await screen.findByRole('dialog',{name:'Review your list'});
    expect(await within(dialog).findByText('64 at SLC')).toBeInTheDocument();
    await waitFor(()=>expect(quoteLoads(get)).toBeGreaterThan(0));
    const before=quoteLoads(get);
    fireEvent.click(within(dialog).getByRole('button',{name:'Request quote'}));

    const confirmation=await screen.findByText(/^Sent to Brandi for review\./);
    expect(confirmation.closest('.answer-bubble')).toHaveTextContent('Your quote number is Q-24818.');
    expect(screen.getByText(RESULT.turn.question)).toHaveClass('question-bubble');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Quote Q-24818 requested')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Review list and request quote'})).not.toBeInTheDocument();
    expect(send).toHaveBeenCalledWith('customer/quote-requests','POST',expect.objectContaining({conversation_id:localStorage.getItem('querent-conversation-u1')}));
    await waitFor(()=>expect(quoteLoads(get)).toBe(before+1));
  });

  it('waits to be opened when the list comes back with the history',async()=>{
    const {api}=makeApi([turn({id:'t1',question:'Type 1',answer:POPUP_TEXT,kind:'item_popup',payload:PAYLOAD})]);
    render(<CustomerChat api={api} user={user} signOut={()=>{}}/>);
    const open=await screen.findByRole('button',{name:'Review list and request quote'});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(open);
    expect(await screen.findByRole('dialog',{name:'Review your list'})).toBeInTheDocument();
  });

  it('names the quote a reloaded list became, and offers only the newest list',async()=>{
    const {api}=makeApi([
      turn({id:'t1',question:'Type 1',answer:POPUP_TEXT,kind:'item_popup',payload:PAYLOAD}),
      turn({id:'t2',question:RESULT.turn.question,answer:CONFIRMATION,kind:'quote_requested',payload:RESULT.turn.payload}),
      turn({id:'t3',question:'Quote 2 more boxes of bolts',answer:'Here is your new list.',kind:'item_popup',payload:{...PAYLOAD,lines:[PAYLOAD.lines[0]]}}),
    ]);
    render(<CustomerChat api={api} user={user} signOut={()=>{}}/>);
    expect(await screen.findByText('Quote Q-24818 requested')).toBeInTheDocument();
    expect(screen.getAllByRole('button',{name:'Review list and request quote'})).toHaveLength(1);
  });
});

describe('quoteRequestedAfter',()=>{
  const popup=turn({id:'a',question:'q',answer:'a',kind:'item_popup',payload:PAYLOAD});
  const requested=turn({id:'b',question:'q',answer:'a',kind:'quote_requested',payload:RESULT.turn.payload});
  const text=turn({id:'c',question:'q',answer:'a'});
  it('finds the confirmation after a pop-up, but not past a newer pop-up',()=>{
    expect(quoteRequestedAfter([popup,text,requested],0)).toBe('Q-24818');
    expect(quoteRequestedAfter([popup,text],0)).toBeNull();
    expect(quoteRequestedAfter([popup,popup,requested],0)).toBeNull();
    expect(quoteRequestedAfter([popup,popup,requested],1)).toBe('Q-24818');
  });
});
