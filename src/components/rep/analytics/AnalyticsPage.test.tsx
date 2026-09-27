import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {RepAnalytics} from '@/server/analytics';
import {CUSTOMERS,emptyAnalytics,seedAnalytics} from './test-fixtures';

// The Analytics page (spec §4, task 6.2) in the rep portal frame, against canned API responses.

const nav=vi.hoisted(()=>({pathname:'/rep/analytics',query:'',replace:vi.fn()}));
vi.mock('next/navigation',()=>({
  usePathname:()=>nav.pathname,
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:nav.replace,push:vi.fn(),refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('../RepShell');
const {AnalyticsPage}=await import('./AnalyticsPage');

const brandi={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'};
const [canyonRidge,greatBasin,wasatch]=CUSTOMERS;

let analytics:(customer:string|null)=>RepAnalytics|Response=()=>seedAnalytics();
const fetchMock=vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input),'http://127.0.0.1');
  if(url.pathname==='/api/rep/badges')return Response.json({quotes:1});
  if(url.pathname==='/api/rep/analytics'){const body=analytics(url.searchParams.get('customer'));return body instanceof Response?body:Response.json(body);}
  return Response.json({detail:'Not found.'},{status:404});
});
const requested=()=>fetchMock.mock.calls.map(([url])=>String(url));

function renderPage(query=''){
  nav.query=query;
  return render(<RepShell rep={brandi} org="Herrick Industrial Supply" customers={CUSTOMERS} initialBadges={{quotes:1}}><AnalyticsPage/></RepShell>);
}
const card=(name:string)=>screen.getByRole('region',{name});

beforeEach(()=>{fetchMock.mockClear();analytics=()=>seedAnalytics();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());

describe('All customers',()=>{
  it('shows the five stat cards in the spec\'s order with the seed\'s numbers',async()=>{
    renderPage();
    expect(await screen.findByText('1 h 33 min')).toBeInTheDocument();
    expect(requested()).toContain('/api/rep/analytics');
    expect(screen.getByRole('heading',{level:1,name:'Analytics'})).toBeInTheDocument();
    expect(screen.getByText('Quotes and customer questions for all your customers')).toBeInTheDocument();
    const labels=['Median time to send','Win rate','Quoted vs accepted','Hours saved','Extra GP Querent found'];
    expect(screen.getAllByRole('heading',{level:2}).slice(0,5).map(h=>h.textContent)).toEqual(labels);
    expect(card('Median time to send')).toHaveTextContent('1 h 33 minFrom request to first send, 24 quotes');
    expect(card('Win rate')).toHaveTextContent('71%17 won, 7 lost, 1 open');
    expect(card('Quoted vs accepted')).toHaveTextContent('$9,045 quoted$7,008 accepted, 77%');
    expect(card('Hours saved')).toHaveTextContent('8.0 hours20 min for each of 24 quotes sent');
    expect(card('Extra GP Querent found')).toHaveTextContent('+$10.202 lines you kept, on 2 accepted quotes');
  });

  it('puts an "i" on every number that explains its calculation with these figures',async()=>{
    renderPage();
    await screen.findByText('1 h 33 min');
    const tips=screen.getAllByRole('button',{name:/^How .+ is calculated$/});
    expect(tips.map(b=>b.getAttribute('aria-label'))).toEqual([
      'How median time to send is calculated','How win rate is calculated','How dollars quoted and accepted is calculated','How hours saved is calculated','How extra GP Querent found is calculated',
      'How the weekly trend is calculated','How average margin vs floor is calculated','How top requested items is calculated','How questions answered without a rep is calculated',
      'How total queries is calculated','How estimated time saved is calculated','How queries by category is calculated',
    ]);
    const winRate=screen.getByRole('button',{name:'How win rate is calculated'});
    expect(winRate).toHaveAccessibleDescription(/Accepted quotes divided by decided quotes: 17 of 24\..*sent quote past its valid-until date counts as lost/);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.click(winRate);
    expect(screen.getByRole('tooltip')).toHaveTextContent('1 quote still waiting on you or the customer doesn’t count yet.');
    fireEvent.keyDown(window,{key:'Escape'});
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    fireEvent.focus(screen.getByRole('button',{name:'How hours saved is calculated'}));
    expect(screen.getByRole('tooltip')).toHaveTextContent('A fixed 20 minutes of rep time for each quote sent');
    expect(screen.getByRole('tooltip')).toHaveTextContent('times 24 quotes sent: 480 minutes');
    fireEvent.blur(screen.getByRole('button',{name:'How hours saved is calculated'}));
    fireEvent.mouseEnter(screen.getByRole('button',{name:'How extra GP Querent found is calculated'}).parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Found on 2 lines across 2 of 17 accepted quotes.');
  });

  it('charts quotes and wins by week, readable by keyboard and as a table',async()=>{
    renderPage();
    const chart=await screen.findByRole('region',{name:'Quotes and wins by week'});
    expect(chart).toHaveTextContent('15 quotes requested in the last 26 weeks, 10 won so far.');
    expect(within(chart).getByRole('list',{name:'Legend'})).toHaveTextContent('WonLost or still open');
    const plot=within(chart).getByRole('group');
    fireEvent.focus(plot);
    expect(within(chart).getByRole('status')).toHaveTextContent('1 quote0 won, 0 lost, 1 openWeek of Sep 21');
    fireEvent.keyDown(plot,{key:'ArrowLeft'});
    expect(within(chart).getByRole('status')).toHaveTextContent('0 quotes0 won, 0 lost, 0 openWeek of Sep 14');
    fireEvent.keyDown(plot,{key:'ArrowLeft'});
    expect(within(chart).getByRole('status')).toHaveTextContent('1 quote1 won, 0 lost, 0 openWeek of Sep 7');
    fireEvent.keyDown(plot,{key:'Home'});
    expect(within(chart).getByRole('status')).toHaveTextContent('Week of Mar 30');
    fireEvent.blur(plot);
    expect(within(chart).queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(within(chart).getByRole('button',{name:'Show table'}));
    expect(within(chart).getByRole('button',{name:'Show table'})).toHaveAttribute('aria-pressed','true');
    const rows=within(within(chart).getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(27);
    expect(rows[0]).toHaveTextContent('Week ofRequestedWonLostOpen');
    expect(rows[1]).toHaveTextContent('Sep 211001');
    expect(rows[3]).toHaveTextContent('Sep 71100');
  });

  it('shows margin vs floor, top items and questions answered without a rep',async()=>{
    renderPage();
    const margin=await screen.findByRole('region',{name:'Average margin vs floor'});
    expect(margin).toHaveTextContent('33.8% average margin against a 24.0% average floor. 3 lines of 56 under the floor.');
    const rows=within(margin).getAllByRole('listitem');
    expect(rows.map(r=>r.textContent)).toEqual([
      'Fasteners32.2%floor 20%','Abrasives & Cutting34.2%floor 25%','Safety & PPE34.2%floor 30%3 lines under the 30% floor','Tools35.6%floor 18%',
    ]);
    const items=within(card('Top requested items')).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('HCS-12-13-2G8Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zinc6 quotes, qty 60');
    const questions=card('Questions answered without a rep');
    expect(questions).toHaveTextContent('40 of 40100% answered without you');
    expect(questions).toHaveTextContent('Answered with live data37Answered, nothing matched3Needed you0');
  });

  it('keeps the old query analytics below, with its own "i"s',async()=>{
    analytics=()=>seedAnalytics(wasatch);
    renderPage('customer=wasatch');
    const legacy=await screen.findByRole('region',{name:'Query analytics'});
    expect(within(legacy).getByText('Total queries').closest('.metric')!.querySelector('strong')).toHaveTextContent('40');
    expect(within(legacy).getByRole('heading',{name:'Queries by category'})).toBeInTheDocument();
    expect(within(legacy).getByText('4 of 4')).toBeInTheDocument();
    expect(within(legacy).getByRole('link',{name:/Manage customer access/})).toHaveAttribute('href','/rep/settings?tab=access&customer=wasatch');
  });
});

describe('the picker',()=>{
  it('reads the picked customer, and a placeholder customer shows zeros and empty states',async()=>{
    analytics=customer=>customer==='great-basin'?emptyAnalytics(greatBasin):seedAnalytics();
    renderPage('customer=great-basin');
    expect(await screen.findByText('Quotes and customer questions for Great Basin Fabrication')).toBeInTheDocument();
    await waitFor(()=>expect(card('Median time to send')).toHaveTextContent('—No quotes sent yet'));
    expect(requested()).toContain('/api/rep/analytics?customer=great-basin');
    expect(card('Win rate')).toHaveTextContent('—No quotes decided yet');
    expect(card('Quoted vs accepted')).toHaveTextContent('$0.00 quotedNo quotes sent yet');
    expect(card('Hours saved')).toHaveTextContent('0.0 hoursNo quotes sent yet');
    expect(card('Extra GP Querent found')).toHaveTextContent('$0.00No accepted quotes yet');
    expect(card('Quotes and wins by week')).toHaveTextContent('No quotes requested in the last 26 weeks.');
    expect(within(card('Quotes and wins by week')).queryByRole('button',{name:'Show table'})).not.toBeInTheDocument();
    expect(card('Average margin vs floor')).toHaveTextContent('No quotes sent yet.');
    expect(card('Top requested items')).toHaveTextContent('No items requested yet.');
    expect(card('Questions answered without a rep')).toHaveTextContent('No customer questions yet.');
    expect(screen.getByText('Total queries').closest('.metric')!.querySelector('strong')).toHaveTextContent('0');
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    // Every number still explains itself.
    expect(screen.getAllByRole('button',{name:/^How .+ is calculated$/})).toHaveLength(12);
  });

  it('says so when the picked customer is another rep\'s',async()=>{
    analytics=()=>emptyAnalytics(canyonRidge,true);
    renderPage('customer=canyon-ridge');
    expect(await screen.findByRole('note')).toHaveTextContent('Canyon Ridge Builders is Mara Jensen’s customer. Analytics covers your own customers, so there’s nothing to count here.');
    expect(screen.queryByText('categories fully enabled')).not.toBeInTheDocument();
  });

  it('shows the error when the numbers can\'t load',async()=>{
    analytics=()=>Response.json({detail:'The database is resetting.'},{status:503});
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('The database is resetting.');
  });
});
