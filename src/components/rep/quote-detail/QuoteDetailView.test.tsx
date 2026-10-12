import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {applyPatch,type DetailLine} from '@/server/rep/quote-math';
import {ITEMS,SAMPLE_LINES,detailLine,sampleDetail} from './test-fixtures';

// The quote editor (plan U4; C_QEBase, C_QE1 to C_QE11): the minimal header, the Items card with its
// fixed columns and the Show cost and stock toggle, + Add item with its results, the total box with
// Approve and send and its send blockers (decision 44), the icon buttons, Quote details, line details,
// autosave and Undo. fetch is a small fake of the rep API that applies edits with the same pure
// functions the server uses (applyPatch), so the page's optimistic view and the "saved" copy agree.

const nav=vi.hoisted(()=>({query:''}));
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
  if(url==='/api/rep/badges')return Response.json({quotes:server.unread,attention:0,caution:[],bell:[]});
  if(url==='/api/rep/quotes/q-24817/read'&&method==='POST'){server.unread=0;return Response.json({id:'q-24817',quote_number:'Q-24817',unread:false});}
  // The chat (B1): the first page of the chat, for the count on the Chat button.
  if(url==='/api/rep/quotes/q-24817/messages')return Response.json({total:5,messages:[{id:'m-1',role:'customer',kind:'text',content:'Do you have the bolts?',created_at:'2026-09-23T16:12:00.000Z'}],next_before:null});
  if(url==='/api/rep/quotes/q-24817/upsells')return Response.json({editable:true,upsells:[]});
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

beforeEach(()=>{server={lines:[...SAMPLE_LINES],removed:[],unread:1,status:null};fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);
  Element.prototype.scrollIntoView=vi.fn();});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});

function renderPage(detail:QuoteDetail=sampleDetail()){
  return render(<RepShell rep={{id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'}} org="Herrick Industrial Supply"
    initialBadges={{quotes:1,attention:0,caution:[],bell:[]}}><QuoteDetailView initial={detail}/></RepShell>);
}
/** One line: its rowgroup (the grid row and its line details). */
const row=(sku:string)=>screen.getByRole('rowheader',{name:new RegExp(sku)}).closest<HTMLElement>('[role="rowgroup"]')!;
const cells=(sku:string)=>within(row(sku)).getAllByRole('cell');
/** A cell's visible text: without the hidden "?" tip, which stays in the DOM as the button's description. */
const cellText=(cell:HTMLElement)=>{const copy=cell.cloneNode(true) as HTMLElement;copy.querySelectorAll('[role="tooltip"]').forEach(tip=>tip.remove());return copy.textContent;};
const priceField=(sku:string)=>screen.getByRole('textbox',{name:`Unit price for ${sku}`});
const summary=()=>screen.getByRole('region',{name:'Quote summary'});
const approve=()=>screen.getByRole('button',{name:'Approve and send'});
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

describe('header (C_QEBase)',()=>{
  it('shows only the customer, quote number, status, purchasing agent, requested and valid until',()=>{
    renderPage();
    expect(screen.getByRole('heading',{level:1})).toHaveTextContent('Wasatch Mechanical Contractors');
    const facts=screen.getByRole('group',{name:'Quote facts'});
    expect(facts).toHaveTextContent('QuoteQ-24817StatusDraft readyPurchasing agentDana OrtizRequestedWed Sep 23, 10:14 AMValid untilOct 9');
    // Nothing else above the quote: no breadcrumb, request box, checks box or banner.
    expect(screen.queryByRole('navigation',{name:'Breadcrumb'})).toBeNull();
    expect(screen.queryByText('Customer request')).toBeNull();
    expect(screen.queryByText(/things to check before sending/)).toBeNull();
    expect(screen.queryByText('Sample data')).toBeNull();
    // The caution and bell sit in the header row (C_QEBase).
    expect(screen.getByRole('button',{name:/^Needs attention/})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/^Notifications/})).toBeInTheDocument();
  });

  it('puts Overdue or Aging beside the status, in words, with the reason as the tooltip (task A2)',()=>{
    const {unmount}=renderPage();
    expect(screen.queryByText('Aging')).toBeNull();
    expect(screen.queryByText('Overdue')).toBeNull();
    unmount();
    renderPage(sampleDetail({aging:{level:'red',since:'2026-09-23T16:15:00.000Z',reason:'Requested 30 hours ago'}}));
    const marker=screen.getByText('Overdue');
    expect(marker).toHaveAttribute('title','Requested 30 hours ago');
    expect(screen.getByRole('group',{name:'Quote facts'})).toContainElement(marker);
  });
});

describe('total box and icon buttons',()=>{
  it('holds the total, gross profit and margin with the floor, and Approve and send (C_QEBase)',()=>{
    renderPage();
    expect(summary()).toHaveTextContent('$1,122.40Quote total, before tax$361.40Gross profit32.2%Margin, floor 23.8%Approve and send');
    expect(approve()).toBeEnabled();
    // Removed: the totals under the lines, the floor bar, "vs. what they paid last time".
    expect(screen.queryByLabelText('Quote totals')).toBeNull();
    expect(screen.queryByText(/what they paid last time/)).toBeNull();
    expect(screen.queryByText(/Bar shows quote margin/)).toBeNull();
  });

  it('follows edits live: qty and price change the total and gross profit',()=>{
    renderPage();
    const qty=screen.getByRole('textbox',{name:'Quantity for HCS-12-13-2G8'});
    fireEvent.focus(qty);
    fireEvent.change(qty,{target:{value:'20'}});
    expect(summary()).toHaveTextContent('$1,437.40');
    const price=priceField('GLV-N8-L-1000');
    fireEvent.focus(price);
    fireEvent.change(price,{target:{value:'80'}});
    expect(summary()).toHaveTextContent('$1,441.40');
  });

  it('has the Save draft, Export, Chat and More icon buttons; Save draft says when it saved (C_QE11)',async()=>{
    renderPage();
    for(const name of ['Save draft','Export','More actions'])expect(screen.getByRole('button',{name})).toBeEnabled();
    expect(await screen.findByRole('button',{name:'Customer chat, 5 messages'})).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Save draft'}));
    expect(await screen.findByText(/^Draft saved at \d{1,2}:\d\d [AP]M$/)).toBeInTheDocument();
  });

  it('opens the Export and More menus (C_QE2, C_QE3), and the chat (C_QE6)',async()=>{
    renderPage();
    fireEvent.click(screen.getByRole('button',{name:'More actions'}));
    expect(within(screen.getByRole('menu',{name:'More actions'})).getAllByRole('menuitem').map(i=>i.textContent))
      .toEqual(['Duplicate quote','Open customer in ERP','Reset sample quote']);
    fireEvent.click(screen.getByRole('button',{name:'Export'}));
    expect(within(screen.getByRole('menu',{name:'Export'})).getAllByRole('menuitem').map(i=>i.textContent)).toEqual([
      'Customer quote (PDF)What Dana sees. No cost or margin.','Internal worksheet (PDF)Adds cost, margin, last paid and open checks',
      'Line items (CSV)Opens in Excel or Google Sheets','Copy quote summaryPlain text for an email or text message']);
    fireEvent.click(await screen.findByRole('button',{name:'Customer chat, 5 messages'}));
    const chat=screen.getByRole('dialog',{name:'Full chat'});
    expect(chat).toHaveTextContent('Dana Ortiz, 5 messages, via Querent chat');
    expect(within(chat).getByText('Do you have the bolts?')).toBeInTheDocument();
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('greys out the Chat button for a quote that did not come from chat',()=>{
    renderPage(sampleDetail({quote:{conversation_id:null}}));
    expect(screen.getByRole('button',{name:'Customer chat'})).toBeDisabled();
    expect(calls('GET',/\/messages/)).toHaveLength(0);
  });

  it('Approve and send opens the send dialog with what is still open (C_QE1)',()=>{
    renderPage();
    fireEvent.click(approve());
    const dialog=screen.getByRole('dialog',{name:'Send quote to Dana Ortiz'});
    expect(dialog).toHaveTextContent('4 items, $1,122.40 before tax. Will call at SLC, Thu Sep 24. Valid until Oct 9.');
    expect(dialog).toHaveTextContent('Still open: Nitrile disposable gloves: 26.6% margin, below Brandi\'s 30% Safety & PPE floor. Ratchet strap 2 in x 27 ft: short 5 at SLC. 20 at Ogden. 24 on order at SLC, due Sep 26. You can send anyway.');
    expect(dialog).toHaveTextContent('Dana\'s chat shows it under "Quote Q-24817 is ready: $1,122.40, valid until Oct 9 - View quote".');
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('marks the quote read once it is on screen, and the Quotes badge clears',async()=>{
    renderPage();
    await waitFor(()=>expect(calls('POST',/\/read$/)).toHaveLength(1));
    const quotesLink=screen.getByRole('navigation',{name:'Rep portal'}).querySelector('a[href^="/rep/quotes"]')!;
    await waitFor(()=>expect(quotesLink).not.toHaveTextContent('unread'));
  });
});

describe('send blockers (decision 44)',()=>{
  const blocked=(lines:DetailLine[],extra:Parameters<typeof sampleDetail>[0]={})=>{server.lines=lines;return sampleDetail({lines,...extra});};
  const zeroQty=()=>SAMPLE_LINES.map((l,i)=>i===1?{...l,qty:0}:l);
  const noPrice=()=>SAMPLE_LINES.map((l,i)=>i===2?{...l,unit_price:null,price_basis:null}:l);
  const callForFreight={quote:{fulfillment:'delivery' as const},
    freight:{computed:{rule:'beyond_radius' as const,amount:'call_for_freight' as const,miles:92,formula:null,explanation:''},override:null,amount:'call_for_freight' as const,source:'computed' as const,unresolved:true}};

  it('names the only blocker under a disabled Approve and send',()=>{
    renderPage(blocked(zeroQty()));
    expect(approve()).toBeDisabled();
    const reason=screen.getByRole('button',{name:'Line 2 (CW-45-045-T1) has a quantity of 0.'});
    expect(approve()).toHaveAccessibleDescription('Line 2 (CW-45-045-T1) has a quantity of 0.');
    expect(reason).not.toHaveTextContent('more');
  });

  it('names the first of several, with "+N more"',()=>{
    renderPage(blocked(SAMPLE_LINES.map((l,i)=>i===1?{...l,qty:0}:i===2?{...l,unit_price:null,price_basis:null}:l),callForFreight));
    expect(approve()).toBeDisabled();
    expect(screen.getByRole('button',{name:'Line 2 (CW-45-045-T1) has a quantity of 0. +2 more'})).toBeInTheDocument();
  });

  it('every blocker type disables the button and is named first',()=>{
    const cases:[string,QuoteDetail,string][]=[
      ['no_lines',blocked([]),'The quote has no lines.'],
      ['zero_qty',blocked(zeroQty()),'Line 2 (CW-45-045-T1) has a quantity of 0.'],
      ['no_price',blocked(noPrice()),'Line 3 (GLV-N8-L-1000) has no price.'],
      ['no_ship_to',blocked(SAMPLE_LINES,{quote:{fulfillment:'delivery',ship_to_address:null}}),'Delivery has no ship-to address on file: switch to will call to send it.'],
      ['call_for_freight',blocked(SAMPLE_LINES,callForFreight),'Freight is still call for freight: set it by hand before sending.'],
      ['expiration_passed',blocked(SAMPLE_LINES,{quote:{expires_on:'2026-09-25'}}),'The expiration date (Sep 25, 2026) has passed: pick a later one before sending.'],
    ];
    for(const [code,detail,message] of cases){
      const {unmount}=renderPage(detail);
      expect(approve(),code).toBeDisabled();
      expect(screen.getByRole('button',{name:message}),code).toBeInTheDocument();
      unmount();
    }
  });

  it('a line blocker jumps to its line and highlights the field at fault',()=>{
    renderPage(blocked(noPrice()));
    fireEvent.click(screen.getByRole('button',{name:'Line 3 (GLV-N8-L-1000) has no price.'}));
    expect(row('GLV-N8-L-1000')).toHaveAttribute('data-flash','true');
    expect(row('GLV-N8-L-1000').scrollIntoView).toHaveBeenCalled();
    expect(priceField('GLV-N8-L-1000')).toHaveFocus();
  });

  it('a zero qty jumps to the qty field',()=>{
    renderPage(blocked(zeroQty()));
    fireEvent.click(screen.getByRole('button',{name:'Line 2 (CW-45-045-T1) has a quantity of 0.'}));
    expect(screen.getByRole('textbox',{name:'Quantity for CW-45-045-T1'})).toHaveFocus();
  });

  it('a quote-level blocker opens Quote details at its section',()=>{
    renderPage(blocked(SAMPLE_LINES,{quote:{expires_on:'2026-09-25'}}));
    const details=screen.getByRole('button',{name:/^Quote details/});
    expect(details).toHaveAttribute('aria-expanded','false');
    fireEvent.click(screen.getByRole('button',{name:/^The expiration date/}));
    expect(details).toHaveAttribute('aria-expanded','true');
    expect(screen.getByRole('region',{name:'Quote terms'})).toHaveAttribute('data-flash','true');
  });

  it('call for freight opens Pickup or delivery at the freight',()=>{
    renderPage(blocked(SAMPLE_LINES,callForFreight));
    // The total's caption stays the frame's: the blocker under Approve and send names the freight.
    expect(within(summary()).getByText(/^Quote total, before tax/)).toHaveTextContent(/^Quote total, before tax$/);
    fireEvent.click(screen.getByRole('button',{name:/^Freight is still call for freight/}));
    expect(screen.getByRole('region',{name:'Pickup or delivery'})).toHaveAttribute('data-flash','true');
  });

  it('no lines goes to + Add item',()=>{
    renderPage(blocked([]));
    fireEvent.click(screen.getByRole('button',{name:'The quote has no lines.'}));
    expect(screen.getByRole('button',{name:'Add item'}).closest('[data-flash]')).toHaveAttribute('data-flash','true');
  });

  it('a below-floor line only warns: Approve and send stays enabled and nothing is named',()=>{
    renderPage();
    expect(approve()).toBeEnabled();
    expect(approve()).not.toHaveAccessibleDescription();
  });
});

describe('line grid (C_QEBase, C_QE7)',()=>{
  it('shows Item, Qty, Unit price, Margin and Total with Show cost and stock off',()=>{
    renderPage();
    expect(screen.getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Item',':: Qty',':: Unit price',':: Margin',':: Total','']);
    expect(screen.getByRole('switch',{name:'Show cost and stock'})).toHaveAttribute('aria-checked','false');
    expect(within(row('HCS-12-13-2G8')).getByRole('rowheader')).toHaveTextContent('Hex cap screw 1/2-13 x 2 in, Grade 8, yellow zincHCS-12-13-2G8Box of 50Details');
    expect(within(row('CW-45-045-T1')).getByRole('rowheader')).toHaveTextContent('CONTRACT');
    expect(screen.getByRole('textbox',{name:'Quantity for HCS-12-13-2G8'})).toHaveValue('10');
    expect(priceField('HCS-12-13-2G8')).toHaveValue('31.50');
    expect(screen.getByRole('button',{name:'Price basis for HCS-12-13-2G8: Last paid'})).toHaveTextContent(/^Last paid$/);
    expect(screen.getByRole('textbox',{name:'Margin for HCS-12-13-2G8'})).toHaveValue('32.1');
    expect(cells('HCS-12-13-2G8').map(cellText)).toEqual(['','$Last paid?','%','$315.00','x']);
    expect(screen.getByText('4',{selector:'[data-ui="item-count"]'})).toBeInTheDocument();
  });

  it('Show cost and stock adds Available and Cost between Qty and Unit price; nothing else moves',()=>{
    renderPage();
    fireEvent.click(screen.getByRole('switch',{name:'Show cost and stock'}));
    expect(screen.getAllByRole('columnheader').map(h=>h.textContent)).toEqual([':: Item',':: Qty',':: Available',':: Cost',':: Unit price',':: Margin',':: Total','']);
    expect(cells('HCS-12-13-2G8').map(cellText)).toEqual(['','64 at SLC','$21.40','$Last paid?','%','$315.00','x']);
    expect(cells('RS-2-27-JH')[1]).toHaveTextContent('7 at SLCShort 5');
    fireEvent.click(screen.getByRole('switch',{name:'Show cost and stock'}));
    expect(screen.queryByRole('columnheader',{name:':: Cost'})).toBeNull();
  });

  it('puts the red floor note directly above the price field of a line below floor, and only there',()=>{
    renderPage();
    const warning=screen.getByText('Below Brandi\'s 30% Safety & PPE floor');
    const price=priceField('GLV-N8-L-1000');
    expect(warning.nextElementSibling).toContainElement(price);
    expect(price).toHaveAttribute('aria-describedby',warning.id);
    expect(price).toHaveAttribute('data-low','true');
    expect(screen.getByRole('textbox',{name:'Margin for GLV-N8-L-1000'})).toHaveValue('26.6');
    expect(screen.getAllByText(/^Below /)).toHaveLength(1);
  });

  it('shows stock short and a low-confidence match as inline notes on their line (decision 44)',()=>{
    const lines=SAMPLE_LINES.map((l,i)=>i===0?{...l,match_score:0.6}:l);
    server.lines=lines;
    renderPage(sampleDetail({lines}));
    expect(within(row('RS-2-27-JH')).getByText('Short 5 at SLC. 20 at Ogden. 24 on order at SLC, due Sep 26')).toHaveAttribute('data-note','stock');
    expect(within(row('HCS-12-13-2G8')).getByText('Confirm the match for "1/2 in grade 8 hex bolts, 10 boxes"')).toHaveAttribute('data-note','match');
    expect(within(row('CW-45-045-T1')).queryByText(/^Short|^Confirm/)).toBeNull();
  });

  it('shows the floor note live as the rep types a below-floor price, and saves it as Custom without blocking',async()=>{
    renderPage();
    const price=priceField('HCS-12-13-2G8');
    fireEvent.focus(price);
    fireEvent.change(price,{target:{value:'22'}});
    expect(within(row('HCS-12-13-2G8')).getByText('Below Brandi\'s 20% Fasteners floor')).toBeInTheDocument();
    expect(screen.getByRole('textbox',{name:'Margin for HCS-12-13-2G8'})).toHaveValue('2.7');
    expect(cells('HCS-12-13-2G8').at(-2)).toHaveTextContent('$220.00');
    expect(calls('PATCH',/lines/)).toHaveLength(0);
    fireEvent.blur(price);
    await waitFor(()=>expect(calls('PATCH',/lines\/q-24817-1$/)).toHaveLength(1));
    expect(JSON.parse(String(calls('PATCH',/lines/)[0][1]!.body))).toEqual({unitPrice:22});
    await settle();
    expect(priceField('HCS-12-13-2G8')).toHaveValue('22.00');
    expect(screen.getByRole('button',{name:'Price basis for HCS-12-13-2G8: Custom'})).toBeInTheDocument();
    expect(approve()).toBeEnabled();
  });

  it('switches a line’s price source from its list (C_QE10): new price, new total, autosaved',async()=>{
    renderPage();
    fireEvent.click(screen.getByRole('button',{name:'Price basis for HCS-12-13-2G8: Last paid'}));
    const list=screen.getByRole('listbox',{name:'Price basis for HCS-12-13-2G8'});
    // The frame's list: the current source and "-" on top, then each source with a price, Querent's pick marked, Custom last.
    expect(list).toHaveTextContent(/^Last paid-Customer\$30\.95List\$38\.95Last paidQUERENT'S PICKPaid Aug 12\$31\.50CustomType a price$/);
    fireEvent.click(within(list).getByRole('option',{name:/^List/}));
    expect(priceField('HCS-12-13-2G8')).toHaveValue('38.95');
    expect(cells('HCS-12-13-2G8').at(-2)).toHaveTextContent('$389.50');
    await waitFor(()=>expect(calls('PATCH',/lines\/q-24817-1$/)).toHaveLength(1));
    expect(JSON.parse(String(calls('PATCH',/lines/)[0][1]!.body))).toEqual({basis:'list'});
    await settle();
    expect(screen.getByText('All changes saved')).toBeInTheDocument();
  });

  it('opens line details in three columns (C_QE9), and Use prices the line',async()=>{
    renderPage();
    const toggle=screen.getByRole('button',{name:'Line details for Hex cap screw 1/2-13 x 2 in'});
    expect(toggle).toHaveAttribute('aria-expanded','false');
    fireEvent.click(toggle);
    const why=document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(why).toBeVisible();
    expect(why).toHaveTextContent('Why this price?Last paid $31.50 on Aug 12, above customer price $30.95. +$5.50 GP vs customer price.');
    expect(why).toHaveTextContent('Brandi\'s 20% Fasteners floor. Last paid $31.50 on Aug 12.');
    expect(why).toHaveTextContent('What Dana asked for"1/2 in grade 8 hex bolts, 10 boxes"');
    expect(why).toHaveTextContent('Price optionsBasisPriceMarginCustomer$30.9530.9%UseList$38.9545.1%UseLast paid$31.5032.1%Current');
    expect(why).toHaveTextContent('Stock by branchBranchOn handOn orderSLC64-Ogden22-Provo8-');
    fireEvent.click(within(why).getByRole('button',{name:'Use Customer for HCS-12-13-2G8'}));
    expect(priceField('HCS-12-13-2G8')).toHaveValue('30.95');
    expect(why).toHaveTextContent('You priced it at Customer, $30.95.');
    await waitFor(()=>expect(calls('PATCH',/lines/)).toHaveLength(1));
  });

  it('the "?" tells why Querent suggests its price',()=>{
    renderPage();
    const tipButton=screen.getByRole('button',{name:'Why Querent suggests $31.50 for HCS-12-13-2G8'});
    expect(tipButton).toHaveTextContent('?');
    expect(tipButton).toHaveAccessibleDescription(/^Querent’s pick: \$31\.50 \(Last paid\)/);
    fireEvent.mouseEnter(tipButton.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('32.1% margin at this price, at or above Brandi\'s 20% Fasteners floor.');
  });

  it('the "?" says so when the rep priced the line away from Querent’s pick, and shows on a contract line',()=>{
    renderPage();
    fireEvent.focus(priceField('HCS-12-13-2G8'));
    fireEvent.change(priceField('HCS-12-13-2G8'),{target:{value:'33'}});
    fireEvent.blur(priceField('HCS-12-13-2G8'));
    const tipButton=screen.getByRole('button',{name:'Why Querent suggests $31.50 for HCS-12-13-2G8'});
    expect(tipButton).toHaveAccessibleDescription(/You priced it at Custom, \$33\.00\.$/);
    fireEvent.mouseEnter(tipButton.parentElement!);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/You priced it at Custom, \$33\.00\.$/);
    fireEvent.mouseLeave(tipButton.parentElement!);
    expect(screen.getByRole('button',{name:'Why Querent suggests $36.00 for CW-45-045-T1'})).toHaveAccessibleDescription(/Contract prices are binding/);
  });
});

describe('free delivery pricing (spec §4.6, decision 36)',()=>{
  const recovered=()=>{
    const lines=[{...SAMPLE_LINES[0],freight_recovery:240},...SAMPLE_LINES.slice(1)];
    server.lines=lines;
    return sampleDetail({lines,quote:{fulfillment:'delivery',freight_rate_bp:500,freight_ramp_step:2,freight_ramp_steps:3},
      freight:{computed:{rule:'free_delivery_pricing',amount:0,miles:15,formula:null,explanation:'Free delivery pricing: freight is recovered in item prices.'},override:null,amount:0,source:'computed',unresolved:false}});
  };

  it('shows the quote\'s frozen rate as a "Freight recovery N%" chip in the header (decision 64), beside the facts',()=>{
    renderPage(recovered());
    const chip=screen.getByText('Freight recovery 5.0%');
    expect(screen.getByRole('group',{name:'Quote facts'})).toContainElement(chip);
    expect(chip).toHaveAttribute('title','Free delivery pricing: this rate of the goods value is recovered in item prices (rep-only)');
  });

  it('has no recovery chip on a quote without recovery',()=>{
    renderPage();
    expect(screen.queryByText(/Freight recovery/)).toBeNull();
  });

  it('shows the line\'s recovery in line details; the price field keeps the rep\'s price and the total is the customer\'s',()=>{
    renderPage(recovered());
    const toggle=screen.getByRole('button',{name:'Line details for Hex cap screw 1/2-13 x 2 in'});
    fireEvent.click(toggle);
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)!).toHaveTextContent('Freight recovery +$2.40 (rate 5.0%, ramp step 2 of 3)');
    expect(priceField('HCS-12-13-2G8')).toHaveValue('31.50');
    expect(cells('HCS-12-13-2G8').at(-2)).toHaveTextContent('$339.00');
    expect(summary()).toHaveTextContent('$1,146.40');
  });

  it('shows no recovery on a line that carries none',()=>{
    renderPage(recovered());
    const wheels=screen.getByRole('button',{name:'Line details for Cut-off wheel 4.5 x .045 x 7/8 in'});
    fireEvent.click(wheels);
    expect(document.getElementById(wheels.getAttribute('aria-controls')!)!).not.toHaveTextContent('Freight recovery');
  });
});

describe('add, remove and undo',()=>{
  it('+ Add item opens a search whose results drop down: Add, or Already on quote (C_QE8)',async()=>{
    renderPage();
    fireEvent.click(screen.getByRole('button',{name:'Add item'}));
    const box=screen.getByRole('combobox',{name:'Add item'});
    expect(box).toHaveFocus();
    fireEvent.change(box,{target:{value:'fd-45'}});
    const results=await screen.findByRole('listbox',{name:'Matching items'});
    await waitFor(()=>expect(within(results).getAllByRole('option')).toHaveLength(2));
    expect(within(results).getByRole('option',{name:/Flap disc/})).toHaveTextContent('Flap disc 4.5 in, 60 grit zirconiaFD-45-60Z, 52 at SLC, $47.50Add');
    const already=within(results).getByRole('option',{name:/Ratchet strap/});
    expect(already).toHaveAttribute('aria-disabled','true');
    expect(already).toHaveTextContent('RS-2-27-JH, 7 at SLC, $22.95Already on quote');
    expect(results.parentElement).toHaveTextContent('2 matches for "fd-45". Type a SKU or name.');
    fireEvent.keyDown(box,{key:'Enter'});
    await waitFor(()=>expect(calls('POST',/lines$/)).toHaveLength(1));
    expect(JSON.parse(String(calls('POST',/lines$/)[0][1]!.body))).toEqual({itemId:'FD-45-60Z',qty:1});
    await waitFor(()=>expect(screen.getByRole('textbox',{name:'Quantity for FD-45-60Z'})).toHaveFocus());
    expect(screen.getByText('5',{selector:'[data-ui="item-count"]'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(screen.queryByRole('rowheader',{name:/FD-45-60Z/})).toBeNull();
    await waitFor(()=>expect(calls('DELETE',/lines\/q-24817-5$/)).toHaveLength(1));
  });

  it('Escape closes the search back to + Add item',()=>{
    renderPage();
    fireEvent.click(screen.getByRole('button',{name:'Add item'}));
    fireEvent.keyDown(screen.getByRole('combobox',{name:'Add item'}),{key:'Escape'});
    expect(screen.getByRole('button',{name:'Add item'})).toBeInTheDocument();
  });

  it('removes a line at once, and Undo puts it back in its place',async()=>{
    renderPage();
    fireEvent.click(screen.getByRole('button',{name:'Remove Cut-off wheel 4.5 x .045 x 7/8 in'}));
    expect(screen.queryByRole('rowheader',{name:/CW-45-045-T1/})).toBeNull();
    expect(summary()).toHaveTextContent('$906.40');
    expect(screen.getByText('Removed Cut-off wheel 4.5 x .045 x 7/8 in')).toBeInTheDocument();
    await waitFor(()=>expect(calls('DELETE',/lines\/q-24817-2$/)).toHaveLength(1));
    await settle();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(screen.getAllByRole('rowheader').map(h=>within(h).getByText(/^[A-Z]{2,3}-/).textContent)).toEqual(['HCS-12-13-2G8','CW-45-045-T1','GLV-N8-L-1000','RS-2-27-JH']);
    await waitFor(()=>expect(calls('POST',/lines$/)).toHaveLength(1));
    expect(JSON.parse(String(calls('POST',/lines$/)[0][1]!.body))).toEqual({itemId:'CW-45-045-T1',qty:6,restore:{lineNo:2,unitPrice:36,basis:'contract'}});
    await settle();
    expect(summary()).toHaveTextContent('$1,122.40');
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
    // One toast, one Undo, for the whole run of typing.
    expect(screen.getAllByRole('button',{name:'Undo'})).toHaveLength(1);
    expect(screen.getByText('Changed qty on Nitrile disposable gloves to 6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Undo'}));
    expect(screen.getByRole('textbox',{name:'Quantity for GLV-N8-L-1000'})).toHaveValue('4');
    await waitFor(()=>expect(calls('PATCH',/lines/)).toHaveLength(3));
    expect(JSON.parse(String(calls('PATCH',/lines/)[2][1]!.body))).toEqual({qty:4,basis:'last_paid'});
    await settle();
    expect(screen.queryByRole('button',{name:'Undo'})).toBeNull();
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

describe('Quote details (C_QE4)',()=>{
  it('is closed with a one-line summary, and opens to Customer, Pickup or delivery, Quote terms, Internal notes and Activity',()=>{
    renderPage();
    const head=screen.getByRole('button',{name:'Quote details Net 30, will call SLC, valid until Oct 9'});
    expect(head).toHaveAttribute('aria-expanded','false');
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded','true');
    expect(screen.getByRole('region',{name:'Customer'})).toHaveTextContent('CustomerNet 30, 39% of creditDana OrtizPurchasing, (801) 555-0142Copy'
      +'AccountWAS-1142TermsNet 30, nothing past dueOpen balance$18,420.00Credit limit$50,000.00Last orderSep 9, SO-51223Wins on quotes71% over 12 monthsTax statusTaxable, UTCredit used, with this quote39%');
    expect(screen.getByRole('region',{name:'Pickup or delivery'})).toHaveTextContent(/^Pickup or deliveryWill call, SLC, Thu Sep 24Will callDeliveryBranch.*Pickup requested forThu Sep 24Freight\$0\.00Will call at SLC: no freight\.Set freight by hand$/);
    expect(screen.getByRole('region',{name:'Quote terms'})).toHaveTextContent('Quote termsValid until Oct 9Valid untilDefault: 14 days after it is sent. Pick any date to change it.Customer PO numberNote printed on the quote');
    expect(screen.getByRole('region',{name:'Internal notes'})).toHaveTextContent('Internal notesNoneOnly your team sees these.Add note');
    // Newest first.
    expect(screen.getByRole('region',{name:'Activity'})).toHaveTextContent(/^Activity3 eventsSep 23, 10:15 AMDraft quote built and sent to Brandi for reviewSep 23, 10:14 AMQuerent matched/);
  });

  it('keeps what the customer said in Activity: a decline reason and note',()=>{
    const panels=sampleDetail().panels;
    renderPage(sampleDetail({editable:false,quote:{status:'declined',revision:1,decline_reason:'other',decline_note:'Went with a local shop'},
      panels:{...panels,activity:[...panels.activity,{id:9,quote_id:'q-24817',at:'2026-09-24T15:00:00.000Z',actor:'customer',actor_id:'dana',kind:'declined',message:'Dana declined Q-24817 rev 1: Other: "Went with a local shop"'}]}}));
    expect(screen.getByText('Declined')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/^Quote details/}));
    expect(screen.getByRole('region',{name:'Activity'})).toHaveTextContent('Dana declined Q-24817 rev 1: Other: "Went with a local shop"');
  });
});

describe('quotes that can’t be edited',()=>{
  it('an accepted quote: no add or remove, every field locked, Approve and send off',()=>{
    renderPage(sampleDetail({editable:false,quote:{status:'accepted',revision:1,sent_at:'2026-09-23T17:00:00.000Z',responded_at:'2026-09-24T15:00:00.000Z',valid_until:'2026-10-07'},valid_until:'2026-10-07'}));
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'Add item'})).toBeNull();
    expect(screen.queryByRole('button',{name:/^Remove/})).toBeNull();
    expect(priceField('HCS-12-13-2G8')).toBeDisabled();
    expect(screen.getByRole('textbox',{name:'Quantity for HCS-12-13-2G8'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'Price basis for HCS-12-13-2G8: Last paid'})).toBeDisabled();
    expect(approve()).toBeDisabled();
    expect(screen.getByRole('button',{name:'Save draft'})).toBeDisabled();
    // Line details still open, without Use.
    fireEvent.click(screen.getByRole('button',{name:'Line details for Hex cap screw 1/2-13 x 2 in'}));
    expect(screen.queryByRole('button',{name:/^Use /})).toBeNull();
  });

  it('a changes_requested quote is editable and can be sent again',()=>{
    renderPage(sampleDetail({quote:{status:'changes_requested',revision:1,responded_at:'2026-09-24T15:00:00.000Z',change_request_note:'Make the gloves 6 cases.'}}));
    expect(screen.getByText('Changes requested')).toBeInTheDocument();
    expect(priceField('HCS-12-13-2G8')).toBeEnabled();
    expect(approve()).toBeEnabled();
  });
});
