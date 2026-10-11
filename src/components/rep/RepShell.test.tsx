import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

// The rep portal frame (task 3.1): nav and the Quotes badge. Scope is role based on the server
// (task U1): there is no "Viewing" picker, and no nav link carries ?customer= or ?scope=.

const nav=vi.hoisted(()=>({pathname:'/rep/quotes',query:'',replace:vi.fn()}));
vi.mock('next/navigation',()=>({
  usePathname:()=>nav.pathname,
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:nav.replace,push:vi.fn(),refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('./RepShell');
const {RepPageHeader}=await import('./RepPage');
const {useRepPortal}=await import('./context');

/** A page in the shell that shows what the shell gives it: the unread quotes. */
function ScopedPage(){
  const {badges}=useRepPortal();
  return <RepPageHeader title="Quotes" description={<>{badges.quotes>0&&<>{badges.quotes} unread {badges.quotes===1?'quote':'quotes'}</>}</>}/>;
}
const {SettingsSection}=await import('./SettingsSection');
const {settingsFixture}=await import('./settings/test-fixtures');

const brandi={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'};

let badgeCount=1,attentionCount=0;
const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url==='/api/rep/badges')return Response.json({quotes:badgeCount,attention:attentionCount});
  if(url==='/api/session'&&init?.method==='DELETE')return Response.json({ok:true});
  if(url==='/api/query/erp/status')return Response.json({last_updated:null,events:[]});
  return Response.json({detail:'Not found.'},{status:404});
});

function renderShell(children:ReactNode=<ScopedPage/>,initialBadges={quotes:1,attention:0}){
  return render(<RepShell rep={brandi} org="Herrick Industrial Supply" initialBadges={initialBadges}>{children}</RepShell>);
}
const at=(pathname:string,query='')=>{nav.pathname=pathname;nav.query=query;};
const portalNav=()=>screen.getByRole('navigation',{name:'Rep portal'});
const requested=()=>fetchMock.mock.calls.map(([url])=>String(url));

beforeEach(()=>{at('/rep/quotes');nav.replace.mockClear();fetchMock.mockClear();badgeCount=1;attentionCount=0;vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>vi.unstubAllGlobals());

describe('header',()=>{
  it('shows Querent, Herrick, the six sections in order, search, the bell and BG (mockup 03)',()=>{
    renderShell();
    const banner=screen.getByRole('banner');
    expect(banner).toHaveTextContent('Querent');
    expect(banner).toHaveTextContent('Herrick Industrial Supply');
    const links=within(portalNav()).getAllByRole('link');
    expect(links.map(l=>l.textContent)).toEqual(['Quotes1 unread','Customers','Orders','Items','Analytics','Settings']);
    expect(links.map(l=>l.getAttribute('href'))).toEqual(['/rep/quotes','/rep/customers','/rep/orders','/rep/items','/rep/analytics','/rep/settings']);
    expect(screen.getByRole('searchbox',{name:'Search the portal'})).toHaveAttribute('placeholder','Search quotes, customers, SKUs');
    expect(screen.getByRole('button',{name:'Account: Brandi Gallegos'})).toHaveTextContent('BG');
  });

  it('gives the manager a Team section after Analytics, current on /rep/team; a rep never sees it (v3 spec §6, task D3)',()=>{
    at('/rep/team');
    const {unmount}=render(<RepShell rep={{...brandi,manager:true}} org="Herrick Industrial Supply" initialBadges={{quotes:0,attention:0}}><ScopedPage/></RepShell>);
    const links=within(portalNav()).getAllByRole('link');
    expect(links.map(l=>l.textContent)).toEqual(['Quotes','Customers','Orders','Items','Analytics','Team','Settings']);
    expect(within(portalNav()).getByRole('link',{name:'Team'})).toHaveAttribute('href','/rep/team');
    expect(within(portalNav()).getByRole('link',{name:'Team'})).toHaveAttribute('aria-current','page');
    unmount();
    renderShell();
    expect(within(portalNav()).queryByRole('link',{name:'Team'})).toBeNull();
  });

  it('marks the current section, including its sub-pages',()=>{
    at('/rep/quotes/Q-24817');
    renderShell();
    expect(within(portalNav()).getByRole('link',{current:'page'})).toHaveTextContent(/^Quotes/);
  });

  it('explains that search is not built yet when Enter is pressed',()=>{
    renderShell();
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByRole('status')).toHaveTextContent('Search isn’t available yet in this demo.');
  });
});

describe('Quotes unread badge',()=>{
  it('shows the server count at once, then the polled count',async()=>{
    badgeCount=3;
    renderShell();
    expect(within(portalNav()).getByRole('link',{name:'Quotes 1 unread'})).toBeInTheDocument();
    expect(await within(portalNav()).findByRole('link',{name:'Quotes 3 unread'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Notifications: 3 unread quotes'})).toHaveAttribute('href','/rep/quotes');
    expect(screen.getByText('3 unread quotes')).toBeInTheDocument();
    expect(requested()).toContain('/api/rep/badges');
  });

  it('hides the count when nothing is unread',async()=>{
    badgeCount=0;
    renderShell(undefined,{quotes:0,attention:0});
    await waitFor(()=>expect(requested()).toContain('/api/rep/badges'));
    expect(within(portalNav()).getByRole('link',{name:'Quotes'})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:'Notifications: none unread'})).toBeInTheDocument();
  });

  it('re-reads the badge on the poll interval',async()=>{
    vi.useFakeTimers();
    try{
      renderShell();
      await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
      badgeCount=2;
      await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
      expect(within(portalNav()).getByRole('link',{name:'Quotes 2 unread'})).toBeInTheDocument();
    }finally{vi.useRealTimers();}
  });
});

describe('Needs attention badge (v3 spec §3, §6; task A2)',()=>{
  const badge=()=>screen.queryByRole('link',{name:/^Needs attention/});
  it('counts red quotes only, beside the unread badge (OA-8), and opens the Needs attention filter without carrying ?customer=',async()=>{
    attentionCount=2;
    at('/rep/analytics','customer=wasatch');
    renderShell(undefined,{quotes:1,attention:2});
    expect(badge()).toHaveAccessibleName('Needs attention: 2 overdue quotes');
    expect(badge()).toHaveTextContent('2');
    expect(badge()).toHaveTextContent('Needs attention');
    expect(badge()).toHaveAttribute('href','/rep/quotes?attention=1');
    expect(badge()!.querySelector('svg')).not.toBeNull();
    expect(within(portalNav()).getByRole('link',{name:'Quotes 1 unread'})).toBeInTheDocument();
  });

  it('is hidden when nothing is overdue, and follows the poll',async()=>{
    vi.useFakeTimers();
    try{
      renderShell();
      await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
      expect(badge()).toBeNull();
      attentionCount=1;
      await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
      expect(badge()).toHaveAccessibleName('Needs attention: 1 overdue quote');
    }finally{vi.useRealTimers();}
  });
});

describe('no "Viewing" picker and no All reps scope (task U1)',()=>{
  it('has no customer picker',()=>{
    renderShell();
    expect(screen.queryByLabelText('Viewing')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('keeps no ?customer= or ?scope= on any nav link or the bell, whatever the page’s own URL says',()=>{
    at('/rep/analytics','customer=wasatch&scope=all');
    render(<RepShell rep={{...brandi,manager:true}} org="Herrick Industrial Supply" initialBadges={{quotes:1,attention:0}}><ScopedPage/></RepShell>);
    expect(within(portalNav()).getAllByRole('link').map(l=>l.getAttribute('href'))).toEqual(
      ['quotes','customers','orders','items','analytics','team','settings'].map(s=>`/rep/${s}`));
    expect(screen.getByRole('link',{name:/Notifications/})).toHaveAttribute('href','/rep/quotes');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('reads the badges without ?scope=, for the manager too: the server scopes them by role',async()=>{
    at('/rep/quotes','scope=all');
    render(<RepShell rep={{...brandi,manager:true}} org="Herrick Industrial Supply" initialBadges={{quotes:1,attention:0}}><ScopedPage/></RepShell>);
    await waitFor(()=>expect(requested()).toContain('/api/rep/badges'));
    expect(requested().filter(u=>u.startsWith('/api/rep/badges'))).toEqual(requested().filter(u=>u==='/api/rep/badges'));
  });
});

describe('account menu',()=>{
  it('opens from BG, closes on Escape, and switches workspace',async()=>{
    renderShell();
    const avatar=screen.getByRole('button',{name:'Account: Brandi Gallegos'});
    fireEvent.click(avatar);
    expect(avatar).toHaveAttribute('aria-expanded','true');
    const menu=screen.getByRole('menu',{name:'Account'});
    expect(menu).toHaveTextContent('Brandi Gallegos');
    expect(menu).toHaveTextContent('Inside Sales · Herrick Industrial Supply');
    expect(within(menu).getByRole('menuitem',{name:'Switch workspace'})).toHaveFocus();
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(avatar).toHaveFocus();
    fireEvent.click(avatar);
    fireEvent.click(screen.getByRole('menuitem',{name:'Switch workspace'}));
    await waitFor(()=>expect(fetchMock).toHaveBeenCalledWith('/api/session',{method:'DELETE'}));
  });
});

describe('Settings in the shell',()=>{
  it('Settings opens Rep assignments by default, with every section as a tab; no tab carries ?customer=',()=>{
    at('/rep/settings','customer=great-basin');
    renderShell(<SettingsSection initial={settingsFixture('great-basin')}/>);
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
    renderShell(<SettingsSection initial={settingsFixture(null,{manager:false})}/>);
    const tabs=screen.getByRole('navigation',{name:'Settings sections'});
    expect(within(tabs).getAllByRole('link').map(l=>l.textContent)).toEqual(['Rep assignments','Customer access','Margin floors','Pricing & delivery','Data sources']);
    expect(within(tabs).getByRole('link',{current:'page'})).toHaveTextContent('Rep assignments');
    expect(screen.queryByRole('heading',{name:'Aging thresholds'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Reps'})).not.toBeInTheDocument();
  });

  it('the manager opens Aging and Reps from their tabs (task D1)',()=>{
    at('/rep/settings','tab=aging');
    const {unmount}=renderShell(<SettingsSection initial={settingsFixture()}/>);
    expect(screen.getByRole('heading',{name:'Aging thresholds'})).toBeInTheDocument();
    unmount();
    at('/rep/settings','tab=reps');
    renderShell(<SettingsSection initial={settingsFixture()}/>);
    expect(screen.getByRole('heading',{name:'Reps'})).toBeInTheDocument();
  });

  it('Settings > Customer access picks its customer on the page (?customer= is the page’s own filter)',()=>{
    at('/rep/settings','tab=access&customer=wasatch');
    renderShell(<SettingsSection initial={settingsFixture('wasatch')}/>);
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
