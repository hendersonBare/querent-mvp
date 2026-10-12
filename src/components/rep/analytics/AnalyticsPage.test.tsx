import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {AnalyticsPage as PageData} from '@/server/analytics';
import {CUSTOMERS,emptyAnalytics,managerPage,repPage,seedAnalytics} from './test-fixtures';

// The Analytics page (spec §4; plan U6; frames C_ANBase to C_AN8, C_RAN1 to C_RAN5) in the rep portal
// shell, against canned GET /api/rep/analytics responses: the tabs per role, the filter per role, the
// Overview, the old Team dashboard's leaderboard, decline reasons and untouched quotes, and the customer
// questions. The frames' numbers are placeholders (Appendix G): these read the fixtures' real-shaped data.

const nav=vi.hoisted(()=>({pathname:'/rep/analytics',query:'',replace:vi.fn()}));
vi.mock('next/navigation',()=>({
  usePathname:()=>nav.pathname,
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:nav.replace,push:vi.fn(),refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('../RepShell');
const {AnalyticsPage,download}=await import('./AnalyticsPage');

const brandi={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',manager:true};
const mara={id:'mara',name:'Mara Jensen',initials:'MJ',title:'Inside Sales'};
const [canyonRidge,greatBasin]=CUSTOMERS;

let answer:(params:URLSearchParams)=>PageData|Response=()=>managerPage();
const fetchMock=vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input),'http://127.0.0.1');
  if(url.pathname==='/api/rep/badges')return Response.json({quotes:1,attention:0,caution:[],bell:[]});
  if(url.pathname==='/api/rep/analytics'){const body=answer(url.searchParams);return body instanceof Response?body:Response.json(body);}
  return Response.json({detail:'Not found.'},{status:404});
});
const analyticsCalls=()=>fetchMock.mock.calls.map(([url])=>new URL(String(url),'http://127.0.0.1')).filter(u=>u.pathname==='/api/rep/analytics');
const lastQuery=()=>analyticsCalls().at(-1)!.searchParams;
const days=(q:URLSearchParams)=>Math.round((Date.parse(q.get('to')!)-Date.parse(q.get('from')!))/86_400_000);

function renderPage(rep:typeof brandi|typeof mara=brandi,query=''){
  nav.query=query;
  return render(<RepShell rep={rep} org="Herrick Industrial Supply" initialBadges={{quotes:1,attention:0,caution:[],bell:[]}}><AnalyticsPage/></RepShell>);
}
const section=(name:string)=>screen.getByRole('region',{name});
const tab=(name:string)=>screen.getByRole('tab',{name});
let downloads:string[]=[];

beforeEach(()=>{
  fetchMock.mockClear();nav.replace.mockClear();downloads=[];
  answer=()=>managerPage();
  vi.stubGlobal('fetch',fetchMock);
  vi.spyOn(download,'to').mockImplementation(url=>{downloads.push(url);});
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('tabs and header per role',()=>{
  it('the manager: Analytics for the whole organization, five tabs, Overview first; Export CSV only on the Rep leaderboard',async()=>{
    renderPage();
    expect(await screen.findByText('1 h 33 min')).toBeInTheDocument();
    expect(screen.getByRole('heading',{level:1,name:'Analytics'})).toBeInTheDocument();
    expect(screen.getByText('Quotes and customer questions for the whole organization')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(t=>t.textContent)).toEqual(['Overview','Rep leaderboard','Decline reasons','Untouched quotes','Customer questions']);
    expect(tab('Overview')).toHaveAttribute('aria-selected','true');
    expect(screen.queryByRole('button',{name:'Export CSV'})).not.toBeInTheDocument();
    fireEvent.click(tab('Rep leaderboard'));
    expect(tab('Rep leaderboard')).toHaveAttribute('aria-selected','true');
    fireEvent.click(screen.getByRole('button',{name:'Export CSV'}));
    const csv=new URL(downloads[0],'http://127.0.0.1');
    expect(csv.pathname).toBe('/api/rep/analytics/csv');
    expect(Object.fromEntries(csv.searchParams)).toEqual(Object.fromEntries(lastQuery()));
    // Arrow keys move between tabs.
    fireEvent.keyDown(tab('Rep leaderboard'),{key:'ArrowRight'});
    expect(tab('Decline reasons')).toHaveAttribute('aria-selected','true');
    expect(screen.queryByRole('button',{name:'Export CSV'})).not.toBeInTheDocument();
  });

  it('a rep: My Analytics for their customers, no Rep leaderboard tab and no Export CSV',async()=>{
    answer=()=>repPage();
    renderPage(mara);
    expect(await screen.findByText('1 h 33 min')).toBeInTheDocument();
    expect(screen.getByRole('heading',{level:1,name:'My Analytics'})).toBeInTheDocument();
    expect(screen.getByText('Quotes and customer questions for your customers')).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map(t=>t.textContent)).toEqual(['Overview','Decline reasons','Untouched quotes','Customer questions']);
    for(const name of ['Overview','Decline reasons','Untouched quotes','Customer questions']){
      fireEvent.click(tab(name));
      expect(screen.queryByRole('button',{name:'Export CSV'})).not.toBeInTheDocument();
    }
  });

  it('names the filtered customer, and shows the error when the numbers can\'t load',async()=>{
    answer=()=>managerPage({scope:{customer:greatBasin,customer_ids:['great-basin'],rep_id:null}});
    renderPage(brandi,'customer=great-basin');
    expect(await screen.findByText('Quotes and customer questions for Great Basin Fabrication')).toBeInTheDocument();
    expect(lastQuery().get('customer')).toBe('great-basin');
    answer=()=>Response.json({detail:'The database is resetting.'},{status:503});
    fireEvent.click(screen.getByRole('button',{name:/^Filter/}));
    fireEvent.click(screen.getByRole('button',{name:'Apply filters'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('The database is resetting.');
  });
});

describe('the filter',()=>{
  it('the manager picks any mix of reps and teams, a customer and the breakdown; Apply reloads, Clear all empties',async()=>{
    renderPage();
    await screen.findByText('1 h 33 min');
    expect(Object.fromEntries(lastQuery())).toEqual({from:expect.any(String),to:expect.any(String)});
    expect(days(lastQuery())).toBe(30);
    fireEvent.click(screen.getByRole('button',{name:'Filter'}));
    const panel=screen.getByRole('dialog',{name:'Filter analytics'});
    expect(panel).toHaveTextContent('Pick any mix of reps and teams, then break the numbers down.');
    expect(within(within(panel).getByRole('group',{name:'Reps'})).getAllByRole('checkbox').map(c=>c.closest('label')!.textContent)).toEqual(['Brandi Gallegos','Eli Porter','Mara Jensen','Nora Chen']);
    expect(within(within(panel).getByRole('group',{name:'Teams'})).getAllByRole('checkbox').map(c=>c.closest('label')!.textContent)).toEqual(['Inside Sales','Outside Sales']);
    expect(within(panel).getByRole('button',{name:'Customer: Any customer'})).toBeInTheDocument();
    const breakdown=within(panel).getByRole('radiogroup',{name:'Break the numbers down by'});
    expect(within(breakdown).getAllByRole('radio').map(r=>[r.textContent,r.getAttribute('aria-checked')])).toEqual([['Whole organization','true'],['Rep','false'],['Team','false'],['Customer','false']]);

    fireEvent.click(within(panel).getByRole('checkbox',{name:'Eli Porter'}));
    fireEvent.click(within(panel).getByRole('checkbox',{name:'Inside Sales'}));
    fireEvent.click(within(breakdown).getByRole('radio',{name:'Team'}));
    fireEvent.click(within(panel).getByRole('button',{name:'Customer: Any customer'}));
    fireEvent.mouseDown(screen.getByRole('option',{name:canyonRidge.name}));
    fireEvent.click(within(panel).getByRole('button',{name:'Apply filters'}));
    await waitFor(()=>expect(lastQuery().get('reps')).toBe('eli'));
    expect(Object.fromEntries(lastQuery())).toMatchObject({teams:'Inside Sales',breakdown:'team',customer:'canyon-ridge'});
    expect(screen.getByRole('button',{name:'Filter, 4 applied'})).toBeInTheDocument();
    expect(nav.replace).toHaveBeenLastCalledWith('/rep/analytics?customer=canyon-ridge',{scroll:false});

    fireEvent.click(screen.getByRole('button',{name:'Filter, 4 applied'}));
    fireEvent.click(screen.getByRole('button',{name:'Clear all'}));
    fireEvent.click(screen.getByRole('button',{name:'Apply filters'}));
    await waitFor(()=>expect(lastQuery().get('reps')).toBeNull());
    expect(lastQuery().get('breakdown')).toBeNull();
    expect(screen.getByRole('button',{name:'Filter'})).toBeInTheDocument();
  });

  it('a rep picks one of their customers and a period (7, 30 or 90 days, or Custom); no reps, teams or breakdown',async()=>{
    answer=()=>repPage();
    renderPage(mara);
    await screen.findByText('1 h 33 min');
    expect(days(lastQuery())).toBe(30);
    fireEvent.click(screen.getByRole('button',{name:'Filter'}));
    const panel=screen.getByRole('dialog',{name:'Filter analytics'});
    expect(panel).toHaveTextContent('Narrow your numbers to one customer or a period.');
    expect(within(panel).queryByRole('group',{name:'Reps'})).not.toBeInTheDocument();
    expect(within(panel).queryByRole('radiogroup',{name:'Break the numbers down by'})).not.toBeInTheDocument();
    expect(within(panel).getByRole('button',{name:'Customer: Any of my customers'})).toBeInTheDocument();
    const period=within(panel).getByRole('radiogroup',{name:'Period'});
    expect(within(period).getAllByRole('radio').map(r=>[r.textContent,r.getAttribute('aria-checked')])).toEqual([['7 days','false'],['30 days','true'],['90 days','false'],['Custom','false']]);
    fireEvent.click(within(period).getByRole('radio',{name:'7 days'}));
    fireEvent.click(within(panel).getByRole('button',{name:'Apply filters'}));
    await waitFor(()=>expect(days(lastQuery())).toBe(7));
    expect(lastQuery().get('reps')).toBeNull();
    expect(screen.getByRole('button',{name:'Filter, 1 applied'})).toBeInTheDocument();

    // Custom (no frame): a start and an end day.
    fireEvent.click(screen.getByRole('button',{name:'Filter, 1 applied'}));
    fireEvent.click(within(screen.getByRole('radiogroup',{name:'Period'})).getByRole('radio',{name:'Custom'}));
    fireEvent.change(screen.getByLabelText('From'),{target:{value:'2026-09-01'}});
    fireEvent.change(screen.getByLabelText('To'),{target:{value:'2026-09-10'}});
    fireEvent.click(screen.getByRole('button',{name:'Apply filters'}));
    await waitFor(()=>expect(days(lastQuery())).toBe(10));
  });
});

describe('Overview',()=>{
  it('shows the five stat cards with the frame\'s sentence patterns, each with an "i" that explains it',async()=>{
    answer=()=>repPage();
    renderPage(mara);
    await screen.findByText('1 h 33 min');
    const cards=['Median time to send','Win rate','Quoted vs accepted','Hours saved','Extra GP Querent found'];
    expect(screen.getAllByRole('heading',{level:2}).slice(0,5).map(h=>h.textContent)).toEqual(cards);
    expect(section('Median time to send')).toHaveTextContent('Median time to sendi1 h 33 minFrom request to first send, 24 quotes');
    expect(section('Win rate')).toHaveTextContent('71%17 won, 7 lost, 1 open');
    expect(section('Quoted vs accepted')).toHaveTextContent('$9,045quoted$7,008 accepted, 77%');
    expect(section('Hours saved')).toHaveTextContent('8.0hours20 min for each of 24 quotes sent');
    expect(section('Extra GP Querent found')).toHaveTextContent('+$10.202 lines you kept, on 2 accepted quotes');
    const tips=screen.getAllByRole('button',{name:/^How .+ is calculated$/});
    expect(tips.map(b=>b.getAttribute('aria-label'))).toEqual(['How median time to send is calculated','How win rate is calculated','How dollars quoted and accepted is calculated','How hours saved is calculated','How extra GP Querent found is calculated']);
    const winRate=screen.getByRole('button',{name:'How win rate is calculated'});
    expect(winRate).toHaveTextContent('i');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(winRate);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Accepted quotes divided by decided quotes: 17 of 24.');
    fireEvent.keyDown(window,{key:'Escape'});
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.mouseEnter(screen.getByRole('button',{name:'How hours saved is calculated'}));
    expect(screen.getByRole('tooltip')).toHaveTextContent('times 24 quotes sent: 480 minutes');
  });

  it('charts quotes and wins by week, and shows them as a table newest first, about one screen then "Show N more weeks"',async()=>{
    renderPage();
    const chart=await screen.findByRole('region',{name:'Quotes and wins by week'});
    expect(chart).toHaveTextContent('15 quotes requested in the last 26 weeks, 10 won so far.');
    expect(chart).toHaveTextContent('WonLost or still open');
    // A label under every fourth week from the first, as drawn (Apr 20, May 18, ...).
    expect(within(chart).getAllByTestId('week-label').map(l=>l.textContent).filter(Boolean)).toEqual(['Mar 30','Apr 27','May 25','Jun 22','Jul 20','Aug 17','Sep 14']);
    fireEvent.click(within(chart).getByRole('button',{name:'Show table'}));
    const table=within(chart).getByRole('table');
    const rows=within(table).getAllByRole('row');
    expect(rows).toHaveLength(10);
    expect(rows[0]).toHaveTextContent(':: Week of:: Requested:: Won:: Lost:: Open');
    expect(rows[1]).toHaveTextContent('Sep 211001');
    expect(rows[3]).toHaveTextContent('Sep 71100');
    fireEvent.click(within(chart).getByRole('button',{name:'Show 17 more weeks'}));
    expect(within(table).getAllByRole('row')).toHaveLength(27);
    fireEvent.click(within(chart).getByRole('button',{name:'Show chart'}));
    expect(within(chart).queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows margin vs floor and the top requested items',async()=>{
    renderPage();
    const margin=await screen.findByRole('region',{name:'Average margin vs floor'});
    expect(margin).toHaveTextContent('33.8% average margin against a 24.0% average floor. 3 lines of 56 under the floor.');
    expect(within(margin).getAllByRole('listitem').map(r=>r.textContent)).toEqual([
      'Fasteners32.2%floor 20%','Abrasives & Cutting34.2%floor 25%','Safety & PPE34.2%floor 30%3 lines under the 30% floor','Tools35.6%floor 18%',
    ]);
    expect(margin).toHaveTextContent('Average marginYour floor. Bars run from 0 to 50%.');
    const items=within(section('Top requested items')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('HCS-12-13-2G8 Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc6 quotes, qty 60');
  });

  it('a customer with no data: plain empty lines, and "-" for a number with nothing to divide',async()=>{
    answer=()=>({...managerPage(),...emptyAnalytics(greatBasin)});
    renderPage(brandi,'customer=great-basin');
    await waitFor(()=>expect(section('Median time to send')).toHaveTextContent('-No quotes sent yet'));
    expect(section('Win rate')).toHaveTextContent('-No quotes decided yet');
    expect(section('Quoted vs accepted')).toHaveTextContent('$0.00quotedNo quotes sent yet');
    expect(section('Extra GP Querent found')).toHaveTextContent('$0.00No accepted quotes yet');
    expect(section('Quotes and wins by week')).toHaveTextContent('No quotes requested in the last 26 weeks.');
    expect(within(section('Quotes and wins by week')).queryByRole('button',{name:'Show table'})).not.toBeInTheDocument();
    expect(section('Average margin vs floor')).toHaveTextContent('No quotes sent yet.');
    expect(section('Top requested items')).toHaveTextContent('No items requested yet.');
    expect(document.body.textContent).not.toContain('—');
  });
});

describe('the old Team dashboard, in tabs',()=>{
  it('Rep leaderboard: one row per rep and the totals, the window, counts linked to their quotes, "-" with nothing to divide',async()=>{
    renderPage();
    await screen.findByText('1 h 33 min');
    fireEvent.click(tab('Rep leaderboard'));
    const board=section('Leaderboard');
    expect(board).toHaveTextContent('Quotes created Sep 12, 2026 to Oct 11, 2026, counted under the rep who owns them now');
    expect(board).toHaveTextContent('Rates use the quotes created in the window. Open quotes are shown on their own. Pick a count to see its quotes.');
    expect(within(board).getByRole('radiogroup',{name:'Created'})).toHaveTextContent('7 days30 days90 daysCustom');
    const table=within(board).getByRole('table',{name:'Leaderboard'});
    expect(within(table).getAllByRole('rowheader').map(r=>r.textContent)).toEqual(['Brandi Gallegos','Eli Porter','Mara Jensen','Nora Chen','Total']);
    expect(within(table).getAllByRole('columnheader').map(c=>c.textContent)).toEqual([':: Rep',':: Created',':: Ok',':: Aging',':: Overdue',':: Draft ready',':: Changes req.',':: Sent',':: Accepted',':: Declined',':: Expired',
      ':: Quote-to-order',':: Unaccepted',':: Decided win rate',':: Time to send',':: Customer response',':: In draft ready',':: In sent']);
    const maraRow=within(table).getAllByRole('row').find(r=>r.textContent!.startsWith('Mara Jensen'))!;
    expect(maraRow).toHaveTextContent('Mara Jensen13023212431'+'31%31%50%'+'1 h 59 min3.2 days5 h 54 min4.2 d');
    const declined=within(maraRow).getByRole('link',{name:'3 declined'});
    expect(Object.fromEntries(new URL(declined.getAttribute('href')!,'http://x').searchParams)).toMatchObject({rep:'mara',status:'declined'});
    const nora=within(table).getAllByRole('row').find(r=>r.textContent!.startsWith('Nora Chen'))!;
    expect(nora).toHaveTextContent('Nora Chen0000000000-------');
    expect(within(nora).queryByRole('link')).not.toBeInTheDocument();
    // Another window reloads the numbers for it.
    fireEvent.click(within(board).getByRole('radio',{name:'7 days'}));
    await waitFor(()=>expect(days(lastQuery())).toBe(7));
  });

  it('Decline reasons: per reason with a column per rep, and the Other notes in the customer\'s words',async()=>{
    renderPage();
    await screen.findByText('1 h 33 min');
    fireEvent.click(tab('Decline reasons'));
    const declines=section('Decline reasons');
    expect(declines).toHaveTextContent('Decline reasons6 declined quotes in the window. Expired quotes are counted apart.');
    const table=within(declines).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(c=>c.textContent)).toEqual([':: Reason',':: Quotes',':: Share',':: Brandi Gallegos',':: Eli Porter',':: Mara Jensen',':: Nora Chen']);
    expect(within(table).getAllByRole('rowheader').map(r=>r.textContent)).toEqual(['Price too high','Found other source','Need it sooner than quoted','Wrong items or quantity','Other','No reason given']);
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Price too high117%0010');
    const notes=within(declines).getByRole('list',{name:'Other, in the customer\'s words'});
    expect(notes).toHaveTextContent('"The general contractor is supplying the anchors on this job."Q-24767, Mara Jensen, Sep 28');
    expect(within(notes).getByRole('link',{name:'Q-24767'})).toHaveAttribute('href','/rep/quotes/Q-24767');
  });

  it('Untouched quotes: the reasons per rep and the totals',async()=>{
    renderPage();
    await screen.findByText('1 h 33 min');
    fireEvent.click(tab('Untouched quotes'));
    const untouched=section('Why quotes went untouched');
    expect(untouched).toHaveTextContent('Read from what happened to each quote, never typed by a rep. Open quotes count once they are aging or overdue.');
    const table=within(untouched).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(c=>c.textContent)).toEqual([':: Rep',':: Draft never opened',':: Draft opened but never sent',':: Changes requested but never revised',
      ':: Sent but never opened',':: Sent and opened but no reply',':: Expired with no response']);
    expect(within(table).getAllByRole('rowheader').map(r=>r.textContent)).toEqual(['Brandi Gallegos','Eli Porter','Mara Jensen','Nora Chen','Total']);
    expect(within(table).getAllByRole('row').at(-1)).toHaveTextContent('Total412224');
  });

  it('names the rows after the breakdown: a team',async()=>{
    const base=managerPage();
    const teams=managerPage({filter:{...base.filter,breakdown:'team'},groups:{...base.groups,dimension:'team',
      rows:base.groups.rows.slice(0,2).map((r,i)=>({...r,rep_id:null,key:`team:${['Inside Sales','Outside Sales'][i]}`,name:['Inside Sales','Outside Sales'][i],rep_ids:[['brandi','mara'],['eli','nora']][i]}))}});
    answer=params=>params.get('breakdown')==='team'?teams:base;
    renderPage();
    await screen.findByText('1 h 33 min');
    fireEvent.click(screen.getByRole('button',{name:'Filter'}));
    fireEvent.click(screen.getByRole('radio',{name:'Team'}));
    fireEvent.click(screen.getByRole('button',{name:'Apply filters'}));
    await waitFor(()=>expect(lastQuery().get('breakdown')).toBe('team'));
    fireEvent.click(tab('Rep leaderboard'));
    await waitFor(()=>expect(within(within(section('Leaderboard')).getByRole('table',{name:'Leaderboard'})).getAllByRole('columnheader')[0]).toHaveTextContent(':: Team'));
    expect(within(within(section('Leaderboard')).getByRole('table',{name:'Leaderboard'})).getAllByRole('rowheader').map(r=>r.textContent)).toEqual(['Inside Sales','Outside Sales','Total']);
  });

  it('a rep\'s Decline reasons and Untouched quotes drop the per-rep columns and rows',async()=>{
    answer=()=>repPage();
    renderPage(mara);
    await screen.findByText('1 h 33 min');
    fireEvent.click(tab('Decline reasons'));
    const declines=section('Decline reasons');
    expect(declines).toHaveTextContent('3 declined quotes in the window. Expired quotes are counted apart.');
    expect(within(within(declines).getByRole('table')).getAllByRole('columnheader').map(c=>c.textContent)).toEqual([':: Reason',':: Quotes',':: Share']);
    expect(within(declines).getByRole('list',{name:'Other, in the customer\'s words'})).toHaveTextContent('Q-24767, Canyon Ridge Builders, Sep 28');
    fireEvent.click(tab('Untouched quotes'));
    const table=within(section('Why quotes went untouched')).getByRole('table');
    expect(within(table).getAllByRole('columnheader')[0]).toHaveTextContent(':: Whose quotes');
    expect(within(table).getAllByRole('rowheader').map(r=>r.textContent)).toEqual(['Your quotes']);
  });
});

describe('Customer questions',()=>{
  it('the manager: questions answered without a rep, the query analytics with the assigned rep, and Manage customer access',async()=>{
    answer=()=>managerPage({scope:{customer:CUSTOMERS[2],customer_ids:['wasatch'],rep_id:null}});
    renderPage(brandi,'customer=wasatch');
    await screen.findByText('1 h 33 min');
    fireEvent.click(tab('Customer questions'));
    const questions=section('Questions answered without a rep');
    expect(questions).toHaveTextContent('40of 40100% answered without a rep');
    expect(questions).toHaveTextContent('Answered with live data37Answered, nothing matched3Needed a rep0');
    const legacy=section('Query analytics');
    expect(legacy).toHaveTextContent('Customer questions Querent answered in chat, by information category.');
    expect(legacy).toHaveTextContent('Total queriesi40Customer questions, all time');
    expect(legacy).toHaveTextContent('Estimated time savedi5.0hrsBased on typical lookup times');
    const table=within(legacy).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(c=>c.textContent)).toEqual([':: Category',':: Questions',':: Assigned rep']);
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Items and stock14Brandi Gallegos');
    expect(legacy).toHaveTextContent('Combined questions count in each relevant category and once in the total.');
    expect(legacy).toHaveTextContent('Answers for customers.Time for your team.');
    expect(legacy).toHaveTextContent('4 of 4categories fully enabled');
    expect(within(legacy).getByRole('link',{name:'Manage customer access'})).toHaveAttribute('href','/rep/settings?tab=access&customer=wasatch');
    expect(screen.getAllByRole('button',{name:/^How .+ is calculated$/}).map(b=>b.getAttribute('aria-label'))).toEqual(['How total queries is calculated','How estimated time saved is calculated']);
  });

  it('a rep: no Assigned rep column and no Manage customer access',async()=>{
    answer=()=>repPage();
    renderPage(mara);
    await screen.findByText('1 h 33 min');
    fireEvent.click(tab('Customer questions'));
    const legacy=section('Query analytics');
    expect(within(within(legacy).getByRole('table')).getAllByRole('columnheader').map(c=>c.textContent)).toEqual([':: Category',':: Questions']);
    expect(within(legacy).queryByRole('link',{name:'Manage customer access'})).not.toBeInTheDocument();
    expect(legacy).not.toHaveTextContent('Brandi Gallegos');
  });
});

it('the page fixtures keep the seed\'s overview',()=>{
  expect(managerPage().turnaround).toEqual(seedAnalytics().turnaround);
});
