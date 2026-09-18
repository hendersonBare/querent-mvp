import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {it,expect,vi,beforeEach} from 'vitest';
import {CustomerChat} from './Chat';
import type {API,AccessRule,ChatAnswer,ChatTurn,Principal} from '@/lib/contracts';
const user:Principal={user_id:'u1',role:'customer_user',customer_id:'c1',name:'Wasatch Excavation'};
function makeApi(get:API['get'],send:API['send']):API{return {get,send};}
function emptyGet():API['get']{return vi.fn(async(path:string):Promise<any>=>{
 if(path==='customer/panel') return [] as AccessRule[];
 if(path.startsWith('customer/history/')) return [] as ChatTurn[];
 throw new Error(`unexpected get ${path}`);
}) as unknown as API['get'];}
beforeEach(()=>{localStorage.clear();});
it('collapses the contact panel by default on narrow viewports',async()=>{
 const original=window.matchMedia;
 window.matchMedia=((query:string)=>({matches:query.includes('800px'),media:query,onchange:null,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){},dispatchEvent:()=>false})) as unknown as typeof window.matchMedia;
 try{
  render(<CustomerChat api={makeApi(emptyGet(),vi.fn())} user={user} signOut={()=>{}}/>);
  expect(await screen.findByLabelText('Expand contacts')).toBeInTheDocument();
  expect(screen.queryByText('Here to help.')).not.toBeInTheDocument();
 }finally{window.matchMedia=original;}
});
it('does not show a permanent loading placeholder once the contact panel fails to load',async()=>{
 const get=vi.fn(async(path:string):Promise<any>=>{
  if(path==='customer/panel') throw new Error('Unable to load your contacts. Please try again.');
  if(path.startsWith('customer/history/')) return [] as ChatTurn[];
  throw new Error(`unexpected get ${path}`);
 }) as unknown as API['get'];
 render(<CustomerChat api={makeApi(get,vi.fn())} user={user} signOut={()=>{}}/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load your contacts. Please try again.');
 expect(screen.queryByText('Loading contacts…')).not.toBeInTheDocument();
});
it('submits a question on send and renders the answer',async()=>{
 const answer:ChatAnswer={answer:'PO-48213 shipped Sep 12.',sql:null,categories:['orders_current'],outcome:'answered',row_count:1};
 const send=vi.fn().mockResolvedValue(answer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'What is the status of PO-48213?'}});
 fireEvent.click(screen.getByLabelText('Send question'));
 expect(await screen.findByText('PO-48213 shipped Sep 12.')).toBeInTheDocument();
 expect(send).toHaveBeenCalledWith('customer/chat','POST',expect.objectContaining({question:'What is the status of PO-48213?'}));
});
it('submits a question on Enter without Shift',async()=>{
 const answer:ChatAnswer={answer:'Answered.',sql:null,categories:['other'],outcome:'answered',row_count:0};
 const send=vi.fn().mockResolvedValue(answer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'What are my financing balances?'}});
 fireEvent.keyDown(box,{key:'Enter',shiftKey:false});
 await waitFor(()=>expect(send).toHaveBeenCalled());
 expect(await screen.findByText('Answered.')).toBeInTheDocument();
});
it('renders a combined answer covering more than one category',async()=>{
 const answer:ChatAnswer={answer:'PO-48213 is shipped. Your financing balance is unavailable here.',sql:'select 1',categories:['orders_current','financing'],outcome:'answered',row_count:1};
 const send=vi.fn().mockResolvedValue(answer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'Status of PO-48213 and my financing balance?'}});
 fireEvent.click(screen.getByLabelText('Send question'));
 expect(await screen.findByText(/PO-48213 is shipped/)).toBeInTheDocument();
});
it('renders the restricted message without a query disclosure',async()=>{
 const answer:ChatAnswer={answer:'That information isn’t available here.',sql:null,categories:['financing'],outcome:'restricted',row_count:0};
 const send=vi.fn().mockResolvedValue(answer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'What are my financing balances?'}});
 fireEvent.click(screen.getByLabelText('Send question'));
 expect(await screen.findByText('That information isn’t available here.')).toBeInTheDocument();
 expect(screen.queryByText('Show query')).not.toBeInTheDocument();
});
it('does not expose executed SQL in the customer chat',async()=>{
 const answer:ChatAnswer={answer:'You have 12 hydraulic filters in stock.',sql:'select * from erp.parts_stock',categories:['parts_stock'],outcome:'answered',row_count:1};
 const send=vi.fn().mockResolvedValue(answer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'What hydraulic filters are in stock?'}});
 fireEvent.click(screen.getByLabelText('Send question'));
 await screen.findByText('You have 12 hydraulic filters in stock.');
 expect(screen.queryByText('Show query')).not.toBeInTheDocument();
 expect(screen.queryByText('select * from erp.parts_stock')).not.toBeInTheDocument();
});
it('recovers from an API failure by restoring the question and showing an error',async()=>{
 const send=vi.fn().mockRejectedValue(new Error('The request could not be completed. Please try again.'));
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'What is the status of PO-48213?'}});
 fireEvent.click(screen.getByLabelText('Send question'));
 expect(await screen.findByRole('alert')).toHaveTextContent('The request could not be completed. Please try again.');
 expect(box).toHaveValue('What is the status of PO-48213?');
 expect(screen.queryByText('What is the status of PO-48213?',{selector:'.question-bubble'})).not.toBeInTheDocument();
});
