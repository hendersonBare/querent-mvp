import {render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import {it,expect,vi,beforeEach} from 'vitest';
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
