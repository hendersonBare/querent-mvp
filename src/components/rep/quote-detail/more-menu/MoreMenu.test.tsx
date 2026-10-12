import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {CUSTOMERS} from '../../quotes/test-fixtures';

// The quote detail's ⋯ menu (task 3.5; spec §4, screen 06 without Reassign): Duplicate quote,
// Open customer in ERP (disabled, with its tooltip) and, on the sample only, Reset sample quote.
// fetch is a fake of the two rep routes; navigation and the page reload are spies.

const nav=vi.hoisted(()=>({query:'customer=wasatch',push:vi.fn()}));
vi.mock('next/navigation',()=>({
  usePathname:()=>'/rep/quotes/Q-24817',
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:vi.fn(),push:nav.push,refresh:vi.fn(),prefetch:vi.fn()}),
}));
const reload=vi.hoisted(()=>({reloadPage:vi.fn()}));
vi.mock('./reload',()=>reload);

const {RepShell}=await import('../../RepShell');
const {MoreMenu,ERP_TOOLTIP}=await import('./MoreMenu');
const {setQuoteFlash}=await import('./flash');

const SAMPLE={id:'q-24817',quote_number:'Q-24817',is_sample:true};
const COPY={id:'q-24830',quote_number:'Q-24830',duplicated_from:{id:'q-24817',quote_number:'Q-24817'},replayed:false};

type Answer=Response|Promise<Response>|(()=>Response|Promise<Response>);
let answers:Record<string,Answer>;
const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url==='/api/rep/badges')return Response.json({quotes:1});
  const answer=answers[`${init?.method??'GET'} ${url}`];
  if(!answer)return Response.json({detail:'Not found.'},{status:404});
  return typeof answer==='function'?answer():answer;
});
const posts=(path:string)=>fetchMock.mock.calls.filter(([url,init])=>String(url)===path&&init?.method==='POST');

beforeEach(()=>{
  answers={
    'POST /api/rep/quotes/q-24817/duplicate':()=>Response.json(COPY,{status:201}),
    'POST /api/rep/quotes/q-24817/reset':()=>Response.json({quote:{id:'q-24817'}}),
  };
  fetchMock.mockClear();nav.push.mockClear();reload.reloadPage.mockClear();nav.query='customer=wasatch';
  sessionStorage.clear();
  vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

function renderMenu(quote=SAMPLE,flush=vi.fn(async()=>{})){
  render(<RepShell rep={{id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'}} org="Herrick Industrial Supply"
    initialBadges={{quotes:1,attention:0}}><MoreMenu quote={quote} flush={flush}/></RepShell>);
  return {flush};
}
const openMenu=()=>{fireEvent.click(screen.getByRole('button',{name:'More actions'}));return screen.getByRole('menu',{name:'More actions'});};
const item=(name:string|RegExp)=>screen.getByRole('menuitem',{name});

describe('the items (screen 06, without Reassign)',()=>{
  it('lists Duplicate quote, Open customer in ERP and, after a divider, Reset sample quote on the sample',()=>{
    renderMenu();
    const menu=openMenu();
    expect(within(menu).getAllByRole('menuitem').map(i=>i.textContent)).toEqual(['Duplicate quote','Open customer in ERP','Reset sample quote']);
    expect(within(menu).queryByText(/Reassign/)).toBeNull();
    const divider=within(menu).getByRole('separator');
    expect(divider.nextElementSibling).toContainElement(item('Reset sample quote'));
    // Focus starts on the first item.
    expect(item('Duplicate quote')).toHaveFocus();
  });

  it('shows no Reset on any other quote',()=>{
    renderMenu({id:'q-24830',quote_number:'Q-24830',is_sample:false});
    const menu=openMenu();
    expect(within(menu).getAllByRole('menuitem').map(i=>i.textContent)).toEqual(['Duplicate quote','Open customer in ERP']);
    expect(within(menu).queryByRole('separator')).toBeNull();
  });

  it('shows Open customer in ERP disabled, with its tooltip as the description; choosing it does nothing but show why',()=>{
    renderMenu();
    openMenu();
    const erp=item('Open customer in ERP');
    expect(erp).toHaveAttribute('aria-disabled','true');
    expect(ERP_TOOLTIP).toBe('Available after ERP integration');
    expect(erp).toHaveAccessibleDescription('Available after ERP integration');
    expect(screen.getByRole('tooltip',{hidden:true})).toHaveTextContent('Available after ERP integration');
    fireEvent.click(erp);
    // A tap shows the tooltip (touch screens have no hover), and the menu stays open.
    expect(erp.parentElement).toHaveAttribute('data-open');
    expect(screen.getByRole('menu',{name:'More actions'})).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(0);
  });

  it('lets the arrow keys reach the disabled ERP item, so its tooltip can be read',()=>{
    renderMenu();
    const menu=openMenu();
    fireEvent.keyDown(menu,{key:'ArrowDown'});
    expect(item('Open customer in ERP')).toHaveFocus();
    fireEvent.keyDown(menu,{key:'ArrowDown'});
    expect(item('Reset sample quote')).toHaveFocus();
    fireEvent.keyDown(menu,{key:'ArrowDown'});
    expect(item('Duplicate quote')).toHaveFocus();
    fireEvent.keyDown(menu,{key:'ArrowUp'});
    expect(item('Reset sample quote')).toHaveFocus();
  });
});

describe('Duplicate quote',()=>{
  it('saves pending edits first, posts once with an Idempotency-Key, then opens the copy (no ?customer= carried, task U1)',async()=>{
    const order:string[]=[];
    const flush=vi.fn(async()=>{order.push('flush');});
    answers['POST /api/rep/quotes/q-24817/duplicate']=()=>{order.push('duplicate');return Response.json(COPY,{status:201});};
    renderMenu(SAMPLE,flush);
    openMenu();
    fireEvent.click(item('Duplicate quote'));
    await waitFor(()=>expect(nav.push).toHaveBeenCalledWith('/rep/quotes/Q-24830'));
    expect(order).toEqual(['flush','duplicate']);
    const [[,init]]=posts('/api/rep/quotes/q-24817/duplicate');
    expect(new Headers(init!.headers).get('idempotency-key')).toMatch(/^[\w.:-]{8,128}$/);
    expect(screen.getByText('Duplicating Q-24817…').closest('[role="status"]')).not.toBeNull();
  });

  it('keeps All customers when no customer is picked',async()=>{
    nav.query='';
    renderMenu();
    openMenu();
    fireEvent.click(item('Duplicate quote'));
    await waitFor(()=>expect(nav.push).toHaveBeenCalledWith('/rep/quotes/Q-24830'));
  });

  it('makes one request for a double choice: the item is busy until the copy opens',async()=>{
    let answer!:(response:Response)=>void;
    answers['POST /api/rep/quotes/q-24817/duplicate']=()=>new Promise<Response>(resolve=>{answer=resolve;});
    renderMenu();
    openMenu();
    fireEvent.click(item('Duplicate quote'));
    await waitFor(()=>expect(posts('/api/rep/quotes/q-24817/duplicate')).toHaveLength(1));
    openMenu();
    const busy=item('Duplicating…');
    expect(busy).toHaveAttribute('aria-disabled','true');
    fireEvent.click(busy);
    expect(posts('/api/rep/quotes/q-24817/duplicate')).toHaveLength(1);
    await act(async()=>{answer(Response.json(COPY,{status:201}));});
    await waitFor(()=>expect(nav.push).toHaveBeenCalledTimes(1));
  });

  it('retries a lost answer with the same key, so the server can’t make a second copy',async()=>{
    let calls=0;
    answers['POST /api/rep/quotes/q-24817/duplicate']=()=>{calls++;if(calls===1)throw new TypeError('Failed to fetch');return Response.json({...COPY,replayed:true},{status:201});};
    renderMenu();
    openMenu();
    fireEvent.click(item('Duplicate quote'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Q-24817 wasn’t duplicated. Check your connection and try again.');
    expect(nav.push).not.toHaveBeenCalled();
    openMenu();
    fireEvent.click(item('Duplicate quote'));
    await waitFor(()=>expect(nav.push).toHaveBeenCalledWith('/rep/quotes/Q-24830'));
    const keys=posts('/api/rep/quotes/q-24817/duplicate').map(([,init])=>new Headers(init!.headers).get('idempotency-key'));
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });

  it('shows the server’s reason when it refuses, and a later try uses a new key',async()=>{
    answers['POST /api/rep/quotes/q-24817/duplicate']=()=>Response.json({detail:'Wasatch Mechanical Contractors is now Mara Jensen’s customer, so a copy of Q-24817 would be their quote. Ask Mara to duplicate it.',code:'conflict'},{status:409});
    renderMenu();
    openMenu();
    fireEvent.click(item('Duplicate quote'));
    const alert=await screen.findByRole('alert');
    expect(alert).toHaveTextContent('is now Mara Jensen’s customer');
    fireEvent.click(within(alert).getByRole('button',{name:'Dismiss'}));
    expect(screen.queryByRole('alert')).toBeNull();
    openMenu();
    fireEvent.click(item('Duplicate quote'));
    await waitFor(()=>expect(posts('/api/rep/quotes/q-24817/duplicate')).toHaveLength(2));
    const keys=posts('/api/rep/quotes/q-24817/duplicate').map(([,init])=>new Headers(init!.headers).get('idempotency-key'));
    expect(keys[1]).not.toBe(keys[0]);
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('says on the copy’s page what was duplicated (a one-time note carried across the navigation)',async()=>{
    renderMenu();
    openMenu();
    fireEvent.click(item('Duplicate quote'));
    await waitFor(()=>expect(nav.push).toHaveBeenCalled());
    // The copy's page mounts its own menu, which shows the note once.
    render(<RepShell rep={{id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'}} org="Herrick Industrial Supply"
      initialBadges={{quotes:1,attention:0}}><MoreMenu quote={{id:'q-24830',quote_number:'Q-24830',is_sample:false}} flush={async()=>{}}/></RepShell>);
    expect(await screen.findByText('Duplicated Q-24817 as Q-24830')).toBeInTheDocument();
    expect(sessionStorage.length).toBe(0);
  });
});

describe('Reset sample quote',()=>{
  it('saves pending edits, resets on the server, then reloads the page so every panel shows the seed state',async()=>{
    const order:string[]=[];
    const flush=vi.fn(async()=>{order.push('flush');});
    answers['POST /api/rep/quotes/q-24817/reset']=()=>{order.push('reset');return Response.json({quote:{id:'q-24817'}});};
    renderMenu(SAMPLE,flush);
    openMenu();
    fireEvent.click(item('Reset sample quote'));
    await waitFor(()=>expect(reload.reloadPage).toHaveBeenCalledTimes(1));
    expect(order).toEqual(['flush','reset']);
    expect(screen.getByText('Resetting the sample quote…').closest('[role="status"]')).not.toBeNull();
  });

  it('shows “Sample quote reset” once the page is back (mockup toast), then hides it',async()=>{
    vi.useFakeTimers({shouldAdvanceTime:true});
    setQuoteFlash('q-24817','Sample quote reset');
    renderMenu();
    expect(await screen.findByText('Sample quote reset')).toBeInTheDocument();
    await act(async()=>{vi.advanceTimersByTime(3300);});
    expect(screen.queryByText('Sample quote reset')).toBeNull();
  });

  it('leaves the page as it is and says why when the reset is refused',async()=>{
    answers['POST /api/rep/quotes/q-24817/reset']=()=>Response.json({detail:'Only the sample quote can be reset. Q-24817 isn’t sample data.',code:'illegal_transition'},{status:409});
    renderMenu();
    openMenu();
    fireEvent.click(item('Reset sample quote'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the sample quote can be reset.');
    expect(reload.reloadPage).not.toHaveBeenCalled();
    openMenu();
    expect(item('Reset sample quote')).not.toHaveAttribute('aria-disabled');
  });

  it('ignores a note meant for another quote',()=>{
    setQuoteFlash('q-99999','Duplicated Q-1 as Q-2');
    renderMenu();
    expect(screen.queryByText('Duplicated Q-1 as Q-2')).toBeNull();
  });
});
