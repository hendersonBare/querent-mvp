import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {RepQuoteList} from '@/server/rep/quotes';
import {AGING,CHANGES,MANAGER_OPTIONS,OLD,OVERDUE,SAMPLE,WASATCH,accepted,quoteList,quoteRow} from './test-fixtures';

// The Quotes page (plan U3; frames C_QOBoard, C_QOTable and their opened states), rendered in the
// portal shell like the real page: one toolbar (customer picker, Filter, Board/Table), the board's six
// lanes with real counts and "Show N more", the table with its columns picker, the quote preview and
// the View note dialog. No status strip, no Needs attention view and no bulk reassign (decision 45).

const nav=vi.hoisted(()=>({pathname:'/rep/quotes',query:'',push:vi.fn(),replace:vi.fn()}));
vi.mock('next/navigation',()=>({
  usePathname:()=>nav.pathname,
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:nav.replace,push:nav.push,refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,prefetch,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=>
  <a href={href} data-prefetch={String(prefetch)} {...rest}>{children}</a>}));

const {RepShell}=await import('../RepShell');
const {QuotesList,LANE_PAGE}=await import('./QuotesList');

const brandi={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',manager:true};
let served:RepQuoteList;
async function serve(input:RequestInfo|URL,init?:RequestInit){
  const url=String(input);
  if(url==='/api/rep/badges')return Response.json({quotes:2,attention:0,caution:[],bell:[]});
  if(url==='/api/rep/table-prefs'&&init?.method==='PUT')return Response.json({table_id:'x',prefs:JSON.parse(String(init.body))});
  if(url.endsWith('/reply')&&init?.method==='POST')return Response.json({kind:'replied'},{status:201});
  if(url.startsWith('/api/rep/quotes'))return Response.json(served);
  return Response.json({detail:'Not found.'},{status:404});
}
const fetchMock=vi.fn(serve);
const requested=()=>fetchMock.mock.calls.map(([url])=>String(url));
const sent=(method:string)=>fetchMock.mock.calls.filter(([,init])=>init?.method===method).map(([url,init])=>({url:String(url),body:JSON.parse(String(init!.body))}));

function renderList(initial:RepQuoteList,{query='',view='board' as 'board'|'table',rep=brandi as typeof brandi|Omit<typeof brandi,'manager'>}={}){
  nav.query=query;
  served=initial;
  return render(<RepShell rep={rep} org="Herrick Industrial Supply" initialBadges={{quotes:2,attention:0,caution:[],bell:[]}}>
    <QuotesList initial={initial} query={query} view={view} prefs={{table:null,board:null}}/>
  </RepShell>);
}
const lane=(name:string)=>screen.getByRole('group',{name});
const lanes=()=>within(screen.getByRole('group',{name:'Board columns'})).getAllByRole('group');
const cards=(name:string)=>within(lane(name)).queryAllByRole('article');
const card=(number:string)=>screen.getByRole('article',{name:number});
const table=()=>screen.getByRole('table',{name:'Quotes'});
const bodyRows=()=>within(table()).getAllByRole('row').slice(1);

beforeEach(()=>{nav.pathname='/rep/quotes';nav.query='';nav.push.mockReset();fetchMock.mockReset();fetchMock.mockImplementation(serve);vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

describe('the toolbar',()=>{
  it('has the customer picker, Filter and the Board/Table toggle, and nothing the frames lack',()=>{
    renderList(quoteList({manager:MANAGER_OPTIONS}));
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Quotes');
    expect(screen.getByRole('combobox',{name:'Customer, All customers'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Filter'})).toBeInTheDocument();
    const view=screen.getByRole('group',{name:'View'});
    expect(within(view).getAllByRole('button').map(b=>[b.textContent,b.getAttribute('aria-pressed')])).toEqual([['Board','true'],['Table','false']]);
    // Gone (decision 45, plan U3): the status strip, Needs attention view, sort toggle, Rep/Team selects, checkboxes, bulk reassign, "Viewing" line.
    expect(screen.queryByRole('navigation',{name:'Filter by status'})).toBeNull();
    expect(screen.queryByRole('navigation',{name:'Sort quotes needing attention'})).toBeNull();
    expect(screen.queryByRole('combobox',{name:'Rep'})).toBeNull();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/Reassign/)).toBeNull();
    expect(screen.queryByText(/^Viewing/)).toBeNull();
  });

  it('switches between Board and Table in the URL, keeping the filters',()=>{
    renderList(quoteList({customer:WASATCH}),{query:'customer=wasatch&only=overdue'});
    fireEvent.click(within(screen.getByRole('group',{name:'View'})).getByRole('button',{name:'Table'}));
    expect(nav.push).toHaveBeenCalledWith('/rep/quotes?view=table&customer=wasatch&only=overdue',{scroll:false});
  });

  it("picks a customer from the picker: the page's own ?customer=, never carried to another page (task U1)",()=>{
    renderList(quoteList({manager:MANAGER_OPTIONS}),{query:'view=table',view:'table'});
    const box=screen.getByRole('combobox',{name:'Customer, All customers'});
    fireEvent.focus(box);
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map(o=>o.textContent)).toEqual([
      'All customers','Canyon Ridge BuildersCRB-3318','Great Basin FabricationGBF-2207','Wasatch Mechanical ContractorsWAS-1142']);
    fireEvent.mouseDown(screen.getByRole('option',{name:/^Wasatch/}));
    expect(nav.push).toHaveBeenCalledWith('/rep/quotes?view=table&customer=wasatch',{scroll:false});
    expect(screen.getByRole('navigation',{name:'Rep portal'}).querySelector('a[href^="/rep/quotes"]')).toHaveAttribute('href','/rep/quotes');
  });
});

describe('the board',()=>{
  it('shows the six status lanes in order, each counting its quotes',()=>{
    renderList(quoteList({scope:[OVERDUE,AGING,SAMPLE,quoteRow(),OLD]}));
    expect(lanes().map(l=>l.getAttribute('aria-label'))).toEqual(['Draft ready','Changes requested','Sent','Accepted','Expired','Declined']);
    expect(lanes().map(l=>l.querySelector('[data-ui=count]')!.textContent)).toEqual(['1','1','1','2','0','0']);
    expect(cards('Accepted').map(c=>c.getAttribute('aria-label'))).toEqual(['Q-24816','Q-24793']);
    expect(within(lane('Declined')).getByText('No quotes here')).toBeInTheDocument();
  });

  it('draws each card as C_QOBoard does: number and requested day, customer, total and margin, and one red line when something is wrong',()=>{
    renderList(quoteList({scope:[OVERDUE,AGING,SAMPLE,quoteRow(),OLD,{...SAMPLE,id:'q-1',quote_number:'Q-1',aging:{level:'red',since:SAMPLE.requested_at,reason:'Requested 2 days ago'}}]}));
    expect(card('Q-24817')).toHaveTextContent(/^Q-24817Sep 23Wasatch Mechanical Contractors\$1,122\.4032\.2%1 line below floor$/);
    expect(card('Q-24789')).toHaveTextContent(/^Q-24789Sep 21Wasatch Mechanical Contractors\$360\.8028\.1%Aging$/);
    // Overdue with a line under the floor reads "Overdue. 1 line below floor" (C_QOBoard Q-24817).
    expect(within(card('Q-1')).getByText('Overdue. 1 line below floor')).toBeInTheDocument();
    // A date outside this year shows its year; an accepted quote has no red line and no note.
    expect(card('Q-24793')).toHaveTextContent(/^Q-24793Sep 28, 2025Wasatch/);
    expect(card('Q-24816')).toHaveTextContent(/^Q-24816Sep 7Wasatch Mechanical Contractors\$782\.7528\.1%$/);
    expect(within(card('Q-24790')).getByRole('button',{name:'View note'})).toBeInTheDocument();
    expect(card('Q-24790')).toHaveTextContent(/^Q-24790Sep 24Wasatch Mechanical ContractorsView note\$1,210\.0030\.0%Overdue$/);
  });

  it('shows about a screen of cards per lane, then "Show N more" shows the rest and "Show less" goes back',()=>{
    renderList(quoteList({scope:[...accepted(20),SAMPLE]}));
    expect(LANE_PAGE).toBe(7);
    expect(cards('Accepted')).toHaveLength(7);
    fireEvent.click(within(lane('Accepted')).getByRole('button',{name:'Show 13 more'}));
    expect(cards('Accepted')).toHaveLength(20);
    fireEvent.click(within(lane('Accepted')).getByRole('button',{name:'Show less'}));
    expect(cards('Accepted')).toHaveLength(7);
    expect(within(lane('Draft ready')).queryByRole('button',{name:/^Show/})).toBeNull();
  });

  it("moves a lane by keyboard and saves the order as the user's own",async()=>{
    renderList(quoteList());
    const head=lane('Draft ready').querySelector('[aria-keyshortcuts]') as HTMLElement;
    fireEvent.keyDown(head,{key:'ArrowRight',altKey:true});
    expect(lanes().map(l=>l.getAttribute('aria-label')).slice(0,2)).toEqual(['Changes requested','Draft ready']);
    await waitFor(()=>expect(sent('PUT')).toEqual([{url:'/api/rep/table-prefs',body:{table_id:'quotes-board',
      column_order:['changes_requested','ready_for_review','sent','accepted','expired','declined'],hidden_columns:[]}}]));
  });

  it('shows only the lanes of the statuses the filter keeps',()=>{
    renderList(quoteList({statuses:['sent','accepted']}),{query:'status=sent,accepted'});
    expect(lanes().map(l=>l.getAttribute('aria-label'))).toEqual(['Sent','Accepted']);
  });
});

describe('the table',()=>{
  it("has C_QOTable's columns, each row with its quote, customer, requested day, status, total and margin",()=>{
    renderList(quoteList({scope:[OVERDUE,AGING,SAMPLE,quoteRow(),OLD]}),{view:'table'});
    expect(within(table()).getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Quote',':: Customer',':: Requested',':: Status',':: Total',':: Margin']);
    expect(within(bodyRows()[2]).getAllByRole('cell').map(c=>c.textContent)).toEqual(['Q-24817','Wasatch Mechanical Contractors','Sep 23','Draft ready1 line below floor','$1,122.40','32.2%']);
    expect(within(bodyRows()[0]).getAllByRole('cell')[3]).toHaveTextContent(/^Changes requestedOverdueView note$/);
    expect(within(bodyRows()[1]).getAllByRole('cell')[3]).toHaveTextContent(/^SentAging$/);
    expect(within(bodyRows()[4]).getAllByRole('cell')[2]).toHaveTextContent('Sep 28, 2025');
  });

  it('offers Rep, Valid until and Purchasing agent in the columns picker, hidden until picked (C_QOT2)',()=>{
    renderList(quoteList({manager:MANAGER_OPTIONS}),{view:'table'});
    fireEvent.click(screen.getByRole('button',{name:'Choose columns'}));
    const picker=screen.getByRole('dialog',{name:'Choose columns'});
    expect(within(picker).getAllByRole('checkbox').map(c=>[c.getAttribute('aria-label'),(c as HTMLInputElement).checked])).toEqual([
      ['Quote',true],['Customer',true],['Requested',true],['Status',true],['Total',true],['Margin',true],['Rep',false],['Valid until',false],['Purchasing agent',false]]);
    fireEvent.click(within(picker).getByRole('checkbox',{name:'Rep'}));
    fireEvent.click(within(picker).getByRole('checkbox',{name:'Valid until'}));
    fireEvent.click(within(picker).getByRole('checkbox',{name:'Purchasing agent'}));
    expect(within(table()).getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Quote',':: Customer',':: Requested',':: Status',':: Total',':: Margin',':: Rep',':: Valid until',':: Purchasing agent']);
    const cells=within(bodyRows().find(r=>r.textContent!.startsWith('Q-24816'))!).getAllByRole('cell').map(c=>c.textContent);
    expect(cells.slice(6)).toEqual(['Brandi Gallegos','Sep 21','Dana Ortiz']);
    expect(sent('PUT').at(-1)).toMatchObject({url:'/api/rep/table-prefs',body:{table_id:'quotes'}});
  });

  it('shows 14 rows, then "Show N more quotes" and "Show fewer quotes"',()=>{
    renderList(quoteList({scope:accepted(32)}),{view:'table'});
    expect(bodyRows()).toHaveLength(14);
    fireEvent.click(screen.getByRole('button',{name:'Show 18 more quotes'}));
    expect(bodyRows()).toHaveLength(32);
    expect(screen.getByRole('button',{name:'Show fewer quotes'})).toBeInTheDocument();
  });

  it('says so in one plain line when no quote matches',()=>{
    renderList(quoteList({scope:[]}),{view:'table'});
    expect(screen.getByText('No quotes here')).toBeInTheDocument();
  });
});

describe('a rep',()=>{
  const mara={id:'mara',name:'Mara Jensen',initials:'MJ',title:'Inside Sales'};
  const own=[{id:'canyon-ridge',name:'Canyon Ridge Builders',account_number:'CRB-3318'}];

  it('picks among their own customers ("All my customers"), with no Rep column or Rep filter',()=>{
    renderList(quoteList({customers:own}),{rep:mara,view:'table'});
    const box=screen.getByRole('combobox',{name:'Customer, All my customers'});
    fireEvent.focus(box);
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map(o=>o.textContent)).toEqual(['All my customers','Canyon Ridge BuildersCRB-3318']);
    expect(screen.getByText('Your 1 customer. Type to search.')).toBeInTheDocument();
    fireEvent.blur(box);
    fireEvent.click(screen.getByRole('button',{name:'Choose columns'}));
    expect(within(screen.getByRole('dialog',{name:'Choose columns'})).queryByRole('checkbox',{name:'Rep'})).toBeNull();
    fireEvent.keyDown(document,{key:'Escape'});
    fireEvent.click(screen.getByRole('button',{name:'Filter'}));
    const panel=screen.getByRole('dialog',{name:'Filter quotes'});
    expect(within(panel).queryByText('Rep')).toBeNull();
    expect(within(panel).getByRole('button',{name:'Customer: Any of my customers'})).toBeInTheDocument();
  });
});

describe('the filter panel',()=>{
  it("has C_QOB2's fields; Apply filters puts them in the URL",()=>{
    renderList(quoteList({manager:MANAGER_OPTIONS}),{query:'view=table',view:'table'});
    fireEvent.click(screen.getByRole('button',{name:'Filter'}));
    const panel=screen.getByRole('dialog',{name:'Filter quotes'});
    expect(within(panel).getAllByRole('checkbox').map(c=>[c.closest('label')!.textContent,(c as HTMLInputElement).checked])).toEqual([
      ['Draft ready',true],['Changes requested',true],['Sent',true],['Accepted',true],['Expired',true],['Declined',true],['Overdue',false],['Aging',false],['Below margin floor',false]]);
    fireEvent.click(within(panel).getByRole('button',{name:'Rep: All reps'}));
    expect(within(panel).getAllByRole('option').map(o=>o.textContent)).toEqual(['All reps','Brandi Gallegos','Eli Porter','Mara Jensen','Nora Chen']);
    fireEvent.mouseDown(within(panel).getByRole('option',{name:'Mara Jensen'}));
    expect(within(panel).getByRole('button',{name:'Customer: Any customer'})).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('checkbox',{name:'Accepted'}));
    fireEvent.click(within(panel).getByRole('checkbox',{name:'Overdue'}));
    fireEvent.change(within(panel).getByLabelText('Requested from'),{target:{value:'2026-09-01'}});
    fireEvent.click(within(panel).getByRole('button',{name:'Apply filters'}));
    expect(nav.push).toHaveBeenCalledWith('/rep/quotes?view=table&status=ready_for_review%2Cchanges_requested%2Csent%2Cexpired%2Cdeclined&rep=mara&requested_from=2026-09-01&only=overdue',{scroll:false});
  });

  it('shows the count badge for applied filters; Clear all and Apply drop them',()=>{
    renderList(quoteList(),{query:'only=overdue,aging&customer=wasatch'});
    fireEvent.click(screen.getByRole('button',{name:'Filter, 3 applied'}));
    const panel=screen.getByRole('dialog',{name:'Filter quotes'});
    expect(within(panel).getByRole('checkbox',{name:'Overdue'})).toBeChecked();
    expect(within(panel).getByRole('checkbox',{name:'Aging'})).toBeChecked();
    expect(within(panel).getByRole('button',{name:'Customer: Wasatch Mechanical Contractors'})).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button',{name:'Clear all'}));
    fireEvent.click(within(panel).getByRole('button',{name:'Apply filters'}));
    expect(nav.push).toHaveBeenCalledWith('/rep/quotes',{scroll:false});
  });
});

describe('the quote preview (C_QOB5, C_QOT3)',()=>{
  it("opens from a card with the total, requested day, margin, status and the customer's note, then Open quote leads to it",()=>{
    renderList(quoteList({scope:[OVERDUE,SAMPLE]}));
    fireEvent.click(within(card('Q-24790')).getByRole('button',{name:'Q-24790'}));
    const sheet=screen.getByRole('dialog',{name:'Q-24790'});
    expect(sheet).toHaveTextContent('Wasatch Mechanical Contractors');
    expect(within(sheet).getByText('Overdue')).toBeInTheDocument();
    expect(within(sheet).getByText('Total').nextSibling).toHaveTextContent('$1,210.00');
    expect(within(sheet).getByText('Requested').nextSibling).toHaveTextContent('Sep 24');
    expect(within(sheet).getByText('Margin').nextSibling).toHaveTextContent('30.0%');
    expect(within(sheet).getByText('Status: Changes requested')).toBeInTheDocument();
    expect(within(sheet).getByText('"Make it 12 boxes and deliver Friday."')).toBeInTheDocument();
    expect(within(sheet).getByText(/^Dana Ortiz, Sep 2[456]$/)).toBeInTheDocument();
    const open=within(sheet).getByRole('link',{name:'Open quote'});
    expect(open).toHaveAttribute('href','/rep/quotes/Q-24790');
    expect(open).toHaveAttribute('data-prefetch','false');
    // Reply to Dana opens the note with its reply box.
    fireEvent.click(within(sheet).getByRole('button',{name:'Reply to Dana'}));
    expect(screen.getByRole('dialog',{name:'Note on Q-24790'})).toBeInTheDocument();
    expect(screen.getByRole('textbox',{name:'Reply to Dana'})).toHaveFocus();
  });

  it('opens from the keyboard: Enter on a quote number, in the board or the table',()=>{
    renderList(quoteList({scope:[SAMPLE]}));
    fireEvent.keyDown(within(card('Q-24817')).getByRole('button',{name:'Q-24817'}),{key:'Enter'});
    expect(screen.getByRole('dialog',{name:'Q-24817'})).toBeInTheDocument();
  });

  it('opens from a table row; a quote without a note has no note box and no Reply',()=>{
    renderList(quoteList({scope:[SAMPLE]}),{view:'table'});
    fireEvent.click(within(bodyRows()[0]).getAllByRole('cell')[1]);
    const sheet=screen.getByRole('dialog',{name:'Q-24817'});
    expect(within(sheet).getByText('1 line below floor')).toBeInTheDocument();
    expect(within(sheet).getByText('Status: Draft ready')).toBeInTheDocument();
    expect(within(sheet).queryByRole('button',{name:/^Reply/})).toBeNull();
    fireEvent.click(within(sheet).getByRole('button',{name:'Close'}));
    expect(screen.queryByRole('dialog',{name:'Q-24817'})).toBeNull();
  });
});

describe('View note (C_QOB6, C_QOT4)',()=>{
  it('opens the note without opening the preview; Send reply sends it and closes; Close sends nothing',async()=>{
    renderList(quoteList({scope:[CHANGES]}));
    fireEvent.click(within(card('Q-24818')).getByRole('button',{name:'View note'}));
    expect(screen.queryByRole('dialog',{name:'Q-24818'})).toBeNull();
    const note=screen.getByRole('dialog',{name:'Note on Q-24818'});
    expect(note).toHaveTextContent('"Make it 12 boxes and deliver Friday."');
    expect(within(note).getByText(/^Dana Ortiz, Sep 2[456], \d{1,2}:\d{2} (AM|PM)$/)).toBeInTheDocument();
    const reply=within(note).getByRole('textbox',{name:'Reply to Dana'});
    expect(reply).toHaveAttribute('placeholder','Write a reply');
    // Nothing written: Send reply sends nothing and goes back to the reply box.
    reply.blur();
    fireEvent.click(within(note).getByRole('button',{name:'Send reply'}));
    expect(reply).toHaveFocus();
    fireEvent.click(within(note).getAllByRole('button',{name:'Close'}).at(-1)!);
    expect(screen.queryByRole('dialog',{name:'Note on Q-24818'})).toBeNull();
    expect(sent('POST')).toEqual([]);

    fireEvent.click(within(card('Q-24818')).getByRole('button',{name:'View note'}));
    fireEvent.change(screen.getByRole('textbox',{name:'Reply to Dana'}),{target:{value:'Friday works.'}});
    fireEvent.click(screen.getByRole('button',{name:'Send reply'}));
    await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Note on Q-24818'})).toBeNull());
    expect(sent('POST')).toEqual([{url:'/api/rep/quotes/Q-24818/reply',body:{body:'Friday works.'}}]);
  });

  it("opens from a table row's View note too, without opening the preview",()=>{
    renderList(quoteList({scope:[CHANGES]}),{view:'table'});
    fireEvent.click(within(table()).getByRole('button',{name:'View note'}));
    expect(screen.getByRole('dialog',{name:'Note on Q-24818'})).toBeInTheDocument();
    expect(screen.queryByRole('dialog',{name:'Q-24818'})).toBeNull();
  });
});

describe('staying fresh',()=>{
  it('re-reads the list for the same query',async()=>{
    vi.useFakeTimers({shouldAdvanceTime:true});
    renderList(quoteList({customer:WASATCH}),{query:'customer=wasatch&only=overdue'});
    served=quoteList({customer:WASATCH,scope:[SAMPLE]});
    await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    expect(requested()).toContain('/api/rep/quotes?customer=wasatch&only=overdue');
    await waitFor(()=>expect(screen.queryByRole('article',{name:'Q-24818'})).toBeNull());
    expect(requested().some(u=>u.includes('scope='))).toBe(false);
  });

  it('keeps showing the list when a refresh fails, and says it will retry',async()=>{
    fetchMock.mockImplementation(async(input:RequestInfo|URL)=>String(input).startsWith('/api/rep/quotes')?Response.json({detail:'boom'},{status:500}):Response.json({quotes:2,attention:0,caution:[],bell:[]}));
    renderList(quoteList());
    expect(await screen.findByText('Unable to refresh quotes. Trying again in a few seconds.')).toBeInTheDocument();
    expect(card('Q-24817')).toBeInTheDocument();
  });
});
