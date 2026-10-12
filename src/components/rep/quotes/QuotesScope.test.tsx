import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {RepQuoteList} from '@/server/rep/quotes';
import {CUSTOMERS,MANAGER_OPTIONS,SAMPLE,quoteList,quoteRow} from './test-fixtures';

// The manager's Quotes list (v3 spec §6 Quotes list; decisions 21, 22; tasks D2, U1): the whole
// organization by default, with no "My quotes / All reps" switch (?scope=all is gone), a Rep column
// with rep and team filters, row checkboxes and a "Reassign…" bulk action that moves the ticked
// quotes to an active rep. A rep gets none of it: their list is their own quotes.

const nav=vi.hoisted(()=>({query:'',push:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>({
  usePathname:()=>'/rep/quotes',
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:nav.replace,push:nav.push,refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=>
  <a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('../RepShell');
const {QuotesList,quotesApiPath}=await import('./QuotesList');

const brandi={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',manager:true};
const mara={id:'mara',name:'Mara Jensen',initials:'MJ',title:'Inside Sales'};
const MARAS=quoteRow({id:'q-30001',quote_number:'Q-30001',customer_id:'canyon-ridge',customer_name:'Canyon Ridge Builders',account_number:'CRB-3318',rep_id:'mara',rep_name:'Mara Jensen',status:'ready_for_review',total_basis:'draft'});
const NORAS=quoteRow({id:'q-30002',quote_number:'Q-30002',customer_id:'uinta-facility',customer_name:'Uinta Facility Services',account_number:'UFS-4051',rep_id:'nora',rep_name:'Nora Chen'});

let served:RepQuoteList;
const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url.startsWith('/api/rep/badges'))return Response.json({quotes:1,attention:0});
  if(url==='/api/rep/quotes/reassign'&&init?.method==='POST'){
    const body=JSON.parse(String(init.body));
    return Response.json({replayed:false,to:{id:body.toRepId,name:'Eli Porter'},skipped:[],
      moved:body.quoteIds.map((id:string)=>({id,quote_number:id.toUpperCase(),from:{id:'mara',name:'Mara Jensen'}}))});
  }
  if(url.startsWith('/api/rep/quotes'))return Response.json(served);
  return Response.json({detail:'Not found.'},{status:404});
});
const posts=()=>fetchMock.mock.calls.filter(([,init])=>init?.method==='POST').map(([url,init])=>({url:String(url),body:JSON.parse(String(init!.body)),key:new Headers(init!.headers).get('idempotency-key')}));

function renderList(initial:RepQuoteList,{query='',rep=brandi}:{query?:string;rep?:typeof brandi|typeof mara}={}){
  nav.query=query;served=initial;
  return render(<RepShell rep={rep} org="Herrick Industrial Supply" initialBadges={{quotes:1,attention:0}}><QuotesList initial={initial}/></RepShell>);
}
const table=()=>screen.getByRole('table');
const quoteBlock=(number:string)=>within(table()).getAllByRole('rowgroup').find(g=>within(g).queryByRole('link',{name:number}))!;

beforeEach(()=>{nav.query='';nav.push.mockClear();nav.replace.mockClear();fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.unstubAllGlobals();});

describe('a rep',()=>{
  it('gets no scope switch, no Rep column, no rep filters and no checkboxes',()=>{
    renderList(quoteList(),{rep:mara,query:'scope=all'});
    expect(screen.queryByRole('combobox',{name:'Rep'})).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation',{name:'Whose quotes'})).not.toBeInTheDocument();
    expect(within(table()).getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Quote','Customer','Requested','Status','Total','Margin']);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('the manager',()=>{
  it('has no My quotes / All reps switch: her list is the whole organization, with the Rep column, filters and checkboxes',()=>{
    renderList(quoteList({scope:[MARAS,NORAS,SAMPLE],manager:MANAGER_OPTIONS}));
    expect(screen.queryByRole('navigation',{name:'Whose quotes'})).not.toBeInTheDocument();
    expect(screen.queryByRole('link',{name:'My quotes'})).not.toBeInTheDocument();
    expect(within(table()).getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Select','Quote','Customer','Rep','Requested','Status','Total','Margin']);
    expect(within(quoteBlock('Q-30001')).getAllByRole('cell')[2]).toHaveTextContent('Mara Jensen');
    expect(within(table()).getByText(/^Quotes for all customers of every rep, newest request first$/)).toBeInTheDocument();
  });

  it('filters by rep and team, and no link or request carries ?scope=all',()=>{
    renderList(quoteList({scope:[MARAS,NORAS,SAMPLE],manager:MANAGER_OPTIONS}),{query:'scope=all'});
    const rep=screen.getByRole('combobox',{name:'Rep'});
    expect(within(rep).getAllByRole('option').map(o=>o.textContent)).toEqual(['All reps','Brandi Gallegos','Eli Porter','Mara Jensen','Nora Chen']);
    fireEvent.change(rep,{target:{value:'mara'}});
    expect(nav.push).toHaveBeenCalledWith('/rep/quotes?rep=mara');
    const team=screen.getByRole('combobox',{name:'Team'});
    expect(within(team).getAllByRole('option').map(o=>o.textContent)).toEqual(['All teams','Inside Sales','Outside Sales']);
    fireEvent.change(team,{target:{value:'Outside Sales'}});
    expect(nav.push).toHaveBeenCalledWith('/rep/quotes?team=Outside+Sales');
    const sent=within(screen.getByRole('navigation',{name:'Filter by status'})).getByRole('link',{name:/^Sent/});
    expect(sent).toHaveAttribute('href','/rep/quotes?status=sent');
    for(const link of screen.getAllByRole('link'))expect(link.getAttribute('href')).not.toContain('scope=');
  });

  it('keeps the rep filter and the page’s own ?customer= in the status links and polls them',async()=>{
    renderList(quoteList({scope:[MARAS],manager:MANAGER_OPTIONS,rep_filter:'mara',customer:CUSTOMERS[0]}),{query:'rep=mara&customer=canyon-ridge'});
    expect(screen.getByRole('combobox',{name:'Rep'})).toHaveValue('mara');
    expect(within(screen.getByRole('navigation',{name:'Filter by status'})).getByRole('link',{name:/^Needs attention/})).toHaveAttribute('href','/rep/quotes?attention=1&rep=mara&customer=canyon-ridge');
    expect(quotesApiPath(null,null,null,{rep:'mara',team:null})).toBe('/api/rep/quotes?rep=mara');
    expect(quotesApiPath('wasatch','sent',null,{rep:null,team:'Inside Sales'})).toBe('/api/rep/quotes?customer=wasatch&status=sent&team=Inside+Sales');
    await waitFor(()=>expect(fetchMock.mock.calls.map(([u])=>String(u))).toContain('/api/rep/quotes?customer=canyon-ridge&rep=mara'));
    // The header badge is scoped by role on the server, never by a param.
    expect(fetchMock.mock.calls.map(([u])=>String(u)).filter(u=>u.startsWith('/api/rep/badges'))).toEqual(expect.arrayContaining(['/api/rep/badges']));
    expect(fetchMock.mock.calls.map(([u])=>String(u)).some(u=>u.includes('scope='))).toBe(false);
  });

  it('ticks quotes and reassigns them to an active rep in bulk',async()=>{
    renderList(quoteList({scope:[MARAS,NORAS,SAMPLE],manager:MANAGER_OPTIONS}));
    expect(screen.queryByRole('region',{name:'Selected quotes'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox',{name:'Select Q-30001'}));
    fireEvent.click(screen.getByRole('checkbox',{name:'Select Q-30002'}));
    const bar=screen.getByRole('region',{name:'Selected quotes'});
    expect(bar).toHaveTextContent('2 selected');
    fireEvent.click(within(bar).getByRole('button',{name:'Reassign…'}));
    const dialog=screen.getByRole('dialog',{name:'Reassign 2 quotes'});
    const target=within(dialog).getByRole('combobox',{name:'New rep'});
    // Active reps only (Nora is inactive in the fixture's options).
    expect(within(target).getAllByRole('option').map(o=>o.textContent)).toEqual(['Choose a rep','Brandi Gallegos (you)','Eli Porter','Mara Jensen']);
    expect(within(dialog).getByRole('button',{name:'Reassign'})).toBeDisabled();
    fireEvent.change(target,{target:{value:'eli'}});
    fireEvent.click(within(dialog).getByRole('button',{name:'Reassign'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(posts()).toEqual([{url:'/api/rep/quotes/reassign',body:{quoteIds:['q-30001','q-30002'],toRepId:'eli'},key:expect.stringMatching(/.+/)}]);
    expect(screen.getByRole('status',{name:'Reassignment'})).toHaveTextContent('Reassigned 2 quotes to Eli Porter.');
    expect(screen.queryByRole('region',{name:'Selected quotes'})).not.toBeInTheDocument();
  });

  it('selects every shown quote at once, and Cancel closes the dialog with nothing sent',()=>{
    renderList(quoteList({scope:[MARAS,NORAS],manager:MANAGER_OPTIONS}));
    fireEvent.click(screen.getByRole('checkbox',{name:'Select every quote shown'}));
    expect(screen.getByRole('region',{name:'Selected quotes'})).toHaveTextContent('2 selected');
    fireEvent.click(screen.getByRole('button',{name:'Reassign…'}));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Cancel'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(posts()).toEqual([]);
  });
});
