import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {RepQuoteList} from '@/server/rep/quotes';
import {CHANGES,CUSTOMERS,OLD,SAMPLE,WASATCH,quoteList,quoteRow} from './test-fixtures';

// The rep's Quotes list (task 3.2, spec §4), rendered in the portal shell like the real page.

const nav=vi.hoisted(()=>({pathname:'/rep/quotes',query:'',replace:vi.fn()}));
vi.mock('next/navigation',()=>({
  usePathname:()=>nav.pathname,
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:nav.replace,push:vi.fn(),refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,prefetch,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=>
  <a href={href} data-prefetch={String(prefetch)} {...rest}>{children}</a>}));

const {RepShell}=await import('../RepShell');
const {QuotesList,quotesApiPath}=await import('./QuotesList');
const {REP_STATUS}=await import('./labels');

const brandi={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'};
let served:RepQuoteList;
async function serve(input:RequestInfo|URL){
  const url=String(input);
  if(url==='/api/rep/badges')return Response.json({quotes:2});
  if(url.startsWith('/api/rep/quotes'))return Response.json(served);
  return Response.json({detail:'Not found.'},{status:404});
}
const fetchMock=vi.fn(serve);
const requested=()=>fetchMock.mock.calls.map(([url])=>String(url));

function renderList(initial:RepQuoteList,query=''){
  nav.query=query;
  served=initial;
  return render(<RepShell rep={brandi} org="Herrick Industrial Supply" customers={CUSTOMERS} initialBadges={{quotes:2}}><QuotesList initial={initial}/></RepShell>);
}
const table=()=>screen.getByRole('table');
const quoteBlock=(number:string)=>within(table()).getAllByRole('rowgroup').find(g=>within(g).queryByRole('link',{name:number}))!;

beforeEach(()=>{nav.pathname='/rep/quotes';nav.query='';fetchMock.mockReset();fetchMock.mockImplementation(serve);vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe('the table',()=>{
  it('shows the columns, and each quote with its number and revision, customer, requested date, status, total and margin',()=>{
    renderList(quoteList());
    expect(within(table()).getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Quote','Customer','Requested','Status','Total','Margin']);
    const accepted=within(quoteBlock('Q-24816')).getAllByRole('row')[0];
    expect(within(accepted).getByRole('rowheader')).toHaveTextContent('Q-24816rev 1');
    expect(within(accepted).getAllByRole('cell').map(c=>c.textContent)).toEqual([
      'Wasatch Mechanical ContractorsWAS-1142','Requested Sep 7','Accepted','$782.75','28.1% margin',
    ]);
    // Newest request first, as the server sends them; a date outside this year shows its year.
    expect(within(table()).getAllByRole('rowheader').map(h=>within(h).getByRole('link').textContent)).toEqual(['Q-24818','Q-24817','Q-24816','Q-24793']);
    expect(within(quoteBlock('Q-24793')).getByText('Sep 28, 2025')).toBeInTheDocument();
  });

  it('labels a draft total and its lines below floor; a sent total is plain',()=>{
    renderList(quoteList());
    const sample=quoteBlock('Q-24817');
    expect(within(sample).getByRole('rowheader')).toHaveTextContent('Q-24817Not sentSample data');
    expect(within(sample).getByText('Draft ready')).toBeInTheDocument();
    const cells=within(sample).getAllByRole('cell');
    expect(cells[3]).toHaveTextContent('$1,122.40Draft');
    expect(cells[4]).toHaveTextContent('32.2% margin1 line below floor');
    expect(within(quoteBlock('Q-24816')).queryByText('Draft')).not.toBeInTheDocument();
  });

  it('says when a draft total is before freight (call for freight)',()=>{
    renderList(quoteList({scope:[quoteRow({...SAMPLE,freight_pending:true,below_floor_count:3})]}));
    const cells=within(quoteBlock('Q-24817')).getAllByRole('cell');
    expect(cells[3]).toHaveTextContent('$1,122.40Draft, before freight');
    expect(cells[4]).toHaveTextContent('3 lines below floor');
  });

  it('marks unread quotes with a dot, and only those',()=>{
    renderList(quoteList());
    expect(within(quoteBlock('Q-24817')).getByRole('rowheader')).toHaveTextContent(/^Unread: Q-24817/);
    expect(within(quoteBlock('Q-24816')).getByRole('rowheader')).not.toHaveTextContent('Unread');
    expect(screen.getByText('Viewing All customers · 2 unread quotes')).toBeInTheDocument();
  });

  it("highlights changes_requested with the customer's note, who asked and when",()=>{
    renderList(quoteList());
    const changes=quoteBlock('Q-24818');
    expect(changes).toHaveAttribute('data-status','changes_requested');
    const [row,note]=within(changes).getAllByRole('row');
    expect(within(row).getByText('Changes requested')).toBeInTheDocument();
    expect(note).toHaveTextContent('Dana Ortiz asked for changes · Sep 25Make it 12 boxes and deliver Friday.');
    expect(row).toHaveAccessibleDescription('Dana Ortiz asked for changes · Sep 25 Make it 12 boxes and deliver Friday.');
    expect(quoteBlock('Q-24817')).toHaveAttribute('data-status','ready_for_review');
    expect(within(quoteBlock('Q-24817')).getAllByRole('row')).toHaveLength(1);
  });

  it('opens a quote from its number, keeping the picked customer, without prefetching it (opening marks it read)',()=>{
    renderList(quoteList({customer:WASATCH}),'customer=wasatch');
    const link=within(table()).getByRole('link',{name:'Q-24817'});
    expect(link).toHaveAttribute('href','/rep/quotes/Q-24817?customer=wasatch');
    expect(link).toHaveAttribute('data-prefetch','false');
    expect(screen.getByText('Viewing Wasatch Mechanical Contractors · 2 unread quotes')).toBeInTheDocument();
  });
});

describe('the status filter',()=>{
  it('counts every status and links each one, keeping the picked customer',()=>{
    renderList(quoteList({customer:WASATCH}),'customer=wasatch');
    const filter=screen.getByRole('navigation',{name:'Filter by status'});
    const links=within(filter).getAllByRole('link');
    expect(links.map(l=>l.textContent)).toEqual(['All4','Draft ready1','Changes requested1','Sent0','Accepted2','Expired0','Declined0']);
    expect(links.map(l=>l.getAttribute('href'))).toEqual([
      '/rep/quotes?customer=wasatch',
      '/rep/quotes?status=ready_for_review&customer=wasatch','/rep/quotes?status=changes_requested&customer=wasatch',
      '/rep/quotes?status=sent&customer=wasatch','/rep/quotes?status=accepted&customer=wasatch','/rep/quotes?status=expired&customer=wasatch',
      '/rep/quotes?status=declined&customer=wasatch',
    ]);
    expect(within(filter).getByRole('link',{current:'page'})).toHaveTextContent('All4');
  });

  it('shows only the filtered status, and marks it current',()=>{
    renderList(quoteList({status:'changes_requested'}),'status=changes_requested');
    expect(within(screen.getByRole('navigation',{name:'Filter by status'})).getByRole('link',{current:'page'})).toHaveTextContent('Changes requested1');
    expect(within(table()).getAllByRole('rowheader').map(h=>within(h).getByRole('link').textContent)).toEqual(['Q-24818']);
    expect(within(table()).getByText(/^Changes requested quotes for all your customers/)).toBeInTheDocument();
  });

  it('has a Declined filter and chip (v3 spec §6, task A1)',()=>{
    renderList(quoteList({status:'declined'}),'status=declined');
    expect(screen.getByRole('heading',{name:'No declined quotes'})).toBeInTheDocument();
    expect(REP_STATUS.declined).toEqual({label:'Declined',tone:'declined'});
  });

  it('says so when nothing has the filtered status, and offers every status',()=>{
    renderList(quoteList({status:'sent'}),'status=sent');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'No quotes waiting on the customer'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Show every status'})).toHaveAttribute('href','/rep/quotes');
  });
});

describe('empty states',()=>{
  it('a placeholder customer: no quotes yet, and no filter',()=>{
    const greatBasin=CUSTOMERS[1];
    renderList(quoteList({scope:[],customer:greatBasin}),'customer=great-basin');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation',{name:'Filter by status'})).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'No quotes for Great Basin Fabrication yet'})).toBeInTheDocument();
    expect(screen.getByText(/when someone at Great Basin Fabrication asks for goods in Querent chat and presses Request quote/)).toBeInTheDocument();
    expect(screen.getByText('Viewing Great Basin Fabrication')).toBeInTheDocument();
  });

  it("another rep's customer: says whose customer it is, and links back to all your quotes",()=>{
    renderList(quoteList({scope:[],customer:CUSTOMERS[0],other_rep:true}),'customer=canyon-ridge');
    expect(screen.getByRole('heading',{name:'Canyon Ridge Builders is Mara Jensen’s customer'})).toBeInTheDocument();
    expect(screen.getByText(/shows quotes for your own customers/)).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Show all your quotes'})).toHaveAttribute('href','/rep/quotes');
  });

  it('a rep with no quotes at all',()=>{
    renderList(quoteList({scope:[]}));
    expect(screen.getByRole('heading',{name:'No quotes yet'})).toBeInTheDocument();
  });
});

describe('staying fresh',()=>{
  it('builds the API path from the picked customer and status',()=>{
    expect(quotesApiPath(null,null)).toBe('/api/rep/quotes');
    expect(quotesApiPath('wasatch',null)).toBe('/api/rep/quotes?customer=wasatch');
    expect(quotesApiPath('wasatch','changes_requested')).toBe('/api/rep/quotes?customer=wasatch&status=changes_requested');
    expect(quotesApiPath(null,'sent')).toBe('/api/rep/quotes?status=sent');
  });

  it('re-reads the list for the same scope, so a quote opened elsewhere loses its dot',async()=>{
    vi.useFakeTimers({shouldAdvanceTime:true});
    const initial=quoteList({customer:WASATCH});
    renderList(initial,'customer=wasatch');
    served=quoteList({customer:WASATCH,scope:[CHANGES,{...SAMPLE,unread:false},quoteRow(),OLD]});
    await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    await waitFor(()=>expect(within(quoteBlock('Q-24817')).getByRole('rowheader')).not.toHaveTextContent('Unread'));
    expect(requested()).toContain('/api/rep/quotes?customer=wasatch');
    expect(screen.getByText('Viewing Wasatch Mechanical Contractors · 1 unread quote')).toBeInTheDocument();
  });

  it('keeps showing the list when a refresh fails, and says it will retry',async()=>{
    fetchMock.mockImplementation(async(input:RequestInfo|URL)=>String(input).startsWith('/api/rep/quotes')?Response.json({detail:'boom'},{status:500}):Response.json({quotes:2}));
    renderList(quoteList());
    expect(await screen.findByText('Unable to refresh quotes. Trying again in a few seconds.')).toBeInTheDocument();
    expect(within(table()).getByRole('link',{name:'Q-24817'})).toBeInTheDocument();
  });
});
