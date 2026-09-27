import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {CUSTOMERS} from './test-fixtures';

// /rep/quotes/<number> until task 3.3: the header, and opening it clears the unread flag (task 3.2).

const nav=vi.hoisted(()=>({query:'customer=wasatch'}));
vi.mock('next/navigation',()=>({
  usePathname:()=>'/rep/quotes/Q-24817',
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:vi.fn(),push:vi.fn(),refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_prefetch,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('../RepShell');
const {QuotePlaceholder}=await import('./QuotePlaceholder');

let unread=1,readStatus=200;
const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url==='/api/rep/badges')return Response.json({quotes:unread});
  if(url==='/api/rep/quotes/q-24817/read'&&init?.method==='POST'){
    if(readStatus!==200)return Response.json({detail:'No quote q-24817.'},{status:readStatus});
    unread=0;return Response.json({id:'q-24817',quote_number:'Q-24817',unread:false});
  }
  return Response.json({detail:'Not found.'},{status:404});
});
const calls=(match:string)=>fetchMock.mock.calls.filter(([url])=>String(url)===match);

const SAMPLE={id:'q-24817',quote_number:'Q-24817',revision:0,status:'ready_for_review' as const,customer_name:'Wasatch Mechanical Contractors',
  contact_name:'Dana Ortiz',requested_at:'2026-09-23T16:14:00.000Z',is_sample:true};
const renderPage=()=>render(<RepShell rep={{id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'}} org="Herrick Industrial Supply" customers={CUSTOMERS}
  initialBadges={{quotes:1}}><QuotePlaceholder quote={SAMPLE} asOf="2026-09-25T18:00:00.000Z"/></RepShell>);
const quotesLink=()=>screen.getByRole('navigation',{name:'Rep portal'}).querySelector('a[href^="/rep/quotes"]')!;

beforeEach(()=>{unread=1;readStatus=200;fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());

it('shows the breadcrumb and the header: customer, Draft ready, number, contact and requested day (mockup 03)',()=>{
  renderPage();
  const crumbs=screen.getByRole('navigation',{name:'Breadcrumb'});
  expect(crumbs).toHaveTextContent('Quotes/Q-24817Sample data');
  expect(crumbs.querySelector('a')).toHaveAttribute('href','/rep/quotes?customer=wasatch');
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Wasatch Mechanical Contractors');
  expect(screen.getByText('Draft ready')).toBeInTheDocument();
  expect(screen.getByText('Q-24817 Not sent · Dana Ortiz · Requested Sep 23')).toBeInTheDocument();
  expect(screen.getByRole('link',{name:'Back to quotes'})).toHaveAttribute('href','/rep/quotes?customer=wasatch');
});

it('marks the quote read once, then refreshes the Quotes badge at once',async()=>{
  renderPage();
  expect(quotesLink()).toHaveTextContent('1 unread');
  await waitFor(()=>expect(calls('/api/rep/quotes/q-24817/read')).toHaveLength(1));
  await waitFor(()=>expect(quotesLink()).not.toHaveTextContent('unread'));
  // The badge refresh must not re-trigger the read (no loop between the two).
  await new Promise(resolve=>setTimeout(resolve,50));
  expect(calls('/api/rep/quotes/q-24817/read')).toHaveLength(1);
});

it('leaves the badge to its poll when the quote is not found',async()=>{
  readStatus=404;
  renderPage();
  await waitFor(()=>expect(calls('/api/rep/quotes/q-24817/read')).toHaveLength(1));
  await new Promise(resolve=>setTimeout(resolve,20));
  // Only the shell's own first poll read the badges.
  expect(calls('/api/rep/badges')).toHaveLength(1);
});
