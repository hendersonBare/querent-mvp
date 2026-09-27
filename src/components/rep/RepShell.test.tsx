import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {CustomerListItem} from '@/domain';

// The rep portal frame (task 3.1): nav, the "Viewing" picker in ?customer=, the Quotes badge.

const nav=vi.hoisted(()=>({pathname:'/rep/quotes',query:'',replace:vi.fn()}));
vi.mock('next/navigation',()=>({
  usePathname:()=>nav.pathname,
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:nav.replace,push:vi.fn(),refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('./RepShell');
const {SectionPlaceholder}=await import('./RepPage');
const {SettingsSection}=await import('./SettingsSection');
const {settingsFixture}=await import('./settings/test-fixtures');

const customers:CustomerListItem[]=[
  {id:'canyon-ridge',name:'Canyon Ridge Builders',account_number:'CRB-3318',rep_id:'mara',rep_name:'Mara Jensen'},
  {id:'great-basin',name:'Great Basin Fabrication',account_number:'GBF-2207',rep_id:'brandi',rep_name:'Brandi Gallegos'},
  {id:'wasatch',name:'Wasatch Mechanical Contractors',account_number:'WAS-1142',rep_id:'brandi',rep_name:'Brandi Gallegos'},
];
const brandi={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'};
const dashboard={access:[{category:'pricing',enabled:true,rep_id:'brandi',mixed_rep:false,rep_name:'Brandi Gallegos',phone:null,email:null}],
  analytics:{total_queries:7,minutes_saved:60,hours_saved:'1.0',categories:[]}};

let badgeCount=1;
const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url==='/api/rep/badges')return Response.json({quotes:badgeCount});
  if(url==='/api/session'&&init?.method==='DELETE')return Response.json({ok:true});
  if(url.startsWith('/api/query/supplier/dashboard/'))return Response.json(dashboard);
  if(url==='/api/query/erp/status')return Response.json({last_updated:null,events:[]});
  return Response.json({detail:'Not found.'},{status:404});
});

function renderShell(children:ReactNode=<SectionPlaceholder title="Quotes" showUnreadQuotes heading="Your quotes will be listed here" body="Soon."/>,initialBadges={quotes:1}){
  return render(<RepShell rep={brandi} org="Herrick Industrial Supply" customers={customers} initialBadges={initialBadges}>{children}</RepShell>);
}
const at=(pathname:string,query='')=>{nav.pathname=pathname;nav.query=query;};
const portalNav=()=>screen.getByRole('navigation',{name:'Rep portal'});
const requested=()=>fetchMock.mock.calls.map(([url])=>String(url));

beforeEach(()=>{at('/rep/quotes');nav.replace.mockClear();fetchMock.mockClear();badgeCount=1;vi.stubGlobal('fetch',fetchMock);});
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
    expect(screen.getByText(/Viewing All customers · 3 unread quotes/)).toBeInTheDocument();
    expect(requested()).toContain('/api/rep/badges');
  });

  it('hides the count when nothing is unread',async()=>{
    badgeCount=0;
    renderShell(undefined,{quotes:0});
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

describe('"Viewing" customer picker',()=>{
  it('lists All customers then every customer, and starts on All customers',()=>{
    renderShell();
    const picker=screen.getByLabelText('Viewing');
    expect(within(picker).getAllByRole('option').map(o=>o.textContent)).toEqual(['All customers','Canyon Ridge Builders','Great Basin Fabrication','Wasatch Mechanical Contractors']);
    expect(picker).toHaveValue('all');
  });

  it('reads ?customer=, shows the account and rep, and keeps it on every nav link and the bell',()=>{
    at('/rep/analytics','customer=wasatch');
    renderShell();
    expect(screen.getByLabelText('Viewing')).toHaveValue('wasatch');
    expect(screen.getByText('WAS-1142')).toBeInTheDocument();
    expect(screen.getByRole('banner')).toHaveTextContent('Rep Brandi Gallegos');
    expect(within(portalNav()).getAllByRole('link').map(l=>l.getAttribute('href'))).toEqual(
      ['quotes','customers','orders','items','analytics','settings'].map(s=>`/rep/${s}?customer=wasatch`));
    expect(screen.getByRole('link',{name:/Notifications/})).toHaveAttribute('href','/rep/quotes?customer=wasatch');
    expect(screen.getByText(/Viewing Wasatch Mechanical Contractors/)).toBeInTheDocument();
  });

  it('changes the scope in the URL, keeping the page and its other params',()=>{
    at('/rep/settings','tab=access');
    renderShell();
    fireEvent.change(screen.getByLabelText('Viewing'),{target:{value:'great-basin'}});
    expect(nav.replace).toHaveBeenLastCalledWith('/rep/settings?tab=access&customer=great-basin',{scroll:false});
  });

  it('goes back to All customers by dropping ?customer=',()=>{
    at('/rep/items','customer=wasatch');
    renderShell();
    fireEvent.change(screen.getByLabelText('Viewing'),{target:{value:'all'}});
    expect(nav.replace).toHaveBeenLastCalledWith('/rep/items',{scroll:false});
  });

  it('treats an unknown customer as All customers and drops it from the URL',()=>{
    at('/rep/orders','customer=nobody');
    renderShell();
    expect(screen.getByLabelText('Viewing')).toHaveValue('all');
    expect(nav.replace).toHaveBeenCalledWith('/rep/orders',{scroll:false});
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

// Analytics follows the picker too: src/components/rep/analytics/AnalyticsPage.test.tsx (task 6.2).
describe('sections follow the picker',()=>{
  it('Settings opens Rep assignments by default, with every section as a tab that keeps the picker',()=>{
    at('/rep/settings','customer=great-basin');
    renderShell(<SettingsSection initial={settingsFixture('great-basin')}/>);
    const tabs=screen.getByRole('navigation',{name:'Settings sections'});
    expect(within(tabs).getAllByRole('link').map(l=>l.textContent)).toEqual(['Rep assignments','Customer access','Margin floors','Pricing & delivery','Data sources']);
    expect(within(tabs).getByRole('link',{current:'page'})).toHaveTextContent('Rep assignments');
    expect(within(tabs).getByRole('link',{name:'Data sources'})).toHaveAttribute('href','/rep/settings?tab=sources&customer=great-basin');
    expect(screen.getByRole('combobox',{name:'Rep for Great Basin Fabrication'})).toHaveValue('brandi');
    expect(screen.queryByText('Data browser')).not.toBeInTheDocument();
  });

  it('Settings > Customer access is for the picked customer',()=>{
    at('/rep/settings','tab=access&customer=wasatch');
    renderShell(<SettingsSection initial={settingsFixture('wasatch')}/>);
    expect(screen.getByText('Viewing Wasatch Mechanical Contractors',{selector:'p'})).toBeInTheDocument();
    expect(screen.getByRole('switch',{name:'Pricing'})).toBeChecked();
  });
});
