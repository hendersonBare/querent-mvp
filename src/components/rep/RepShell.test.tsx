import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {BadgeSummary,RepBadges} from '@/server/rep/badges';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import dropdownClasses from '@/components/ui/Dropdown.module.css';

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
const {settingsFixture,table}=await import('./settings/test-fixtures');

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

  it('a title too long for the panel stays on one line, ends with an ellipsis, and carries the full text as its tooltip (decision 60)',()=>{
    // Vitest leaves CSS modules unapplied; put the dropdown's own stylesheet in the page under its module class names.
    const sheet=document.createElement('style');
    sheet.textContent=readFileSync(path.resolve('src/components/ui/Dropdown.module.css'),'utf8')
      .replace(/\.([A-Za-z][\w-]*)/g,(m,name:string)=>`.${(dropdownClasses as Record<string,string>)[name]??name}`);
    document.head.append(sheet);
    try{
      const accepted='Q-24822 accepted by Wasatch Mechanical Contractors';
      const flagged='Q-24790 for Wasatch Mechanical Contractors, Salt Lake City';
      renderShell(brandi,<Page/>,{...BADGES,caution:[caution({label:flagged})],bell:[bellItem({label:accepted})]});
      const oneLine=(dialog:string,text:string)=>{
        const title=within(screen.getByRole('dialog',{name:dialog})).getByText(text);
        expect(title).toHaveAttribute('title',text);
        const cs=getComputedStyle(title);
        expect([cs.whiteSpace,cs.overflow,cs.textOverflow,cs.minWidth]).toEqual(['nowrap','hidden','ellipsis',expect.stringMatching(/^0(px)?$/)]);
        expect(getComputedStyle(title.parentElement!).display).toBe('flex');
      };
      fireEvent.click(bellButton());
      oneLine('Notifications',accepted);
      fireEvent.click(cautionButton());
      oneLine('1 needs your attention',flagged);
    }finally{sheet.remove();}
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
  it('Settings opens Customer access by default, with the manager\'s four tabs (plan U8: no Data sources; Rep assignments and Reps moved to Teams and Reps, plan U7); no tab carries ?customer=',()=>{
    at('/rep/settings','customer=great-basin');
    renderShell(brandi,<SettingsSection initial={settingsFixture()}/>);
    expect(screen.getByRole('heading',{level:1,name:'Settings'})).toBeInTheDocument();
    expect(cautionButton()).toBeInTheDocument();
    const tabs=screen.getByRole('navigation',{name:'Settings sections'});
    expect(within(tabs).getAllByRole('link').map(l=>[l.textContent,l.getAttribute('href')])).toEqual([
      ['Customer access','/rep/settings?tab=access'],['Margin floors','/rep/settings?tab=floors'],['Pricing and delivery','/rep/settings?tab=pricing'],['Aging','/rep/settings?tab=aging'],
    ]);
    expect(within(tabs).getByRole('link',{current:'page'})).toHaveTextContent('Customer access');
    expect(screen.queryByText('Data sources')).not.toBeInTheDocument();
    expect(screen.queryByText('Data browser')).not.toBeInTheDocument();
  });

  it('a rep (not the manager) gets their own tabs, Margins first, whatever ?tab= says (plans U8, U9)',()=>{
    for(const tab of ['aging','reps','assignments','access','pricing','floors']){
      at('/rep/settings',`tab=${tab}`);
      const {unmount}=renderShell(mara,<SettingsSection initial={settingsFixture({manager:false})}/>);
      const tabs=screen.getByRole('navigation',{name:'Settings sections'});
      expect(within(tabs).getAllByRole('link').map(l=>l.textContent)).toEqual(['Margins','Profile','Notifications']);
      expect(within(tabs).getByRole('link',{current:'page'})).toHaveTextContent('Margins');
      expect(screen.queryByRole('heading',{name:'Aging thresholds'})).not.toBeInTheDocument();
      expect(screen.queryByRole('heading',{name:'Customer access'})).not.toBeInTheDocument();
      unmount();
    }
  });

  it('the manager opens Aging from its tab (task D1); the old Reps tab is gone',()=>{
    at('/rep/settings','tab=aging');
    const {unmount}=renderShell(brandi,<SettingsSection initial={settingsFixture()}/>);
    expect(screen.getByRole('heading',{name:'Aging thresholds'})).toBeInTheDocument();
    unmount();
    at('/rep/settings','tab=reps');
    renderShell(brandi,<SettingsSection initial={settingsFixture()}/>);
    expect(screen.queryByRole('heading',{name:'Reps'})).not.toBeInTheDocument();
    expect(within(screen.getByRole('navigation',{name:'Settings sections'})).getByRole('link',{current:'page'})).toHaveTextContent('Customer access');
  });

  it('Settings > Customer access opened for one customer (?customer=) shows that customer\'s switches, searched for its name',()=>{
    at('/rep/settings','tab=access&customer=wasatch');
    renderShell(brandi,<SettingsSection initial={settingsFixture({accessTable:table('Wasatch Mechanical Contractors',['wasatch'])})}/>);
    expect(screen.getByRole('searchbox',{name:'Search customers'})).toHaveValue('Wasatch Mechanical Contractors');
    expect(screen.getByRole('switch',{name:'Pricing for Wasatch Mechanical Contractors'})).toBeChecked();
    expect(screen.getByText('1 of 6 customers')).toBeInTheDocument();
  });
});
