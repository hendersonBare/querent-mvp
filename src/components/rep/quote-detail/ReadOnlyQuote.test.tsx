import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {CUSTOMERS} from '../quotes/test-fixtures';
import {sampleDetail} from './test-fixtures';

// The manager on another rep's quote (v3 spec §6 Quote detail; decision 22; task D2): a banner
// "Read only: Mara Jensen’s quote. Reassign it to edit." with Reassign (to herself or another active
// rep), every edit control disabled, and the quote not marked read for Mara. On her own quote the
// manager gets "Reassign to another rep" in the ⋯ menu (the mockup's item, screen 06). A rep gets neither.

const router=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock('next/navigation',()=>({
  usePathname:()=>'/rep/quotes/Q-24817',
  useSearchParams:()=>new URLSearchParams(''),
  useRouter:()=>({replace:vi.fn(),push:vi.fn(),refresh:router.refresh,prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_p,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('../RepShell');
const {QuoteDetailView}=await import('./QuoteDetailView');

const brandi={id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales',manager:true};
const REASSIGN={me:'brandi',targets:[{id:'brandi',name:'Brandi Gallegos'},{id:'eli',name:'Eli Porter'},{id:'mara',name:'Mara Jensen'}]};
const marasDraft=()=>sampleDetail({editable:false,read_only:{rep_id:'mara',rep_name:'Mara Jensen'},quote:{rep_id:'mara',rep_name:'Mara Jensen'}});

const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input);
  if(url.startsWith('/api/rep/badges'))return Response.json({quotes:0,attention:0});
  if(url==='/api/rep/quotes/q-24817/messages')return Response.json({total:5,messages:[],next_before:null});
  if(url==='/api/rep/quotes/reassign'&&init?.method==='POST'){
    const body=JSON.parse(String(init.body));
    return Response.json({replayed:false,to:REASSIGN.targets.find(t=>t.id===body.toRepId),skipped:[],moved:[{id:'q-24817',quote_number:'Q-24817',from:{id:'mara',name:'Mara Jensen'}}]});
  }
  return Response.json({detail:'Not found.'},{status:404});
});
const posts=()=>fetchMock.mock.calls.filter(([,init])=>init?.method==='POST').map(([url,init])=>({url:String(url),body:init?.body?JSON.parse(String(init.body)):null}));

beforeEach(()=>{fetchMock.mockClear();router.refresh.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.unstubAllGlobals();});

function renderPage(detail:QuoteDetail,{rep=brandi,reassign=REASSIGN}:{rep?:{id:string;name:string;initials:string;title:string;manager?:boolean};reassign?:typeof REASSIGN|null}={}){
  return render(<RepShell rep={rep} org="Herrick Industrial Supply" customers={CUSTOMERS} initialBadges={{quotes:0,attention:0}}>
    <QuoteDetailView initial={detail} reassign={reassign??undefined}/></RepShell>);
}

describe('the manager on another rep’s quote',()=>{
  it('shows the read-only banner and disables every edit control',async()=>{
    renderPage(marasDraft());
    const banner=screen.getByRole('region',{name:'Read only'});
    expect(banner).toHaveTextContent('Read only: Mara Jensen’s quote. Reassign it to edit.');
    expect(within(banner).getByRole('button',{name:'Reassign…'})).toBeEnabled();
    for(const name of ['Save draft','Approve & send'])expect(screen.getByRole('button',{name})).toBeDisabled();
    // Reading stays open: Export and the chat.
    expect(screen.getByRole('button',{name:'Export'})).toBeEnabled();
    expect(await screen.findByRole('button',{name:'View full chat, 5 messages'})).toBeEnabled();
    // No Add item, every line field disabled (as on a sent quote), no remove buttons, no note box.
    expect(screen.queryByRole('combobox',{name:/Add item/})).toBeNull();
    const prices=screen.getAllByRole('textbox',{name:/^Unit price for/});
    expect(prices).toHaveLength(4);
    for(const field of [...prices,...screen.getAllByRole('textbox',{name:/^(Quantity|Qty|Margin) for/i})])expect(field).toBeDisabled();
    expect(screen.queryByRole('button',{name:/^Remove /})).toBeNull();
    expect(screen.queryByRole('button',{name:'Add note'})).toBeNull();
    // ⋯: Duplicate is the owner's; Reassign is offered.
    fireEvent.click(screen.getByRole('button',{name:'More actions'}));
    const menu=screen.getByRole('menu',{name:'More actions'});
    expect(within(menu).getByRole('menuitem',{name:'Duplicate quote'})).toHaveAttribute('aria-disabled','true');
    expect(within(menu).getByRole('menuitem',{name:'Reassign to another rep'})).not.toHaveAttribute('aria-disabled','true');
  });

  it('does not mark the quote read for its rep',async()=>{
    renderPage(marasDraft());
    await screen.findByRole('button',{name:'View full chat, 5 messages'});
    expect(posts().filter(p=>p.url.endsWith('/read'))).toEqual([]);
  });

  it('reassigns the quote to herself from the banner, then reloads the page as hers',async()=>{
    renderPage(marasDraft());
    fireEvent.click(within(screen.getByRole('region',{name:'Read only'})).getByRole('button',{name:'Reassign…'}));
    const dialog=screen.getByRole('dialog',{name:'Reassign Q-24817'});
    const target=within(dialog).getByRole('combobox',{name:'New rep'});
    // Mara already owns it, so she isn't offered; the manager herself is first and chosen.
    expect(within(target).getAllByRole('option').map(o=>o.textContent)).toEqual(['Choose a rep','Brandi Gallegos (you)','Eli Porter']);
    expect(target).toHaveValue('brandi');
    fireEvent.click(within(dialog).getByRole('button',{name:'Reassign'}));
    await waitFor(()=>expect(router.refresh).toHaveBeenCalled());
    expect(posts()).toEqual([{url:'/api/rep/quotes/reassign',body:{quoteIds:['q-24817'],toRepId:'brandi'}}]);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the server’s reason when the reassignment is refused, and keeps the dialog open',async()=>{
    fetchMock.mockImplementation(async(input:RequestInfo|URL)=>String(input)==='/api/rep/quotes/reassign'
      ?Response.json({detail:'Eli Porter is inactive. Choose an active rep.'},{status:400})
      :String(input).startsWith('/api/rep/badges')?Response.json({quotes:0,attention:0}):Response.json({total:0,messages:[],next_before:null}));
    renderPage(marasDraft());
    fireEvent.click(within(screen.getByRole('region',{name:'Read only'})).getByRole('button',{name:'Reassign…'}));
    const dialog=screen.getByRole('dialog',{name:'Reassign Q-24817'});
    fireEvent.change(within(dialog).getByRole('combobox',{name:'New rep'}),{target:{value:'eli'}});
    fireEvent.click(within(dialog).getByRole('button',{name:'Reassign'}));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Eli Porter is inactive. Choose an active rep.');
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe('on her own quote',()=>{
  it('the manager gets no banner and can edit, with "Reassign to another rep" in the ⋯ menu',()=>{
    renderPage(sampleDetail());
    expect(screen.queryByRole('region',{name:'Read only'})).toBeNull();
    expect(screen.getByRole('button',{name:'Approve & send'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'More actions'}));
    expect(within(screen.getByRole('menu',{name:'More actions'})).getAllByRole('menuitem').map(i=>i.textContent))
      .toEqual(['Duplicate quote','Reassign to another rep','Open customer in ERP','Reset sample quote']);
    fireEvent.click(screen.getByRole('menuitem',{name:'Reassign to another rep'}));
    const target=within(screen.getByRole('dialog',{name:'Reassign Q-24817'})).getByRole('combobox',{name:'New rep'});
    expect(within(target).getAllByRole('option').map(o=>o.textContent)).toEqual(['Choose a rep','Eli Porter','Mara Jensen']);
    expect(target).toHaveValue('');
  });

  it('a rep gets no Reassign anywhere',()=>{
    renderPage(sampleDetail({quote:{rep_id:'mara',rep_name:'Mara Jensen'}}),{rep:{id:'mara',name:'Mara Jensen',initials:'MJ',title:'Inside Sales'},reassign:null});
    fireEvent.click(screen.getByRole('button',{name:'More actions'}));
    expect(within(screen.getByRole('menu',{name:'More actions'})).getAllByRole('menuitem').map(i=>i.textContent))
      .toEqual(['Duplicate quote','Open customer in ERP','Reset sample quote']);
  });
});
