import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import type {ItemPopupPayload} from '@/domain';
import type {API,ItemPopupContext,QuoteRequestResult} from '@/lib/contracts';
import {ItemPopup,parseQty,stockAt} from './ItemPopup';

// The item pop-up (task 2.3): item, SKU, qty and stock at the chosen branch, no prices; qty edits,
// removing lines, pickup or delivery and the branch; then Request quote.

const PAYLOAD:ItemPopupPayload={fulfillment:'will_call',branch_id:'slc',lines:[
  {sku:'HCS-12-13-2G8',qty:10,requested_text:'Please quote 10 boxes of the 1/2 in grade 8 hex bolts'},
  {sku:'CW-45-045-T1',qty:6,requested_text:'6 boxes of cut-off wheels'},
]};
const CONTEXT:ItemPopupContext={
  items:[
    {sku:'HCS-12-13-2G8',description:'Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc',pack:'Box of 50',stock:[{branch_id:'slc',available:64},{branch_id:'ogden',available:22},{branch_id:'provo',available:8}]},
    {sku:'CW-45-045-T1',description:'Cut-off wheel 4.5 x .045 x 7/8 in, Type 1',pack:'Box of 25',stock:[{branch_id:'slc',available:140},{branch_id:'ogden',available:60},{branch_id:'provo',available:0}]},
  ],
  branches:[{id:'slc',code:'SLC',name:'Salt Lake City'},{id:'ogden',code:'Ogden',name:'Ogden'},{id:'provo',code:'Provo',name:'Provo'}],
  stock_shown:true,ship_to:'1800 W 10950 S, South Jordan, UT 84095',rep_name:'Brandi Gallegos',
};
const RESULT:QuoteRequestResult={quote:{id:'q-24818',quote_number:'Q-24818',status:'ready_for_review'},replayed:false,turn:{
  id:'m-1',question:'Request quote: 10 × HCS-12-13-2G8, 6 × CW-45-045-T1 (pickup at SLC).',answer:'Sent to Brandi for review. Your quote number is **Q-24818**.',
  categories:[],outcome:'answered',row_count:2,kind:'quote_requested',payload:{quote_id:'q-24818',quote_number:'Q-24818',status:'ready_for_review',popup_message_id:'p-1'},
}};

function setup({context=CONTEXT,send=vi.fn().mockResolvedValue(RESULT),active=true,requested=null as string|null,autoOpen=true}={}){
  const get=vi.fn(async(path:string)=>{
    if(path===`customer/item-popup?skus=${encodeURIComponent('HCS-12-13-2G8,CW-45-045-T1')}`)return context;
    throw new Error(`unexpected get ${path}`);
  });
  const api={get,send} as unknown as API;
  const onRequested=vi.fn();
  const view=render(<ItemPopup api={api} conversationId="conv-1" payload={PAYLOAD} active={active} requested={requested} autoOpen={autoOpen} onRequested={onRequested}/>);
  return {...view,get,send,onRequested};
}
const dialog=()=>screen.getByRole('dialog',{name:'Review your list'});
const line=(sku:string)=>within(dialog()).getByLabelText(`Qty for ${sku}`).closest('li')!;
const requestButton=()=>within(dialog()).getByRole('button',{name:'Request quote'});

describe('ItemPopup',()=>{
  it('opens with every line: item, SKU, qty and stock at the chosen branch, pickup at SLC chosen, and no prices',async()=>{
    const {get}=setup();
    expect(dialog()).toHaveAttribute('aria-modal','true');
    expect(dialog()).toHaveFocus();
    expect(await within(line('HCS-12-13-2G8')).findByText('64 at SLC')).toBeInTheDocument();
    expect(line('HCS-12-13-2G8')).toHaveTextContent('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc');
    expect(line('HCS-12-13-2G8')).toHaveTextContent('Box of 50');
    expect(within(dialog()).getByLabelText('Qty for HCS-12-13-2G8')).toHaveValue(10);
    expect(within(dialog()).getByLabelText('Qty for CW-45-045-T1')).toHaveValue(6);
    expect(line('CW-45-045-T1')).toHaveTextContent('140 at SLC');
    expect(within(dialog()).getByRole('radio',{name:'Pickup'})).toBeChecked();
    expect(within(dialog()).getByRole('combobox',{name:'Branch'})).toHaveValue('slc');
    expect(dialog()).toHaveTextContent('Stock at SLC');
    expect(dialog()).toHaveTextContent('2 items');
    expect(dialog()).toHaveTextContent('Brandi prices the quote');
    expect(dialog().textContent).not.toContain('$');
    expect(requestButton()).toBeEnabled();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('shows stock at the branch the customer picks, and flags lines it can\'t fill',async()=>{
    setup();
    await within(dialog()).findByText('64 at SLC');
    fireEvent.change(within(dialog()).getByRole('combobox',{name:'Branch'}),{target:{value:'provo'}});
    expect(line('HCS-12-13-2G8')).toHaveTextContent('8 at Provo');
    expect(line('HCS-12-13-2G8')).toHaveTextContent('Short 2');
    expect(line('CW-45-045-T1')).toHaveTextContent('None at Provo');
    expect(line('CW-45-045-T1')).toHaveTextContent('Out of stock');
    expect(dialog()).toHaveTextContent('Stock at Provo');
    // Short stock only informs: the rep still quotes it.
    expect(requestButton()).toBeEnabled();
  });

  it('edits a qty, and holds Request quote until every qty is a whole number from 1 to 9999',async()=>{
    setup();
    await within(dialog()).findByText('64 at SLC');
    const qty=within(dialog()).getByLabelText('Qty for HCS-12-13-2G8');
    for(const bad of ['0','','1.5','10000','-2']){
      fireEvent.change(qty,{target:{value:bad}});
      expect(qty).toHaveAttribute('aria-invalid','true');
      expect(requestButton()).toBeDisabled();
    }
    fireEvent.change(qty,{target:{value:'70'}});
    expect(requestButton()).toBeEnabled();
    expect(line('HCS-12-13-2G8')).toHaveTextContent('Short 6');
  });

  it('removes lines; with none left it says so and there is nothing to request',async()=>{
    setup();
    await within(dialog()).findByText('64 at SLC');
    fireEvent.click(within(dialog()).getByRole('button',{name:'Remove CW-45-045-T1'}));
    expect(within(dialog()).queryByLabelText('Qty for CW-45-045-T1')).not.toBeInTheDocument();
    expect(dialog()).toHaveTextContent('1 item');
    fireEvent.click(within(dialog()).getByRole('button',{name:'Remove HCS-12-13-2G8'}));
    expect(dialog()).toHaveTextContent('Your list is empty.');
    expect(requestButton()).toBeDisabled();
  });

  it('delivery shows the ship-to on file; without one it points to pickup and holds the request',async()=>{
    setup();
    await within(dialog()).findByText('64 at SLC');
    fireEvent.click(within(dialog()).getByRole('radio',{name:'Delivery'}));
    expect(dialog()).toHaveTextContent('Delivers to 1800 W 10950 S, South Jordan, UT 84095.');
    expect(requestButton()).toBeEnabled();
  });

  it('holds delivery when there is no ship-to on file',async()=>{
    setup({context:{...CONTEXT,ship_to:null}});
    await within(dialog()).findByText('64 at SLC');
    fireEvent.click(within(dialog()).getByRole('radio',{name:'Delivery'}));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('We have no delivery address on file for your account. Choose pickup, or ask Brandi to add one.');
    expect(requestButton()).toBeDisabled();
    fireEvent.click(within(dialog()).getByRole('radio',{name:'Pickup'}));
    expect(requestButton()).toBeEnabled();
  });

  it('Request quote sends the customer\'s choices only, then closes and hands back the result',async()=>{
    let resolve!:(r:QuoteRequestResult)=>void;
    const send=vi.fn(()=>new Promise<QuoteRequestResult>(r=>{resolve=r;}));
    const {onRequested}=setup({send});
    await within(dialog()).findByText('64 at SLC');
    fireEvent.change(within(dialog()).getByLabelText('Qty for CW-45-045-T1'),{target:{value:'8'}});
    fireEvent.click(within(dialog()).getByRole('radio',{name:'Delivery'}));
    fireEvent.change(within(dialog()).getByRole('combobox',{name:'Branch'}),{target:{value:'ogden'}});
    fireEvent.click(requestButton());
    // One request, even on a double click.
    expect(within(dialog()).getByRole('button',{name:'Requesting…'})).toBeDisabled();
    fireEvent.click(within(dialog()).getByRole('button',{name:'Requesting…'}));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('customer/quote-requests','POST',{conversation_id:'conv-1',fulfillment:'delivery',branch_id:'ogden',
      lines:[{sku:'HCS-12-13-2G8',qty:10},{sku:'CW-45-045-T1',qty:8}]});
    resolve(RESULT);
    await waitFor(()=>expect(onRequested).toHaveBeenCalledWith(RESULT));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows why a request failed and lets the customer try again',async()=>{
    const send=vi.fn().mockRejectedValueOnce(new Error('Choose a branch: SLC, Ogden, Provo.')).mockResolvedValueOnce(RESULT);
    const {onRequested}=setup({send});
    await within(dialog()).findByText('64 at SLC');
    fireEvent.click(requestButton());
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Choose a branch: SLC, Ogden, Provo.');
    expect(onRequested).not.toHaveBeenCalled();
    fireEvent.click(requestButton());
    await waitFor(()=>expect(onRequested).toHaveBeenCalledWith(RESULT));
  });

  it('says stock isn\'t shown when the customer has Items & stock off, and still requests',async()=>{
    setup({context:{...CONTEXT,stock_shown:false,items:CONTEXT.items.map(i=>({...i,stock:null}))}});
    expect(await within(dialog()).findByText('Stock isn’t shown for your account. Brandi confirms availability on the quote.')).toBeInTheDocument();
    expect(line('HCS-12-13-2G8')).toHaveTextContent('Not shown');
    expect(line('HCS-12-13-2G8')).not.toHaveTextContent('at SLC');
    expect(requestButton()).toBeEnabled();
  });

  it('closes with Escape or Close and reopens from the chat, reading stock again',async()=>{
    const {get}=setup();
    await within(dialog()).findByText('64 at SLC');
    fireEvent.keyDown(dialog(),{key:'Escape'});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const reopen=screen.getByRole('button',{name:'Review list and request quote'});
    fireEvent.click(reopen);
    await within(dialog()).findByText('64 at SLC');
    expect(get).toHaveBeenCalledTimes(2);
    fireEvent.click(within(dialog()).getByRole('button',{name:'Close'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps Tab inside the dialog',async()=>{
    setup();
    await within(dialog()).findByText('64 at SLC');
    const first=within(dialog()).getByRole('radio',{name:'Pickup'});
    const request=requestButton();
    request.focus();
    fireEvent.keyDown(dialog(),{key:'Tab'});
    expect(first).toHaveFocus();
    fireEvent.keyDown(dialog(),{key:'Tab',shiftKey:true});
    expect(request).toHaveFocus();
  });

  it('stays closed until opened when reloaded from history',()=>{
    setup({autoOpen:false});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Review list and request quote'})).toBeInTheDocument();
  });

  it('names the quote once requested, and offers nothing for a list that was superseded',()=>{
    const {unmount}=setup({requested:'Q-24818'});
    expect(screen.getByText('Quote Q-24818 requested')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    unmount();
    const {container}=setup({active:false});
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('stockAt and parseQty',()=>{
  it('reads stock against the qty',()=>{
    expect(stockAt(64,10,'SLC')).toEqual({tone:'ok',text:'64 at SLC'});
    expect(stockAt(10,10,'SLC')).toEqual({tone:'ok',text:'10 at SLC'});
    expect(stockAt(8,10,'Provo')).toEqual({tone:'short',text:'8 at Provo',note:'Short 2'});
    expect(stockAt(0,10,'Provo')).toEqual({tone:'out',text:'None at Provo',note:'Out of stock'});
    expect(stockAt(8,null,'Provo')).toEqual({tone:'ok',text:'8 at Provo'});
  });

  it('accepts whole numbers from 1 to 9999 only',()=>{
    expect(['1','10',' 12 ','9999'].map(parseQty)).toEqual([1,10,12,9999]);
    expect(['0','','-1','1.5','10000','1e2x','abc'].map(parseQty)).toEqual([null,null,null,null,null,null,null]);
  });
});
