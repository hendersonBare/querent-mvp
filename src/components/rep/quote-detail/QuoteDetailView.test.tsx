import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {applyPatch,type DetailLine} from '@/server/rep/quote-math';
import {CUSTOMERS} from '../quotes/test-fixtures';
import {ITEMS,SAMPLE_LINES,detailLine,sampleDetail} from './test-fixtures';

// The quote detail page (task 3.3; spec §4, screens 03-04): header, request and checks panels,
// the line grid with its dropdown, floor warning and "Why this price?", autosave, Undo, totals and
// the summary card. fetch is a small fake of the rep API that applies edits with the same pure
// functions the server uses (applyPatch), so the page's optimistic view and the "saved" copy agree.

const nav=vi.hoisted(()=>({query:'customer=wasatch'}));
vi.mock('next/navigation',()=>({
  usePathname:()=>'/rep/quotes/Q-24817',
  useSearchParams:()=>new URLSearchParams(nav.query),
  useRouter:()=>({replace:vi.fn(),push:vi.fn(),refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_prefetch,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('../RepShell');
const {QuoteDetailView}=await import('./QuoteDetailView');

// ---- A fake rep API over one quote ----
let server:{lines:DetailLine[];removed:DetailLine[];unread:number;status:number|null};
const detailOf=(lines:DetailLine[])=>sampleDetail({lines});
const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),method=init?.method??'GET';
  const body=init?.body?JSON.parse(String(init.body)):undefined;
  if(url==='/api/rep/badges')return Response.json({quotes:server.unread});
  if(url==='/api/rep/quotes/q-24817/read'&&method==='POST'){server.unread=0;return Response.json({id:'q-24817',quote_number:'Q-24817',unread:false});}
  if(server.status)return Response.json({detail:'Q-24817 was sent to the customer. It can\'t be edited unless they ask for changes.',code:'illegal_transition'},{status:server.status});
  const line=/^\/api\/rep\/quotes\/q-24817\/lines\/([^/]+)$/.exec(url);
  if(line&&method==='PATCH'){
    server.lines=server.lines.map(l=>l.id===line[1]?applyPatch(l,body)!:l);
    return Response.json(detailOf(server.lines));
  }
  if(line&&method==='DELETE'){server.removed.push(...server.lines.filter(l=>l.id===line[1]));server.lines=server.lines.filter(l=>l.id!==line[1]);return Response.json(detailOf(server.lines));}
  if(url==='/api/rep/quotes/q-24817/lines'&&method==='POST'){
    const item=Object.values(ITEMS).find(i=>i.sku===body.itemId)!;
    const n=body.restore?.lineNo??Math.max(0,...server.lines.map(l=>l.line_no))+1;
    const price=body.restore?body.restore.unitPrice:item.customer_price;
    // Like the server, a restored line keeps who added it, its match score and the request from the removed line.
    const was=body.restore&&server.removed.find(l=>l.line_no===body.restore.lineNo);
    const added=detailLine(item,{n,qty:body.qty,unit_price:price,price_basis:body.restore?body.restore.basis:'customer',added_by:was?.added_by??'rep',
      requested_text:was?.requested_text??null,match_score:was?.match_score??null});
    server.lines=[...server.lines,added].sort((a,b)=>a.line_no-b.line_no);
    return Response.json({detail:detailOf(server.lines),line_id:added.id},{status:201});
  }
  if(url.startsWith('/api/rep/quotes/q-24817/items?q=')){
    const {discs,straps}=ITEMS;
    return Response.json({items:[
      {id:discs.sku,sku:discs.sku,description:discs.description,pack:discs.pack,category_name:discs.category_name,price:47.5,basis:'customer',available:52,branch_code:'SLC',on_quote:false},
      {id:straps.sku,sku:straps.sku,description:straps.description,pack:straps.pack,category_name:straps.category_name,price:22.95,basis:'customer',available:7,branch_code:'SLC',on_quote:true},
    ]});
  }
  if(url==='/api/rep/quotes/q-24817')return Response.json(detailOf(server.lines));
  return Response.json({detail:'Not found.'},{status:404});
});
const calls=(method:string,match:RegExp)=>fetchMock.mock.calls.filter(([url,init])=>(init?.method??'GET')===method&&match.test(String(url)));

beforeEach(()=>{server={lines:[...SAMPLE_LINES],removed:[],unread:1,status:null};fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

function renderPage(detail:QuoteDetail=sampleDetail()){
  return render(<RepShell rep={{id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'}} org="Herrick Industrial Supply" customers={CUSTOMERS}
    initialBadges={{quotes:1}}><QuoteDetailView initial={detail}/></RepShell>);
}
const row=(sku:string)=>screen.getByRole('rowheader',{name:new RegExp(sku)}).closest('tbody')!;
const cells=(sku:string)=>within(row(sku)).getAllByRole('cell');
const priceField=(sku:string)=>screen.getByRole('textbox',{name:`Unit price for ${sku}`});
const totalsText=()=>screen.getByLabelText('Quote totals').textContent;
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

describe('header and panels',()=>{
  it('shows the breadcrumb (keeping ?customer=), customer, status chip and request line (screen 03)',()=>{
    renderPage();
    const crumbs=screen.getByRole('navigation',{name:'Breadcrumb'});
    expect(crumbs).toHaveTextContent('Quotes/Q-24817Sample data');
    expect(within(crumbs).getByRole('link',{name:'Quotes'})).toHaveAttribute('href','/rep/quotes?customer=wasatch');
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Wasatch Mechanical Contractors');
    expect(screen.getByText('Draft ready')).toBeInTheDocument();
    expect(screen.getByText('Q-24817 · Dana Ortiz, Purchasing · Requested Wed Sep 23, 10:14 AM · Valid until Oct 9')).toBeInTheDocument();
    for(const name of ['Save draft','Export','More actions','Approve & send'])expect(screen.getByRole('button',{name})).toBeEnabled();
  });

  it('opens the Export and ⋯ menus, and Approve & send opens the send dialog (task 3.7; more in send/ApproveAndSend.test.tsx)',()=>{
    renderPage();
    fireEvent.click(screen.getByRole('button',{name:'More actions'}));
    expect(within(screen.getByRole('menu',{name:'More actions'})).getAllByRole('menuitem').map(i=>i.textContent))
      .toEqual(['Duplicate quote','Open customer in ERP','Reset sample quote']);
    fireEvent.click(screen.getByRole('button',{name:'Export'}));
    expect(within(screen.getByRole('menu',{name:'Export'})).getAllByRole('menuitem').map(i=>i.firstChild?.textContent))
      .toEqual(['Customer quote (PDF)','Internal worksheet (PDF)','Line items (CSV)','Copy quote summary']);
    fireEvent.click(screen.getByRole('button',{name:'Approve & send'}));
    const dialog=screen.getByRole('dialog',{name:'Send quote to Dana Ortiz'});
    expect(dialog).toHaveTextContent('4 items · $1,122.40 before tax · Will call at SLC, Thu Sep 24 · valid until Oct 9');
    expect(dialog).toHaveTextContent('Still open: Nitrile disposable gloves: 26.6% margin, below Brandi\'s 30% Safety & PPE floor;');
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the customer’s request, collapsed, and the things to check before sending',()=>{
    renderPage();
    expect(screen.getByText('Customer request').closest('details')).not.toHaveAttribute('open');
    const checks=screen.getByRole('region',{name:'2 things to check before sending'});
    expect(within(checks).getAllByRole('listitem').map(li=>li.textContent)).toEqual([
      'MarginNitrile disposable gloves: 26.6% margin, below Brandi\'s 30% Safety & PPE floorReview',
      'StockRatchet strap 2 in x 27 ft: short 5 at SLC. 20 at Ogden. 24 on order at SLC, due Sep 26Review',
    ]);
    fireEvent.click(within(checks).getByRole('button',{name:'Review Nitrile disposable gloves'}));
    expect(screen.getByRole('button',{name:'Why this price? Nitrile disposable gloves'})).toHaveAttribute('aria-expanded','true');
  });

  it('marks the quote read once it is on screen, and the Quotes badge clears',async()=>{
    renderPage();
    await waitFor(()=>expect(calls('POST',/\/read$/)).toHaveLength(1));
    const quotesLink=screen.getByRole('navigation',{name:'Rep portal'}).querySelector('a[href^="/rep/quotes"]')!;
    await waitFor(()=>expect(quotesLink).not.toHaveTextContent('unread'));
  });
});

describe('line grid',()=>{
  it('shows each line: item, SKU and pack, qty, available at SLC, price with its basis, margin and total',()=>{
    renderPage();
    expect(screen.getAllByRole('columnheader').map(h=>h.textContent)).toEqual(['Why this price?','Item','Qty','Available','Unit price','Margin','Total','Remove']);
    expect(within(row('HCS-12-13-2G8')).getByRole('rowheader')).toHaveTextContent('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zincHCS-12-13-2G8Box of 50');
    expect(within(row('CW-45-045-T1')).getByRole('rowheader')).toHaveTextContent('Contract');
    expect(screen.getByRole('textbox',{name:'Quantity for HCS-12-13-2G8'})).toHaveValue('10');
    expect(priceField('HCS-12-13-2G8')).toHaveValue('31.50');
    expect(screen.getByRole('button',{name:'Price basis for HCS-12-13-2G8: Last paid'})).toBeInTheDocument();
    expect(screen.getByRole('textbox',{name:'Margin for HCS-12-13-2G8'})).toHaveValue('32.1');
    // Cells: the Why this price? toggle, qty (an input), available, price and basis, margin (an input), total, remove.
    expect(cells('HCS-12-13-2G8').map(c=>c.textContent)).toEqual(['','','64 at SLC','$Last paid','%','$315.00','']);
    expect(cells('RS-2-27-JH')[2]).toHaveTextContent('7 at SLCShort 5');
  });

  it('shows cost only with Show cost on (screen 04)',()=>{
    renderPage();
    expect(screen.queryByRole('columnheader',{name:'Cost'})).toBeNull();
    fireEvent.click(screen.getByRole('switch',{name:'Show cost'}));
    expect(screen.getByRole('columnheader',{name:'Cost'})).toBeInTheDocument();
    expect(cells('HCS-12-13-2G8')[3]).toHaveTextContent('$21.40');
  });

  it('puts the red floor warning directly above the price field of a line below floor, and only there',()=>{
    renderPage();
    const warning=screen.getByRole('note');
    expect(warning).toHaveTextContent('Below Brandi\'s 30% Safety & PPE floor');
    const price=priceField('GLV-N8-L-1000');
    // Same cell, immediately before the price input's wrapper, and the input is described by it.
    expect(warning.parentElement).toBe(price.closest('td'));
    expect(warning.nextElementSibling).toContainElement(price);
    expect(price).toHaveAttribute('aria-describedby',warning.id);
    expect(price).toHaveAttribute('data-low','true');
    expect(screen.getByRole('textbox',{name:'Margin for GLV-N8-L-1000'})).toHaveValue('26.6');
  });

  it('shows the warning live as the rep types a below-floor price, and saves it as Custom without blocking',async()=>{
    renderPage();
    const price=priceField('HCS-12-13-2G8');
    fireEvent.focus(price);
    fireEvent.change(price,{target:{value:'22'}});
    expect(within(row('HCS-12-13-2G8')).getByRole('note')).toHaveTextContent('Below Brandi\'s 20% Fasteners floor');
    expect(screen.getByRole('textbox',{name:'Margin for HCS-12-13-2G8'})).toHaveValue('2.7');
    expect(cells('HCS-12-13-2G8').at(-2)).toHaveTextContent('$220.00');
    expect(calls('PATCH',/lines/)).toHaveLength(0);
    fireEvent.blur(price);
    await waitFor(()=>expect(calls('PATCH',/lines\/q-24817-1$/)).toHaveLength(1));
    expect(JSON.parse(String(calls('PATCH',/lines/)[0][1]!.body))).toEqual({unitPrice:22});
    await settle();
    expect(priceField('HCS-12-13-2G8')).toHaveValue('22.00');
    expect(screen.getByRole('button',{name:'Price basis for HCS-12-13-2G8: Custom'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Approve & send'})).toBeEnabled();
    expect(screen.getByRole('region',{name:'3 things to check before sending'})).toBeInTheDocument();
  });

  it('switches a line’s price basis from the dropdown: new price, new total, autosaved',async()=>{
    renderPage();
    fireEvent.click(screen.getByRole('button',{name:'Price basis for HCS-12-13-2G8: Last paid'}));
    fireEvent.click(screen.getByRole('option',{name:/^List/}));
    expect(priceField('HCS-12-13-2G8')).toHaveValue('38.95');
    expect(cells('HCS-12-13-2G8').at(-2)).toHaveTextContent('$389.50');
    await waitFor(()=>expect(calls('PATCH',/lines\/q-24817-1$/)).toHaveLength(1));
    expect(JSON.parse(String(calls('PATCH',/lines/)[0][1]!.body))).toEqual({basis:'list'});
    await settle();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it('opens "Why this price?" with Querent’s explanation and the options, and Use prices the line',async()=>{
    renderPage();
    const toggle=screen.getByRole('button',{name:'Why this price? Hex cap screw 1/2-13 x 2 in'});
    expect(toggle).toHaveAttribute('aria-expanded','false');
    fireEvent.click(toggle);
    const why=document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(why).toBeVisible();
    expect(why).toHaveTextContent('Last paid $31.50 on Aug 12, above customer price $30.95. +$5.50 GP vs customer price.');
    expect(why).toHaveTextContent('Brandi’s 20% Fasteners floor · Last paid $31.50 on Aug 12');
    expect(why).toHaveTextContent('What Dana asked for“1/2 in grade 8 hex bolts, 10 boxes”');
    fireEvent.click(within(why).getByRole('button',{name:'Use Customer for HCS-12-13-2G8'}));
    expect(priceField('HCS-12-13-2G8')).toHaveValue('30.95');
    expect(why).toHaveTextContent('You priced it at Customer, $30.95.');
    await waitFor(()=>expect(calls('PATCH',/lines/)).toHaveLength(1));
  });
});

describe('totals and summary card',()=>{
  it('totals the lines: items, freight (will call), sales tax added on invoice, quote total',()=>{
    renderPage();
    expect(totalsText()).toBe('Items$1,122.40Freight (will call)$0.00Sales taxAdded on invoiceQuote total$1,122.40');
    const summary=screen.getByRole('region',{name:'Quote summary'});
    expect(summary).toHaveTextContent('$1,122.40Quote total, before tax$361.40Gross profit32.2%Margin');
    expect(summary).toHaveTextContent('Same as what they paid last time');
    expect(summary).toHaveTextContent('Bar shows quote margin. Marker is the 23.8% blended floor.');
    // "Querent found" sits next to "Suggested by Querent" (spec §5.1 rule 4, task 3.6).
    expect(screen.getByRole('group',{name:'Suggested by Querent'})).toHaveTextContent('Querent found +$11.50 GP');
    expect(within(summary).getByRole('img')).toHaveAccessibleName('Quote margin 32.2% against the 23.8% blended floor');
  });

  it('follows edits live: qty and price change the totals, GP and "vs last time"',()=>{
    renderPage();
    const qty=screen.getByRole('textbox',{name:'Quantity for HCS-12-13-2G8'});
    fireEvent.focus(qty);
    fireEvent.change(qty,{target:{value:'20'}});
    expect(totalsText()).toContain('Items$1,437.40');
    const price=priceField('GLV-N8-L-1000');
    fireEvent.focus(price);
    fireEvent.change(price,{target:{value:'80'}});
    const summary=screen.getByRole('region',{name:'Quote summary'});
    // Bolts 20 x 31.50 = 630, gloves 4 x 80 = 320: items 1,441.40; the gloves are $4.00 over last paid.
    expect(summary).toHaveTextContent('$1,441.40');
    expect(summary).toHaveTextContent('+$4.00 vs. what they paid last time');
  });

  it('shows delivery freight, and call for freight with no total',()=>{
    renderPage(sampleDetail({quote:{fulfillment:'delivery'},freight:{computed:{rule:'beyond_radius',amount:'call_for_freight',miles:92,formula:null,explanation:''},override:null,amount:'call_for_freight',source:'computed',unresolved:true}}));
    expect(totalsText()).toBe('Items$1,122.40Freight (92.0 mi)Call for freightSales taxAdded on invoiceQuote total—');
    expect(screen.getByRole('region',{name:/things to check/})).toHaveTextContent('BlockedFreight is still call for freight: set it by hand before sending.');
  });
});

describe('add, remove and undo',()=>{
  it('removes a line at once, and Undo puts it back in its place',async()=>{
    renderPage();
    fireEvent.click(screen.getByRole('button',{name:'Remove Cut-off wheel 4.5 x .045 x 7/8 in'}));
    expect(screen.queryByRole('rowheader',{name:/CW-45-045-T1/})).toBeNull();
    expect(totalsText()).toContain('Items$906.40');
    expect(screen.getByText('Removed Cut-off wheel 4.5 x .045 x 7/8 in')).toBeInTheDocument();
    await waitFor(()=>expect(calls('DELETE',/lines\/q-24817-2$/)).toHaveLength(1));
    await settle();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(screen.getAllByRole('rowheader').map(h=>within(h).getByText(/^[A-Z]{2,3}-/).textContent)).toEqual(['HCS-12-13-2G8','CW-45-045-T1','GLV-N8-L-1000','RS-2-27-JH']);
    await waitFor(()=>expect(calls('POST',/lines$/)).toHaveLength(1));
    // Undo sends the line's number, price and basis only: who added it, its match score and Dana's words stay on the server.
    expect(JSON.parse(String(calls('POST',/lines$/)[0][1]!.body))).toEqual({itemId:'CW-45-045-T1',qty:6,restore:{lineNo:2,unitPrice:36,basis:'contract'}});
    await settle();
    expect(totalsText()).toContain('Items$1,122.40');
    expect(screen.queryByRole('button',{name:'Undo'})).toBeNull();
  });

  it('undoes the most recent edit first: a price, then a basis switch',async()=>{
    renderPage();
    fireEvent.click(screen.getByRole('button',{name:'Price basis for HCS-12-13-2G8: Last paid'}));
    fireEvent.click(screen.getByRole('option',{name:/^List/}));
    const price=priceField('RS-2-27-JH');
    fireEvent.focus(price);fireEvent.change(price,{target:{value:'21.50'}});fireEvent.blur(price);
    expect(screen.getByText('Changed price on Ratchet strap 2 in x 27 ft to $21.50')).toBeInTheDocument();
    await waitFor(()=>expect(calls('PATCH',/lines/)).toHaveLength(2));
    await settle();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(priceField('RS-2-27-JH')).toHaveValue('22.95');
    expect(screen.getByText('Priced Hex cap screw 1/2-13 x 2 in at List')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(priceField('HCS-12-13-2G8')).toHaveValue('31.50');
    await waitFor(()=>expect(calls('PATCH',/lines/)).toHaveLength(4));
    expect(calls('PATCH',/lines/).slice(2).map(([url,init])=>[String(url).split('/').at(-1),JSON.parse(String(init!.body))])).toEqual([
      ['q-24817-4',{basis:'customer'}],['q-24817-1',{basis:'last_paid'}],
    ]);
  });

  it('keeps one Undo for one field typed in one go, even when it saves partway',async()=>{
    vi.useFakeTimers({shouldAdvanceTime:true});
    renderPage();
    const qty=screen.getByRole('textbox',{name:'Quantity for GLV-N8-L-1000'});
    fireEvent.focus(qty);
    fireEvent.change(qty,{target:{value:'6'}});
    await act(async()=>{vi.advanceTimersByTime(1300);});
    fireEvent.change(qty,{target:{value:'8'}});
    fireEvent.blur(qty);
    await waitFor(()=>expect(calls('PATCH',/lines/)).toHaveLength(2));
    expect(screen.getByText('Changed qty on Nitrile disposable gloves to 6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(screen.getByRole('textbox',{name:'Quantity for GLV-N8-L-1000'})).toHaveValue('4');
    await waitFor(()=>expect(calls('PATCH',/lines/)).toHaveLength(3));
    expect(JSON.parse(String(calls('PATCH',/lines/)[2][1]!.body))).toEqual({qty:4,basis:'last_paid'});
  });

  it('adds an item by SKU or name, focuses its qty, and Undo removes it',async()=>{
    renderPage();
    const box=screen.getByRole('combobox',{name:'Add item by SKU or name'});
    fireEvent.focus(box);
    fireEvent.change(box,{target:{value:'fd-45'}});
    const results=await screen.findByRole('listbox',{name:'Matching items'});
    await waitFor(()=>expect(within(results).getAllByRole('option')).toHaveLength(2));
    expect(within(results).getByRole('option',{name:/Ratchet strap/})).toHaveAttribute('aria-disabled','true');
    expect(within(results).getByRole('option',{name:/Flap disc/})).toHaveTextContent('Flap disc 4.5 in, 60 grit zirconia$47.50FD-45-60Z · 52 at SLC');
    fireEvent.keyDown(box,{key:'Enter'});
    await waitFor(()=>expect(calls('POST',/lines$/)).toHaveLength(1));
    expect(JSON.parse(String(calls('POST',/lines$/)[0][1]!.body))).toEqual({itemId:'FD-45-60Z',qty:1});
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'Quantity for FD-45-60Z'})).toHaveFocus());
    expect(within(row('FD-45-60Z')).getByRole('rowheader')).toHaveTextContent('Added');
    expect(screen.getByText('5 items')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(screen.queryByRole('rowheader',{name:/FD-45-60Z/})).toBeNull();
    await waitFor(()=>expect(calls('DELETE',/lines\/q-24817-5$/)).toHaveLength(1));
  });

  it('shows a refused save, and puts the quote back as the server has it',async()=>{
    renderPage();
    server.status=409;
    fireEvent.click(screen.getByRole('button',{name:'Remove Nitrile disposable gloves'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Q-24817 was sent to the customer. It can\'t be edited unless they ask for changes.');
    await waitFor(()=>expect(screen.getByRole('rowheader',{name:/GLV-N8-L-1000/})).toBeInTheDocument());
    expect(screen.queryByRole('button',{name:'Undo'})).toBeNull();
  });
});

describe('read-only quotes',()=>{
  it('an accepted quote can’t be edited: no add, remove or undo, and every field is locked',()=>{
    renderPage(sampleDetail({editable:false,quote:{status:'accepted',revision:1,sent_at:'2026-09-23T17:00:00.000Z',responded_at:'2026-09-24T15:00:00.000Z',valid_until:'2026-10-07'},valid_until:'2026-10-07'}));
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText(/Dana accepted rev 1 on Sep 24\./)).toBeInTheDocument();
    expect(screen.queryByRole('combobox',{name:'Add item by SKU or name'})).toBeNull();
    expect(screen.queryByRole('button',{name:/^Remove/})).toBeNull();
    expect(screen.queryByRole('region',{name:/things to check|Ready to send/})).toBeNull();
    expect(priceField('HCS-12-13-2G8')).toBeDisabled();
    expect(screen.getByRole('textbox',{name:'Quantity for HCS-12-13-2G8'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Price basis for HCS-12-13-2G8: Last paid'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Approve & send'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Save draft'})).toBeDisabled();
    // Why this price? still opens.
    fireEvent.click(screen.getByRole('button',{name:'Why this price? Hex cap screw 1/2-13 x 2 in'}));
    expect(screen.queryByRole('button',{name:/^Use /})).toBeNull();
  });

  it('an accepted quote names what the customer sent with Accept: the PO and the pickup time (task 5.2)',()=>{
    renderPage(sampleDetail({editable:false,quote:{status:'accepted',revision:2,sent_at:'2026-09-24T17:00:00.000Z',responded_at:'2026-09-25T15:00:00.000Z',valid_until:'2026-10-08',
      customer_po:'7781',fulfillment_time:'2026-09-29T16:00:00.000Z'},valid_until:'2026-10-08'}));
    expect(screen.getByText('Dana accepted rev 2 on Sep 25 with PO 7781, pickup Tue Sep 29, 10:00 AM at SLC.')).toBeInTheDocument();
  });

  it('a changes_requested quote is editable and shows the customer’s note',()=>{
    renderPage(sampleDetail({quote:{status:'changes_requested',revision:1,responded_at:'2026-09-24T15:00:00.000Z',change_request_note:'Make the gloves 6 cases.'}}));
    expect(screen.getByText('Make the gloves 6 cases.')).toBeInTheDocument();
    expect(screen.getByText(/Dana asked for changes on Sep 24:/)).toBeInTheDocument();
    expect(priceField('HCS-12-13-2G8')).toBeEnabled();
    expect(screen.getByRole('button',{name:'Approve & send'})).toBeEnabled();
  });
});
