import {render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {CustomerChat} from './Chat';
import type {API,ChatAnswer,ChatTurn,Principal} from '@/lib/contracts';
import {sidebarRoutes} from '@/components/customer/test-fixtures';
const user:Principal={user_id:'u1',role:'customer_user',customer_id:'c1',name:'Wasatch Mechanical Contractors',user_name:'Dana Ortiz',rep_id:null,contact_id:'dana'};
function makeApi(get:API['get'],send:API['send']):API{return {get,send};}
function emptyGet():API['get']{return vi.fn(async(path:string):Promise<any>=>{
 if(path in sidebarRoutes) return sidebarRoutes[path as keyof typeof sidebarRoutes];
 if(path.startsWith('customer/history/')) return [] as ChatTurn[];
 throw new Error(`unexpected get ${path}`);
}) as unknown as API['get'];}
beforeEach(()=>{localStorage.clear();});
it('sits between the contacts and quotes sidebars, with New conversation above the chat',async()=>{
 render(<CustomerChat api={makeApi(emptyGet(),vi.fn())} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 expect(within(screen.getByRole('complementary',{name:'Contacts'})).getByText('Your rep')).toBeInTheDocument();
 expect(await within(screen.getByRole('complementary',{name:'Quotes'})).findAllByRole('button',{name:/^Quote · /})).not.toHaveLength(0);
 const newChat=screen.getByRole('button',{name:'New conversation'});
 expect(newChat.compareDocumentPosition(box)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
 expect(screen.getByRole('main')).toContainElement(box);
});
it('starts a new conversation from the chat toolbar',async()=>{
 const send=vi.fn().mockResolvedValue({answer:'Answered.',sql:null,categories:['account'],outcome:'answered',row_count:0} satisfies ChatAnswer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'What is our open balance?'}});
 fireEvent.click(screen.getByLabelText('Send question'));
 expect(await screen.findByText('Answered.')).toBeInTheDocument();
 const first=localStorage.getItem('querent-conversation-u1');
 fireEvent.click(screen.getByRole('button',{name:'New conversation'}));
 expect(screen.queryByText('Answered.')).not.toBeInTheDocument();
 expect(localStorage.getItem('querent-conversation-u1')).not.toBe(first);
});
it('submits a question on send and renders the answer',async()=>{
 const answer:ChatAnswer={answer:'PO-48213 shipped Sep 12.',sql:null,categories:['orders_quotes'],outcome:'answered',row_count:1};
 const send=vi.fn().mockResolvedValue(answer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'What is the status of PO-48213?'}});
 fireEvent.click(screen.getByLabelText('Send question'));
 expect(await screen.findByText('PO-48213 shipped Sep 12.')).toBeInTheDocument();
 expect(send).toHaveBeenCalledWith('customer/chat','POST',expect.objectContaining({question:'What is the status of PO-48213?'}));
 expect(screen.getByText('DO',{selector:'.user-avatar'})).toBeInTheDocument();
});
it('submits a question on Enter without Shift',async()=>{
 const answer:ChatAnswer={answer:'Answered.',sql:null,categories:['account'],outcome:'answered',row_count:0};
 const send=vi.fn().mockResolvedValue(answer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'What are my financing balances?'}});
 fireEvent.keyDown(box,{key:'Enter',shiftKey:false});
 await waitFor(()=>expect(send).toHaveBeenCalled());
 expect(await screen.findByText('Answered.')).toBeInTheDocument();
});
it('renders a combined answer covering more than one category',async()=>{
 const answer:ChatAnswer={answer:'PO-48213 is shipped. Your financing balance is unavailable here.',sql:'select 1',categories:['orders_quotes','account'],outcome:'answered',row_count:1};
 const send=vi.fn().mockResolvedValue(answer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'Status of PO-48213 and my financing balance?'}});
 fireEvent.click(screen.getByLabelText('Send question'));
 expect(await screen.findByText(/PO-48213 is shipped/)).toBeInTheDocument();
});
it('renders the restricted message without a query disclosure',async()=>{
 const answer:ChatAnswer={answer:'That information isn’t available here.',sql:null,categories:['pricing'],outcome:'restricted',row_count:0};
 const send=vi.fn().mockResolvedValue(answer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'What are my financing balances?'}});
 fireEvent.click(screen.getByLabelText('Send question'));
 expect(await screen.findByText('That information isn’t available here.')).toBeInTheDocument();
 expect(screen.queryByText('Show query')).not.toBeInTheDocument();
});
it('does not expose executed SQL in the customer chat',async()=>{
 const answer:ChatAnswer={answer:'You have 12 hydraulic filters in stock.',sql:'select * from items',categories:['items_stock'],outcome:'answered',row_count:1};
 const send=vi.fn().mockResolvedValue(answer);
 render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
 const box=await screen.findByLabelText('Ask a question');
 fireEvent.change(box,{target:{value:'What hydraulic filters are in stock?'}});
 fireEvent.click(screen.getByLabelText('Send question'));
 await screen.findByText('You have 12 hydraulic filters in stock.');
 expect(screen.queryByText('Show query')).not.toBeInTheDocument();
 expect(screen.queryByText('select * from items')).not.toBeInTheDocument();
});
describe('the clarifying question (task 2.2)',()=>{
 const wheel=(sku:string,type:string)=>({sku,description:`Cut-off wheel 4.5 x .045 x 7/8 in, Type ${type}`,pack:'Box of 25',category_name:'Abrasives & Cutting'});
 const T1=wheel('CW-45-045-T1','1'),T27=wheel('CW-45-045-T27','27');
 const rep={name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',phone:'(801) 111-2222',email:'brandi.gallegos@herrickindustrial.com'};
 const clarify=(round:number):ChatAnswer=>({
  answer:round<2?'Type 1 or Type 27 cut-off wheels?':'I still need to know which cut-off wheels you mean. Type 1 or Type 27 cut-off wheels?',
  sql:null,categories:['items_stock'],outcome:'answered',row_count:2,kind:'clarify',
  payload:{open:[{requested_text:'6 boxes of cut-off wheels',qty:6,question:'Type 1 or Type 27 cut-off wheels?',round,text:'cut-off wheels',candidates:[T1,T27],choices:round<2?[]:[T1,T27]}],
   cart:{fulfillment:'will_call',branch_id:'slc',lines:[{sku:'HCS-12-13-2G8',qty:10}]},dropped:[],rep:round<2?null:rep},
 });
 async function say(text:string){
  const box=await screen.findByLabelText('Ask a question');
  fireEvent.change(box,{target:{value:text}});
  fireEvent.click(screen.getByLabelText('Send question'));
 }
 it('shows only the question in round 1, then candidate buttons and the rep in round 2; a button sends the pick',async()=>{
  const popup:ChatAnswer={answer:'Here is your list:',sql:null,categories:['items_stock'],outcome:'answered',row_count:2,kind:'item_popup',payload:{fulfillment:'will_call',branch_id:'slc',lines:[]}};
  const send=vi.fn().mockResolvedValueOnce(clarify(1)).mockResolvedValueOnce(clarify(2)).mockResolvedValueOnce(popup);
  render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
  await say('Please quote 6 boxes of cut-off wheels');
  expect(await screen.findByText('Type 1 or Type 27 cut-off wheels?')).toBeInTheDocument();
  expect(screen.queryByRole('group',{name:/^Choose the item/})).not.toBeInTheDocument();
  await say('not sure');
  const group=await screen.findByRole('group',{name:'Choose the item for “6 boxes of cut-off wheels”'});
  expect(within(group).getAllByRole('button')).toHaveLength(2);
  expect(screen.getByRole('region',{name:'Call your rep'})).toHaveTextContent('Brandi Gallegos');
  fireEvent.click(within(group).getByRole('button',{name:/^Choose CW-45-045-T27/}));
  await waitFor(()=>expect(send).toHaveBeenLastCalledWith('customer/chat','POST',expect.objectContaining({question:'CW-45-045-T27 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 27)'})));
  expect(await screen.findByText('Here is your list:')).toBeInTheDocument();
  // Only the latest reply can still be answered: the old buttons are gone.
  expect(screen.queryByRole('group',{name:/^Choose the item/})).not.toBeInTheDocument();
  expect(screen.getByText('CW-45-045-T27 (Cut-off wheel 4.5 x .045 x 7/8 in, Type 27)',{selector:'.question-bubble'})).toBeInTheDocument();
 });
 it('drops a line from the button',async()=>{
  const send=vi.fn().mockResolvedValueOnce(clarify(2)).mockResolvedValueOnce({answer:'Dropped.',sql:null,categories:['items_stock'],outcome:'answered',row_count:0});
  render(<CustomerChat api={makeApi(emptyGet(),send)} user={user} signOut={()=>{}}/>);
  await say('Please quote 6 boxes of cut-off wheels');
  fireEvent.click(await screen.findByRole('button',{name:'Drop this line: 6 boxes of cut-off wheels'}));
  await waitFor(()=>expect(send).toHaveBeenLastCalledWith('customer/chat','POST',expect.objectContaining({question:'Drop “6 boxes of cut-off wheels”'})));
 });
 it('shows the buttons again after a reload, from the history',async()=>{
  const turn:ChatTurn={id:'t1',question:'Please quote 6 boxes of cut-off wheels',...clarify(2)};
  const get=vi.fn(async(path:string):Promise<any>=>{
   if(path in sidebarRoutes) return sidebarRoutes[path as keyof typeof sidebarRoutes];
   if(path.startsWith('customer/history/')) return [turn];
   throw new Error(`unexpected get ${path}`);
  }) as unknown as API['get'];
  render(<CustomerChat api={makeApi(get,vi.fn())} user={user} signOut={()=>{}}/>);
  expect(await screen.findByRole('group',{name:'Choose the item for “6 boxes of cut-off wheels”'})).toBeInTheDocument();
 });
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
