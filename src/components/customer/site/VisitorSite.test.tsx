import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {VisitorSite} from './VisitorSite';

// The visitor's box (plan U10; C_CVE0; decisions 49 and 53): no session, the public starter
// questions, and every question answered by the R-14 stub with "Sign in to continue.". Sign in goes
// to the demo chooser at /demo. Nothing reads a customer route.

const router=vi.hoisted(()=>({push:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>router}));

const calls:{url:string;body:unknown}[]=[];
beforeEach(()=>{
  calls.length=0;router.push.mockClear();
  vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
    calls.push({url:String(input),body:init?.body?JSON.parse(String(init.body)):null});
    return Response.json({answer:'Sign in to continue.'});
  }));
});
afterEach(()=>vi.unstubAllGlobals());

it('shows the public box: heading, the line under it, the four public questions and Powered by Querent',()=>{
  render(<VisitorSite/>);
  expect(screen.getByText('HERRICK INDUSTRIAL SUPPLY')).toBeInTheDocument();
  expect(screen.getByRole('heading',{level:2}).textContent).toBe('Ask about stock,items and branches.');
  expect(screen.getByText('Open to everyone. Sign in to see your own prices, orders and quotes.')).toBeInTheDocument();
  expect(screen.getAllByRole('button',{name:/\?$/}).map(b=>b.textContent)).toEqual([
    'Do you have 1/2 in grade 8 hex bolts in stock?','What are the branch hours?','Do you deliver to Ogden?','How do I open an account?',
  ]);
  expect(screen.getByLabelText('Ask a question')).toHaveAttribute('placeholder','Ask about stock, pricing, orders...');
  expect(screen.getByText('Powered by Querent')).toBeInTheDocument();
  for(const gone of ['Orders','My rep','Notifications'])expect(screen.queryByRole('button',{name:gone})).toBeNull();
});

it('answers a typed question with "Sign in to continue." from the stub',async()=>{
  render(<VisitorSite/>);
  fireEvent.change(screen.getByLabelText('Ask a question'),{target:{value:'What did we pay for gloves?'}});
  fireEvent.click(screen.getByRole('button',{name:'Send'}));
  expect(await screen.findByText('Sign in to continue.')).toBeInTheDocument();
  expect(screen.getByText('What did we pay for gloves?')).toBeInTheDocument();
  expect(calls).toEqual([{url:'/api/query/visitor/chat',body:{question:'What did we pay for gloves?'}}]);
});

it('sends a starter question on click, and on Enter',async()=>{
  render(<VisitorSite/>);
  fireEvent.click(screen.getByRole('button',{name:'What are the branch hours?'}));
  expect(await screen.findByText('Sign in to continue.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Ask a question'),{target:{value:'Do you deliver to Ogden?'}});
  fireEvent.keyDown(screen.getByLabelText('Ask a question'),{key:'Enter'});
  await waitFor(()=>expect(screen.getAllByText('Sign in to continue.')).toHaveLength(2));
  expect(calls.map(c=>c.url)).toEqual(['/api/query/visitor/chat','/api/query/visitor/chat']);
  expect(calls.some(c=>/customer/.test(c.url))).toBe(false);
});

it('ignores an empty question',()=>{
  render(<VisitorSite/>);
  fireEvent.click(screen.getByRole('button',{name:'Send'}));
  expect(calls).toEqual([]);
});

it('Sign in opens the demo chooser at /demo',()=>{
  render(<VisitorSite/>);
  fireEvent.click(screen.getByRole('button',{name:'Sign in'}));
  expect(router.push).toHaveBeenCalledWith('/demo');
});
