import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {BadgeSummary,RepBadges} from '@/server/rep/badges';

// The rep portal shell (plan U2): the left rail (C_QOBoard for the manager, C_RQBoard for a rep),
// Sign out (C_QOB9), and every page header's caution and bell dropdowns (C_QOB3, C_QOB4). There is
// no search, no avatar menu, no "Switch workspace", no role switch (decision 42) and no "Viewing"
// picker (task U1). The frames draw no count on the nav, the caution or the bell.

const nav=vi.hoisted(()=>({pathname:'/rep/quotes',query:'',replace:vi.fn(),push:vi.fn()}));
vi.mock('next/navigation',()=>({
  usePathname:()=>nav.pathname,
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:nav.replace,push:nav.push,refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('./RepShell');
const {exit}=await import('./Rail');
const {RepPageHeader}=await import('./RepPage');
const {SettingsSection}=await import('./SettingsSection');
const {settingsFixture}=await import('./settings/test-fixtures');

const brandi={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',manager:true};
const mara={id:'mara',name:'Mara Jensen',initials:'MJ',title:'Inside Sales'};
const ORG='Herrick Industrial Supply';

const caution=(over:Partial<BadgeSummary>={}):BadgeSummary=>({id:'q-24790',quote_number:'Q-24790',kind:'quote_overdue',label:'Q-24790',tag:'Overdue',
  line:'Dana Ortiz asked to move pickup to Ogden.',at:'2026-09-21T16:00:00.000Z',...over});
const bellItem=(over:Partial<BadgeSummary>={}):BadgeSummary=>({id:'q-24817',quote_number:'Q-24817',kind:'quote_requested',label:'Q-24817 requested by Dana Ortiz',
  tag:null,line:null,at:'2026-09-23T16:14:00.000Z',...over});
const BADGES:RepBadges={quotes:1,attention:2,
  caution:[caution(),caution({id:'q-24812',quote_number:'Q-24812',label:'Q-24812',line:'Sent Sep 15, no reply yet.'}),
    caution({id:'q-24789',quote_number:'Q-24789',label:'Q-24789',tag:'Aging',kind:'quote_aging',line:'Sent Sep 19, no reply yet.'})],
  bell:[bellItem(),bellItem({id:'q-24815',quote_number:'Q-24815',kind:'quote_expired',label:'Q-24815 expired',line:'Sep 18',at:'2026-09-18T00:00:00.000Z'})]};

let served:RepBadges=BADGES;
const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url==='/api/rep/badges')return Response.json(served);
  if(url==='/api/session'&&init?.method==='DELETE')return Response.json({ok:true});
  return Response.json({detail:'Not found.'},{status:404});
});

function Page(){return <RepPageHeader title="Quotes"/>;}
function renderShell(rep:typeof brandi|typeof mara=brandi,children:ReactNode=<Page/>,initialBadges:RepBadges=BADGES){
  return render(<RepShell rep={rep} org={ORG} initialBadges={initialBadges}>{children}</RepShell>);
}
const at=(pathname:string,query='')=>{nav.pathname=pathname;nav.query=query;};
const rail=()=>screen.getByRole('complementary');
const portalNav=()=>screen.getByRole('navigation',{name:'Rep portal'});
const requested=()=>fetchMock.mock.calls.map(([url])=>String(url));
const cautionButton=()=>screen.getByRole('button',{name:/^Needs attention/});
const bellButton=()=>screen.getByRole('button',{name:/^Notifications/});

let leave:ReturnType<typeof vi.spyOn>;
beforeEach(()=>{
  at('/rep/quotes');nav.replace.mockClear();nav.push.mockClear();fetchMock.mockClear();served=BADGES;
  vi.stubGlobal('fetch',fetchMock);
  leave=vi.spyOn(exit,'to').mockImplementation(()=>{});
});
afterEach(()=>{vi.unstubAllGlobals();leave.mockRestore();});

describe('rail (C_QOBoard, C_RQBoard)',()=>{
  it('shows the Querent logo, the supplier, the manager\'s seven sections with icons, and the user block',()=>{
    renderShell();
    expect(within(rail()).getByRole('img',{name:'Querent'})).toBeInTheDocument();
    expect(rail()).toHaveTextContent('Querent');
    expect(within(rail()).getByText(ORG)).toBeInTheDocument();
    const links=within(portalNav()).getAllByRole('link');
    expect(links.map(l=>l.textContent)).toEqual(['Quotes','Customers','Orders','Stock','Analytics','Teams and Reps','Settings']);
    expect(links.map(l=>l.getAttribute('href'))).toEqual(['/rep/quotes','/rep/customers','/rep/orders','/rep/stock','/rep/analytics','/rep/teams','/rep/settings']);
    for(const link of links)expect(link.querySelector('svg')).not.toBeNull();
    expect(within(rail()).getByText('BG')).toBeInTheDocument();
    expect(within(rail()).getByText('Brandi G.')).toBeInTheDocument();
    expect(within(rail()).getByText('Manager')).toBeInTheDocument();
    expect(within(rail()).getByRole('button',{name:'Sign out'})).toBeInTheDocument();
  });

  it('gives a rep My Analytics and no Teams and Reps, and names the role Rep',()=>{
    renderShell(mara);
    expect(within(portalNav()).getAllByRole('link').map(l=>l.textContent)).toEqual(['Quotes','Customers','Orders','Stock','My Analytics','Settings']);
    expect(within(portalNav()).queryByRole('link',{name:'Teams and Reps'})).toBeNull();
    expect(within(rail()).getByText('Mara J.')).toBeInTheDocument();
    expect(within(rail()).getByText('Rep')).toBeInTheDocument();
    expect(within(rail()).getByText('MJ')).toBeInTheDocument();
  });

  it('marks the current section, including its sub-pages (Stock for /rep/stock/<sku>)',()=>{
    at('/rep/quotes/Q-24817');
    const {unmount}=renderShell();
    expect(within(portalNav()).getByRole('link',{current:'page'})).toHaveTextContent('Quotes');
    unmount();
    at('/rep/stock/HCS-12-13-2G8');
    renderShell();
    expect(within(portalNav()).getAllByRole('link',{current:'page'}).map(l=>l.textContent)).toEqual(['Stock']);
  });

  it('has no search, avatar menu, Switch workspace, role switch, Viewing picker or nav count',()=>{
    renderShell();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button',{name:/^Account/})).toBeNull();
    expect(screen.queryByText('Switch workspace')).toBeNull();
    expect(screen.queryByLabelText('Viewing')).toBeNull();
    expect(screen.queryByText(/unread/)).toBeNull();
  });

  it('keeps no ?customer= or ?scope= on any nav link, whatever the page\'s own URL says (task U1)',()=>{
    at('/rep/analytics','customer=wasatch&scope=all');
    renderShell();
    expect(within(portalNav()).getAllByRole('link').map(l=>l.getAttribute('href'))).toEqual(
      ['quotes','customers','orders','stock','analytics','teams','settings'].map(s=>`/rep/${s}`));
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe('Sign out (C_QOB9)',()=>{
  it('asks first, in the frame\'s words; Cancel keeps the session',()=>{
    renderShell();
    fireEvent.click(within(rail()).getByRole('button',{name:'Sign out'}));
    const dialog=screen.getByRole('dialog',{name:'Sign out of Querent?'});
    expect(dialog).toHaveTextContent('You are signed in as Brandi G., Manager at Herrick Industrial Supply.');
    expect(within(dialog).getAllByRole('button').map(b=>b.textContent)).toEqual(['Cancel','Sign out']);
    fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(requested()).not.toContain('/api/session');
    expect(leave).not.toHaveBeenCalled();
  });

  it('Escape closes it too',()=>{
    renderShell(mara);
    fireEvent.click(within(rail()).getByRole('button',{name:'Sign out'}));
    expect(screen.getByRole('dialog')).toHaveTextContent('You are signed in as Mara J., Rep at Herrick Industrial Supply.');
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Sign out clears the session (DELETE /api/session) and returns to /',async()=>{
    renderShell();
    fireEvent.click(within(rail()).getByRole('button',{name:'Sign out'}));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Sign out'}));
    await waitFor(()=>expect(leave).toHaveBeenCalledWith('/'));
    expect(fetchMock).toHaveBeenCalledWith('/api/session',{method:'DELETE'});
  });
});

describe('page header: caution and bell (C_QOB3, C_QOB4)',()=>{
  it('every page header shows its title, then the caution and the bell, labelled as the frames label them',()=>{
    renderShell();
    expect(screen.getByRole('heading',{level:1,name:'Quotes'})).toBeInTheDocument();
    expect(cautionButton()).toHaveAccessibleName('Needs attention, 2 items');
    expect(bellButton()).toHaveAccessibleName('Notifications');
    expect(cautionButton()).toHaveAttribute('aria-expanded','false');
  });

  it('the caution opens the Needs attention list without navigating: red first, a tag and one line each',()=>{
    renderShell();
    fireEvent.click(cautionButton());
    expect(cautionButton()).toHaveAccessibleName('Needs attention, open');
    expect(cautionButton()).toHaveAttribute('aria-expanded','true');
    const list=screen.getByRole('dialog',{name:'3 need your attention'});
    expect(list).toHaveTextContent('3 need your attention');
    const rows=within(list).getAllByRole('button');
    expect(rows.map(r=>r.textContent)).toEqual([
      'Q-24790OverdueDana Ortiz asked to move pickup to Ogden.',
      'Q-24812OverdueSent Sep 15, no reply yet.',
      'Q-24789AgingSent Sep 19, no reply yet.']);
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
    expect(leave).not.toHaveBeenCalled();
  });

  it('the bell opens the reader\'s notifications without navigating, each with when it happened; one dropdown at a time',()=>{
    renderShell();
    fireEvent.click(cautionButton());
    fireEvent.click(bellButton());
    expect(screen.queryByRole('dialog',{name:/need your attention/})).toBeNull();
    expect(bellButton()).toHaveAccessibleName('Notifications, open');
    const list=screen.getByRole('dialog',{name:'Notifications'});
    const [row,expired]=within(list).getAllByRole('button');
    expect(row).toHaveTextContent(/^Q-24817 requested by Dana OrtizSep 23, \d{1,2}:\d{2} (AM|PM)$/);
    // An expired quote prints its day only, as C_QOB4 does ("Q-24815 expired", "Sep 18").
    expect(expired).toHaveTextContent(/^Q-24815 expiredSep 18$/);
    expect(nav.push).not.toHaveBeenCalled();
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a row opens its quote (no frame: decision 50, listed in status.md) and closes the list',()=>{
    renderShell();
    fireEvent.click(bellButton());
    fireEvent.click(within(screen.getByRole('dialog',{name:'Notifications'})).getAllByRole('button')[0]!);
    expect(nav.push).toHaveBeenCalledWith('/rep/quotes/Q-24817');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(cautionButton());
    fireEvent.click(within(screen.getByRole('dialog',{name:'3 need your attention'})).getAllByRole('button')[2]!);
    expect(nav.push).toHaveBeenLastCalledWith('/rep/quotes/Q-24789');
  });

  it('empty lists say so in one plain line (no frame: decision 52)',()=>{
    renderShell(brandi,<Page/>,{quotes:0,attention:0,caution:[],bell:[]});
    expect(cautionButton()).toHaveAccessibleName('Needs attention, 0 items');
    fireEvent.click(cautionButton());
    expect(screen.getByRole('dialog',{name:'0 need your attention'})).toHaveTextContent(/^0 need your attention$/);
    fireEvent.click(bellButton());
    expect(screen.getByRole('dialog',{name:'Notifications'})).toHaveTextContent(/^NotificationsNo notifications$/);
  });

  it('shows the server\'s badges at once, then polls GET /api/rep/badges (no ?scope=: the server scopes by role)',async()=>{
    vi.useFakeTimers();
    try{
      at('/rep/quotes','scope=all');
      renderShell();
      expect(cautionButton()).toHaveAccessibleName('Needs attention, 2 items');
      served={...BADGES,attention:1,caution:[caution()]};
      await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
      expect(cautionButton()).toHaveAccessibleName('Needs attention, 1 item');
      expect(requested().filter(u=>u.startsWith('/api/rep/badges')).every(u=>u==='/api/rep/badges')).toBe(true);
    }finally{vi.useRealTimers();}
  });
});

describe('Settings in the shell',()=>{
  it('Settings opens Rep assignments by default, with every section as a tab; no tab carries ?customer=',()=>{
    at('/rep/settings','customer=great-basin');
    renderShell(brandi,<SettingsSection initial={settingsFixture('great-basin')}/>);
    expect(screen.getByRole('heading',{level:1,name:'Settings'})).toBeInTheDocument();
    expect(cautionButton()).toBeInTheDocument();
    const tabs=screen.getByRole('navigation',{name:'Settings sections'});
    // Brandi is the manager: Reps and Aging are hers alone (task D1).
    expect(within(tabs).getAllByRole('link').map(l=>l.textContent)).toEqual(['Rep assignments','Reps','Customer access','Margin floors','Pricing & delivery','Aging','Data sources']);
    expect(within(tabs).getByRole('link',{current:'page'})).toHaveTextContent('Rep assignments');
    expect(within(tabs).getByRole('link',{name:'Data sources'})).toHaveAttribute('href','/rep/settings?tab=sources');
    expect(screen.getByRole('combobox',{name:'Rep for Great Basin Fabrication'})).toHaveValue('brandi');
    expect(screen.queryByText('Data browser')).not.toBeInTheDocument();
  });

  it('a rep (not the manager) gets no Reps or Aging tab, and ?tab=aging opens Rep assignments (task D1)',()=>{
    at('/rep/settings','tab=aging');
    renderShell(mara,<SettingsSection initial={settingsFixture(null,{manager:false})}/>);
    const tabs=screen.getByRole('navigation',{name:'Settings sections'});
    expect(within(tabs).getAllByRole('link').map(l=>l.textContent)).toEqual(['Rep assignments','Customer access','Margin floors','Pricing & delivery','Data sources']);
    expect(within(tabs).getByRole('link',{current:'page'})).toHaveTextContent('Rep assignments');
    expect(screen.queryByRole('heading',{name:'Aging thresholds'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Reps'})).not.toBeInTheDocument();
  });

  it('the manager opens Aging and Reps from their tabs (task D1)',()=>{
    at('/rep/settings','tab=aging');
    const {unmount}=renderShell(brandi,<SettingsSection initial={settingsFixture()}/>);
    expect(screen.getByRole('heading',{name:'Aging thresholds'})).toBeInTheDocument();
    unmount();
    at('/rep/settings','tab=reps');
    renderShell(brandi,<SettingsSection initial={settingsFixture()}/>);
    expect(screen.getByRole('heading',{name:'Reps'})).toBeInTheDocument();
  });

  it('Settings > Customer access picks its customer on the page (?customer= is the page\'s own filter)',()=>{
    at('/rep/settings','tab=access&customer=wasatch');
    renderShell(brandi,<SettingsSection initial={settingsFixture('wasatch')}/>);
    const picker=screen.getByRole('combobox',{name:'Customer'});
    expect(picker).toHaveValue('wasatch');
    expect(within(picker).getAllByRole('option').map(o=>o.textContent)).toEqual(['All customers','Canyon Ridge Builders','Great Basin Fabrication','Uinta Facility Services','Wasatch Mechanical Contractors']);
    expect(screen.getByText(/What Querent answers in chat for Wasatch Mechanical Contractors/)).toBeInTheDocument();
    expect(screen.getByRole('switch',{name:'Pricing'})).toBeChecked();
    fireEvent.change(picker,{target:{value:'great-basin'}});
    expect(nav.replace).toHaveBeenLastCalledWith('/rep/settings?tab=access&customer=great-basin',{scroll:false});
    fireEvent.change(picker,{target:{value:''}});
    expect(nav.replace).toHaveBeenLastCalledWith('/rep/settings?tab=access',{scroll:false});
  });
});
