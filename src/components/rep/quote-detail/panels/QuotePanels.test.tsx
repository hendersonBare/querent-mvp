import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Fulfillment,QuoteActivity,QuoteNote} from '@/domain';
import {CALL_FOR_FREIGHT,priceDelivery,resolveFreight,type FreightOverride,type FreightQuote} from '@/server/freight/engine';
import {cents,validUntilFor} from '@/server/quotes';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {applyPatch,type DetailLine} from '@/server/rep/quote-math';
import {CUSTOMERS} from '../../quotes/test-fixtures';
import {AS_OF,SAMPLE_LINES,sampleDetail} from '../test-fixtures';
import {SAMPLE_PANELS} from './test-fixtures';

// The quote detail's side panels on the page (task 3.4; spec §4, §5.3, §5.4; screens 03, 04, 08):
// Customer with the credit bar, Pickup or delivery with freight and its override, Quote terms,
// Internal notes and Activity. fetch is a small fake of the rep API: it applies edits with the
// same pure functions the server uses and prices freight with the 1.3 engine, so the page's live
// view and the saved copy agree.

vi.mock('next/navigation',()=>({
  usePathname:()=>'/rep/quotes/Q-24817',
  useSearchParams:()=>new URLSearchParams('customer=wasatch'),
  useRouter:()=>({replace:vi.fn(),push:vi.fn(),refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_prefetch,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('../../RepShell');
const {QuoteDetailView}=await import('../QuoteDetailView');

// ---- A fake rep API over one quote ----
const RATES={base_fee:25,per_mile:2.5,min_charge:35,free_threshold:1500,max_radius_miles:75,road_factor:1.25};
const SHIP_TO='1800 W 10950 S, South Jordan, UT 84095';
const SAVED_AT='2026-09-25T19:30:00.000Z';
interface Fake {
  lines:DetailLine[];fulfillment:Fulfillment;shipTo:string|null;override:FreightOverride|null;expiresOn:string|null;po:string|null;note:string|null;
  notes:QuoteNote[];activity:QuoteActivity[];refuse:number|null;
}
let server:Fake;

const itemsOf=(lines:readonly DetailLine[])=>cents(lines.reduce((sum,l)=>sum+(l.unit_price===null?0:cents(l.qty*l.unit_price)),0));
function freightOf(f:Fake){
  const computed:FreightQuote=f.fulfillment==='will_call'?{rule:'will_call',amount:0,miles:null,formula:null,explanation:'Will call at SLC: no freight.'}
    :f.shipTo?priceDelivery({origin:'SLC',miles:15,subtotal:itemsOf(f.lines),rates:RATES})
    :{rule:'no_ship_to',amount:CALL_FOR_FREIGHT,miles:null,formula:null,explanation:'Delivery has no ship-to address, so freight can\'t be priced by distance. Add a ship-to, or set freight by hand.'};
  return resolveFreight(computed,f.override);
}
function detailOf(f:Fake,overrides:Partial<QuoteDetail>={}):QuoteDetail{
  return sampleDetail({lines:f.lines,freight:freightOf(f),valid_until:f.expiresOn??validUntilFor(AS_OF,14),
    quote:{fulfillment:f.fulfillment,ship_to_address:f.shipTo,freight_override:f.override?.amount??null,freight_override_reason:f.override?.reason??null,
      valid_days:14,expires_on:f.expiresOn,customer_po:f.po,customer_note:f.note},
    panels:{...SAMPLE_PANELS,notes:f.notes,activity:f.activity},...overrides});
}
const log=(message:string)=>{server.activity=[...server.activity,{id:server.activity.length+1,quote_id:'q-24817',at:SAVED_AT,actor:'rep',actor_id:'brandi',kind:'x',message}];};

const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),method=init?.method??'GET';
  const body=init?.body?JSON.parse(String(init.body)):undefined;
  if(url==='/api/rep/badges')return Response.json({quotes:0,attention:0,caution:[],bell:[]});
  if(url==='/api/rep/quotes/q-24817/read')return Response.json({id:'q-24817',quote_number:'Q-24817',unread:false});
  if(url==='/api/rep/quotes/q-24817')return Response.json(detailOf(server));
  if(server.refuse)return Response.json({detail:'Q-24817 was sent to the customer. It can\'t be edited unless they ask for changes.',code:'illegal_transition'},{status:server.refuse});
  const line=/^\/api\/rep\/quotes\/q-24817\/lines\/([^/]+)$/.exec(url);
  if(line&&method==='PATCH')server.lines=server.lines.map(l=>l.id===line[1]?applyPatch(l,body)!:l);
  else if(url.endsWith('/fulfillment')&&method==='PATCH'){server.fulfillment=body.fulfillment??server.fulfillment;log(`Brandi switched to ${server.fulfillment}`);}
  else if(url.endsWith('/freight')&&method==='PUT'){server.override={amount:body.amount,reason:body.reason};log(`Freight set to $${body.amount}: ${body.reason}`);}
  else if(url.endsWith('/freight')&&method==='DELETE'){server.override=null;log('Freight override removed: back to distance-based freight.');}
  else if(url.endsWith('/terms')&&method==='PATCH'){
    if('expiresOn' in body)server.expiresOn=body.expiresOn;
    if('customerPo' in body)server.po=body.customerPo.trim()||null;
    if('customerNote' in body)server.note=body.customerNote.trim()||null;
    log('Brandi changed the terms');
  }else if(url.endsWith('/notes')&&method==='POST'){
    server.notes=[...server.notes,{id:server.notes.length+1,quote_id:'q-24817',rep_id:'brandi',rep_name:'Brandi Gallegos',body:body.body.trim(),created_at:SAVED_AT}];
    log('Brandi added an internal note');
    return Response.json(detailOf(server),{status:201});
  }else return Response.json({detail:'Not found.'},{status:404});
  return Response.json(detailOf(server));
});
const calls=(method:string,match:RegExp)=>fetchMock.mock.calls.filter(([url,init])=>(init?.method??'GET')===method&&match.test(String(url)));
const sent=(method:string,match:RegExp)=>calls(method,match).map(([,init])=>init?.body===undefined?undefined:JSON.parse(String(init.body)));

beforeEach(()=>{
  server={lines:[...SAMPLE_LINES],fulfillment:'will_call',shipTo:SHIP_TO,override:null,expiresOn:null,po:null,note:null,notes:[],activity:[...SAMPLE_PANELS.activity],refuse:null};
  fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>{vi.unstubAllGlobals();});

function renderPage(detail:QuoteDetail=detailOf(server)){
  return render(<RepShell rep={{id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'}} org="Herrick Industrial Supply"
    initialBadges={{quotes:1,attention:0,caution:[],bell:[]}}><QuoteDetailView initial={detail}/></RepShell>);
}
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});
/** The panel labelled `label`, opened (a closed panel renders only its summary). */
function panel(label:string){
  const details=screen.getByRole('group',{name:label}) as HTMLDetailsElement;
  if(!details.open){
    details.open=true;
    // jsdom doesn't fire the toggle event that the browser does when a summary is clicked.
    fireEvent(details,new Event('toggle'));
  }
  return details;
}
/** Closes the panel labelled `label`, as clicking its summary does. */
function closePanel(label:string){
  const details=screen.getByRole('group',{name:label}) as HTMLDetailsElement;
  details.open=false;
  fireEvent(details,new Event('toggle'));
}
const summaryValue=(label:string)=>screen.getByRole('group',{name:label}).querySelector('summary')!.lastElementChild!.textContent;
const creditLine=()=>within(panel('Customer')).getByTestId('credit-bar').querySelector('p')!.textContent;
const totalsText=()=>screen.getByLabelText('Quote totals').textContent;
const typePrice=(sku:string,value:string)=>{
  const price=screen.getByRole('textbox',{name:`Unit price for ${sku}`});
  fireEvent.focus(price);
  fireEvent.change(price,{target:{value}});
  return price;
};

describe('the rail',()=>{
  it('shows five closed panels under the summary card, each with its one-line value (screen 03)',()=>{
    renderPage();
    const rail=screen.getByRole('complementary',{name:'Quote summary'});
    const groups=within(rail).getAllByRole('group');
    expect(groups.map(g=>g.querySelector('summary')!.textContent)).toEqual([
      'CustomerNet 30 · 39% of credit','Pickup or deliveryWill call · SLC · Thu Sep 24','Quote termsValid until Oct 9','Internal notesNone','Activity3 events',
    ]);
    for(const g of groups)expect(g).not.toHaveAttribute('open');
    // A closed panel renders only its summary, so its words never double the rest of the page's.
    for(const g of groups)expect([...g.children].map(c=>c.tagName)).toEqual(['SUMMARY']);
    expect(screen.queryByText(/Draft quote built/)).toBeNull();
    panel('Activity');
    expect(screen.getByText('Draft quote built and sent to Brandi for review')).toBeInTheDocument();
  });
});

describe('Customer panel',()=>{
  it('shows the contact with a copy-phone button and the account facts',async()=>{
    const writeText=vi.fn(async()=>{});
    Object.defineProperty(navigator,'clipboard',{value:{writeText},configurable:true});
    renderPage();
    const customer=panel('Customer');
    expect(customer).toHaveTextContent('Dana OrtizPurchasing · (801) 555-0142');
    expect([...customer.querySelectorAll('dt')].map((dt,i)=>`${dt.textContent}: ${customer.querySelectorAll('dd')[i].textContent}`)).toEqual([
      'Account: WAS-1142','Terms: Net 30 · nothing past due','Open balance: $18,420.00','Credit limit: $50,000.00','Last order: Sep 9 · SO-51223',
      'Wins on quotes: 71% over 12 months','Tax status: Taxable, UT',
    ]);
    fireEvent.click(within(customer).getByRole('button',{name:'Copy Dana Ortiz’s phone number'}));
    await settle();
    expect(writeText).toHaveBeenCalledWith('(801) 555-0142');
    expect(within(customer).getByRole('button',{name:'Copy Dana Ortiz’s phone number'})).toHaveTextContent('Copied');
    expect(within(customer).getByRole('status')).toHaveTextContent('Copied (801) 555-0142');
  });

  it('says so when the browser blocks the copy',async()=>{
    Object.defineProperty(navigator,'clipboard',{value:{writeText:vi.fn(async()=>{throw new Error('denied');})},configurable:true});
    renderPage();
    fireEvent.click(within(panel('Customer')).getByRole('button',{name:/Copy/}));
    await settle();
    expect(within(panel('Customer')).getByRole('status')).toHaveTextContent('Copy was blocked. Select the number instead.');
  });

  it('draws the credit bar from the summary card\'s total, and it follows prices as they are typed',()=>{
    renderPage();
    expect(creditLine()).toBe('Credit used, with this quote: 39%');
    typePrice('GLV-N8-L-1000','790');
    // Items 1,122.40 - 316.00 + 3,160.00 = 3,966.40: (18,420.00 + 3,966.40) / 50,000.00 = 44.8%.
    expect(screen.getByRole('region',{name:'Quote summary'})).toHaveTextContent('$3,966.40');
    expect(creditLine()).toBe('Credit used, with this quote: 45%');
    expect(summaryValue('Customer')).toBe('Net 30 · 45% of credit');
    const bar=within(panel('Customer')).getByTestId('credit-bar');
    expect((bar.querySelector('[data-segment="quote"]') as HTMLElement).style.width).toBe('7.93%');
    expect(calls('PATCH',/lines/)).toHaveLength(0);
  });

  it('over the limit: the end turns red and it says by how much, without blocking Approve & send',()=>{
    renderPage();
    typePrice('GLV-N8-L-1000','9000');
    // Items 36,806.40: 18,420.00 + 36,806.40 = 55,226.40, over the $50,000.00 limit by $5,226.40.
    const bar=within(panel('Customer')).getByTestId('credit-bar');
    expect(bar).toHaveAttribute('data-over','true');
    expect(bar.querySelector('[data-segment="over"]')).not.toBeNull();
    expect(bar).toHaveTextContent('Over limit by $5,226.40');
    expect(creditLine()).toBe('Credit used, with this quote: 110%');
    expect(screen.getByRole('button',{name:'Approve & send'})).toBeEnabled();
  });
});

describe('Pickup or delivery panel',()=>{
  it('after the customer accepts, shows the time they chose, and Quote terms their PO (task 5.2)',()=>{
    renderPage(detailOf(server,{editable:false,quote:{...detailOf(server).quote,status:'accepted',revision:1,valid_until:'2026-10-07',customer_po:'7781',
      fulfillment_time:'2026-09-29T16:00:00.000Z'},valid_until:'2026-10-07'}));
    expect(summaryValue('Pickup or delivery')).toBe('Will call · SLC · Tue Sep 29, 10:00 AM');
    expect(panel('Pickup or delivery')).toHaveTextContent('Pickup time Dana chose on accepting: Tue Sep 29, 10:00 AM');
    expect(summaryValue('Quote terms')).toBe('Valid until Oct 7 · PO 7781');
  });

  it('switches to delivery: saved, freight priced by distance with miles and formula, and the totals and credit follow',async()=>{
    renderPage();
    const box=panel('Pickup or delivery');
    expect(within(box).getByRole('radio',{name:'Will call'})).toBeChecked();
    expect(within(box).getByRole('region',{name:'Freight'})).toHaveTextContent('Freight$0.00Will call at SLC: no freight.');
    fireEvent.click(within(box).getByRole('radio',{name:'Delivery'}));
    await waitFor(()=>expect(sent('PATCH',/\/fulfillment$/)).toEqual([{fulfillment:'delivery'}]));
    await settle();
    const freight=within(panel('Pickup or delivery')).getByRole('region',{name:'Freight'});
    expect(freight).toHaveTextContent('Freight$62.50');
    expect(freight).toHaveTextContent('Distance15.0 road mi from SLCFormula$25.00 + $2.50/mi × 15.0 mi = $62.50');
    expect(panel('Pickup or delivery')).toHaveTextContent(`Ship to ${SHIP_TO}`);
    expect(summaryValue('Pickup or delivery')).toBe('Delivery · SLC · Thu Sep 24');
    expect(totalsText()).toContain('Freight (15.0 mi)$62.50');
    expect(totalsText()).toContain('Quote total$1,184.90');
    expect(creditLine()).toBe('Credit used, with this quote: 39%');
    expect(summaryValue('Activity')).toBe('4 events');
  });

  it('re-prices freight on the live subtotal: over the free-delivery threshold it is $0 at once, like the totals',async()=>{
    server.fulfillment='delivery';
    renderPage();
    typePrice('GLV-N8-L-1000','200');
    const freight=within(panel('Pickup or delivery')).getByRole('region',{name:'Freight'});
    expect(freight).toHaveTextContent('Freight$0.00');
    expect(freight).toHaveTextContent('Free delivery: items total $1,606.40, at or over the $1,500.00 threshold. 15.0 mi from SLC.');
    expect(totalsText()).toContain('Freight (15.0 mi)$0.00');
  });

  it('sets freight by hand only with a reason; it drives the totals and can be removed',async()=>{
    server.fulfillment='delivery';
    renderPage();
    const box=panel('Pickup or delivery');
    fireEvent.click(within(box).getByRole('button',{name:'Set freight by hand'}));
    const form=within(box).getByRole('form',{name:'Set freight by hand'});
    const amount=within(form).getByRole('textbox',{name:'Freight amount'});
    expect(amount).toHaveValue('62.50');
    fireEvent.change(amount,{target:{value:'80'}});
    fireEvent.click(within(form).getByRole('button',{name:'Save freight'}));
    expect(within(form).getByRole('alert')).toHaveTextContent('Say why freight is set by hand.');
    expect(calls('PUT',/freight/)).toHaveLength(0);

    fireEvent.change(within(form).getByRole('textbox',{name:/Reason/}),{target:{value:'Liftgate truck for the job site'}});
    fireEvent.click(within(form).getByRole('button',{name:'Save freight'}));
    await waitFor(()=>expect(sent('PUT',/\/freight$/)).toEqual([{amount:80,reason:'Liftgate truck for the job site'}]));
    await settle();
    const freight=within(panel('Pickup or delivery')).getByRole('region',{name:'Freight'});
    expect(within(freight).queryByRole('form')).toBeNull();
    expect(freight).toHaveTextContent('Freight (set by rep)$80.00');
    expect(freight).toHaveTextContent('OverrideLiftgate truck for the job site');
    expect(freight).toHaveTextContent('Distance-based freight would be $62.50.');
    expect(totalsText()).toContain('Freight (set by rep)$80.00');
    expect(totalsText()).toContain('Quote total$1,202.40');
    expect(screen.getByRole('region',{name:'Quote summary'})).toHaveTextContent('$1,202.40');

    fireEvent.click(within(freight).getByRole('button',{name:'Use distance-based freight'}));
    await waitFor(()=>expect(calls('DELETE',/\/freight$/)).toHaveLength(1));
    await settle();
    expect(within(panel('Pickup or delivery')).getByRole('region',{name:'Freight'})).toHaveTextContent('Freight$62.50');
    expect(totalsText()).toContain('Quote total$1,184.90');
  });

  it('keeps what the rep typed when a panel is closed and opened again (3.4 follow-up)',()=>{
    server.fulfillment='delivery';
    renderPage();
    const form=()=>within(panel('Pickup or delivery')).getByRole('form',{name:'Set freight by hand'});
    fireEvent.click(within(panel('Pickup or delivery')).getByRole('button',{name:'Set freight by hand'}));
    fireEvent.change(within(form()).getByRole('textbox',{name:'Freight amount'}),{target:{value:'95'}});
    fireEvent.change(within(form()).getByRole('textbox',{name:/Reason/}),{target:{value:'Liftgate truck'}});
    const note=()=>within(panel('Internal notes')).getByRole('textbox');
    fireEvent.change(note(),{target:{value:'Call Dana before 3'}});
    closePanel('Pickup or delivery');
    closePanel('Internal notes');
    expect(screen.queryByRole('form',{name:'Set freight by hand'})).toBeNull();
    // Reopened: the half-done override and note are still there, unsaved.
    expect(within(form()).getByRole('textbox',{name:'Freight amount'})).toHaveValue('95');
    expect(within(form()).getByRole('textbox',{name:/Reason/})).toHaveValue('Liftgate truck');
    expect(note()).toHaveValue('Call Dana before 3');
    expect(calls('PUT',/freight/)).toHaveLength(0);
    // Cancel drops the draft: the next override starts from the computed freight again.
    fireEvent.click(within(form()).getByRole('button',{name:'Cancel'}));
    fireEvent.click(within(panel('Pickup or delivery')).getByRole('button',{name:'Set freight by hand'}));
    expect(within(form()).getByRole('textbox',{name:'Freight amount'})).toHaveValue('62.50');
    expect(within(form()).getByRole('textbox',{name:/Reason/})).toHaveValue('');
  });

  it('counts freight in the credit bar, as the summary card\'s total does',async()=>{
    server.fulfillment='delivery';
    server.override={amount:2000,reason:'Flatbed from Provo'};
    renderPage();
    // (18,420.00 + 1,122.40 items + 2,000.00 freight) / 50,000.00 = 43.1%; the items alone would be 39%.
    expect(screen.getByRole('region',{name:'Quote summary'})).toHaveTextContent('$3,122.40');
    expect(creditLine()).toBe('Credit used, with this quote: 43%');
    expect(within(panel('Customer')).getByTestId('credit-bar')).toHaveTextContent('This quote $3,122.40');
  });

  it('keeps "things to check" in sync: delivery with no ship-to blocks, and a freight override doesn\'t clear that',async()=>{
    server.shipTo=null;
    renderPage();
    fireEvent.click(within(panel('Pickup or delivery')).getByRole('radio',{name:'Delivery'}));
    await waitFor(()=>expect(screen.getByRole('region',{name:'4 things to check before sending'})).toBeInTheDocument());
    const checks=screen.getByRole('region',{name:'4 things to check before sending'});
    expect(checks).toHaveTextContent('Delivery has no ship-to address on file: switch to will call to send it.');
    expect(checks).toHaveTextContent('Freight is still call for freight: set it by hand before sending.');
    expect(summaryValue('Pickup or delivery')).toBe('Delivery · SLC · Call for freight');
    expect(panel('Pickup or delivery')).toHaveTextContent('No ship-to address on the quote: it can’t be sent as a delivery. Switch to will call.');

    const box=panel('Pickup or delivery');
    fireEvent.click(within(box).getByRole('button',{name:'Set freight by hand'}));
    const form=within(box).getByRole('form',{name:'Set freight by hand'});
    expect(within(form).getByRole('textbox',{name:'Freight amount'})).toHaveValue('');
    fireEvent.change(within(form).getByRole('textbox',{name:'Freight amount'}),{target:{value:'95'}});
    fireEvent.change(within(form).getByRole('textbox',{name:/Reason/}),{target:{value:'Carrier quote'}});
    fireEvent.click(within(form).getByRole('button',{name:'Save freight'}));
    await waitFor(()=>expect(screen.getByRole('region',{name:'3 things to check before sending'})).toBeInTheDocument());
    const after=screen.getByRole('region',{name:'3 things to check before sending'});
    expect(after).toHaveTextContent('Delivery has no ship-to address');
    expect(after).not.toHaveTextContent('call for freight');
  });

  it('shows the server\'s refusal in the panel and reloads the quote',async()=>{
    server.refuse=409;
    renderPage();
    fireEvent.click(within(panel('Pickup or delivery')).getByRole('radio',{name:'Delivery'}));
    await waitFor(()=>expect(within(panel('Pickup or delivery')).getByRole('alert')).toHaveTextContent('Q-24817 was sent to the customer.'));
    expect(within(panel('Pickup or delivery')).getByRole('radio',{name:'Will call'})).toBeChecked();
    expect(calls('GET',/\/api\/rep\/quotes\/q-24817$/)).toHaveLength(1);
  });
});

describe('Quote terms panel',()=>{
  it('sets any expiration date with a date picker (default 14 days after sending), the PO and the printed note, each saved once when it changes',async()=>{
    renderPage();
    const terms=panel('Quote terms');
    const valid=within(terms).getByLabelText('Valid until') as HTMLInputElement;
    expect(valid).toHaveAttribute('type','date');
    // Today is Sep 25: the default is 14 days after sending (Oct 9 if sent today); any day from tomorrow to a year out.
    expect([valid.value,valid.min,valid.max]).toEqual(['2026-10-09','2026-09-26','2027-09-25']);
    expect(within(terms).getByText('Default: 14 days after it’s sent. Pick any date to change it.')).toBeInTheDocument();
    fireEvent.change(valid,{target:{value:'2026-11-17'}});
    await waitFor(()=>expect(sent('PATCH',/\/terms$/)).toEqual([{expiresOn:'2026-11-17'}]));
    await settle();
    expect(summaryValue('Quote terms')).toBe('Valid until Nov 17');
    expect(within(panel('Quote terms')).getByText(/^53 days from today\./)).toBeInTheDocument();
    // A past day doesn't save; leaving the field says why.
    const picker=within(panel('Quote terms')).getByLabelText('Valid until');
    fireEvent.change(picker,{target:{value:'2026-09-20'}});
    fireEvent.blur(picker);
    expect(within(panel('Quote terms')).getByRole('alert')).toHaveTextContent('Pick an expiration date after today.');
    expect(sent('PATCH',/\/terms$/)).toHaveLength(1);
    // Back to the default.
    fireEvent.click(within(panel('Quote terms')).getByRole('button',{name:'Use the default (14 days after sending)'}));
    await waitFor(()=>expect(sent('PATCH',/\/terms$/)).toEqual([{expiresOn:'2026-11-17'},{expiresOn:null}]));
    await settle();
    expect(summaryValue('Quote terms')).toBe('Valid until Oct 9');
    fireEvent.change(within(panel('Quote terms')).getByLabelText('Valid until'),{target:{value:'2026-10-25'}});
    await waitFor(()=>expect(sent('PATCH',/\/terms$/)).toHaveLength(3));
    await settle();
    expect(screen.getByText(/Valid until Oct 25$/,{selector:'p'})).toBeInTheDocument();

    const po=within(terms).getByRole('textbox',{name:'Customer PO number'});
    fireEvent.change(po,{target:{value:'7781'}});
    fireEvent.keyDown(po,{key:'Enter'});
    fireEvent.blur(po);
    await waitFor(()=>expect(sent('PATCH',/\/terms$/)).toHaveLength(4));
    expect(sent('PATCH',/\/terms$/)[3]).toEqual({customerPo:'7781'});
    await settle();
    expect(summaryValue('Quote terms')).toBe('Valid until Oct 25 · PO 7781');

    const note=within(terms).getByRole('textbox',{name:'Note printed on the quote'});
    fireEvent.blur(note);
    fireEvent.change(note,{target:{value:'Straps ship from Ogden.'}});
    fireEvent.blur(note);
    await waitFor(()=>expect(sent('PATCH',/\/terms$/)).toHaveLength(5));
    expect(sent('PATCH',/\/terms$/)[4]).toEqual({customerNote:'Straps ship from Ogden.'});
  });
});

describe('Internal notes and Activity',()=>{
  it('adds a note for the team (not an empty one) and logs it in Activity, newest first',async()=>{
    renderPage();
    const notes=panel('Internal notes');
    fireEvent.click(within(notes).getByRole('button',{name:'Add note'}));
    expect(within(notes).getByRole('alert')).toHaveTextContent('Write a note first.');
    expect(calls('POST',/\/notes$/)).toHaveLength(0);
    fireEvent.change(within(notes).getByRole('textbox',{name:'Only your team sees these'}),{target:{value:'Dana usually takes the straps from Ogden.'}});
    fireEvent.click(within(notes).getByRole('button',{name:'Add note'}));
    await waitFor(()=>expect(sent('POST',/\/notes$/)).toEqual([{body:'Dana usually takes the straps from Ogden.'}]));
    await settle();
    expect(within(panel('Internal notes')).getByRole('list',{name:'Internal notes'})).toHaveTextContent('Dana usually takes the straps from Ogden.Brandi · Sep 25, 1:30 PM');
    expect(within(panel('Internal notes')).getByRole('textbox',{name:'Only your team sees these'})).toHaveValue('');
    expect(summaryValue('Internal notes')).toBe('1 note');
    const log=within(panel('Activity')).getByRole('list',{name:'Activity, newest first'});
    expect(within(log).getAllByRole('listitem').map(li=>li.textContent)).toEqual([
      'Sep 25, 1:30 PMBrandi added an internal note','Sep 23, 10:15 AMDraft quote built and sent to Brandi for review',
      'Sep 23, 10:14 AMQuerent matched 4 items after 1 clarifying question','Sep 23, 10:14 AMDana asked for bolts, cut-off wheels, gloves and straps in Querent chat',
    ]);
  });
});

describe('a sent quote',()=>{
  it('shows every panel read-only: no switching, no freight override, no terms or note edits',()=>{
    renderPage(detailOf({...server,override:{amount:40,reason:'Same route as Friday'},fulfillment:'delivery',notes:[{id:1,quote_id:'q-24817',rep_id:'brandi',rep_name:'Brandi Gallegos',body:'Called Dana.',created_at:SAVED_AT}]},
      {editable:false,valid_until:'2026-10-08',quote:{...detailOf(server).quote,status:'sent',revision:1,fulfillment:'delivery',valid_until:'2026-10-08',freight_override:40,freight_override_reason:'Same route as Friday'}}));
    const box=panel('Pickup or delivery');
    for(const radio of within(box).getAllByRole('radio'))expect(radio).toBeDisabled();
    expect(within(box).getByRole('combobox',{name:'Branch'})).toBeDisabled();
    expect(within(box).queryByRole('button')).toBeNull();
    expect(within(box).getByRole('region',{name:'Freight'})).toHaveTextContent('Freight (set by rep)$40.00');
    const terms=panel('Quote terms');
    expect(within(terms).getByLabelText('Valid until')).toBeDisabled();
    expect(within(terms).getByLabelText('Valid until')).toHaveValue('2026-10-08');
    expect(within(terms).queryByRole('button',{name:/Use the default/})).toBeNull();
    expect(within(terms).getByRole('textbox',{name:'Customer PO number'})).toBeDisabled();
    expect(within(terms).getByRole('textbox',{name:'Note printed on the quote'})).toBeDisabled();
    const notes=panel('Internal notes');
    expect(notes).toHaveTextContent('Called Dana.');
    expect(within(notes).queryByRole('textbox')).toBeNull();
    expect(within(notes).queryByRole('button')).toBeNull();
    expect(creditLine()).toMatch(/^Credit used, with this quote: \d+%$/);
  });
});
