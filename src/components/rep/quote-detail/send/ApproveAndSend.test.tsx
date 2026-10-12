import type {AnchorHTMLAttributes,ReactNode} from 'react';
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {QuoteDetail} from '@/server/rep/quote-detail';
import {CUSTOMERS} from '../../quotes/test-fixtures';
import {ITEMS,SAMPLE_LINES,detailLine,sampleDetail} from '../test-fixtures';

// Approve & send (task 3.7; spec §4, screen 07): the send dialog, the separate centered Confirm
// send, blockers that disable Send, one send per click, and what the page shows after. fetch is a
// small fake of the rep API: the quote detail, and POST .../send, which a test can hold open.

vi.mock('next/navigation',()=>({
  usePathname:()=>'/rep/quotes/Q-24817',
  useSearchParams:()=>new URLSearchParams('customer=wasatch'),
  useRouter:()=>({replace:vi.fn(),push:vi.fn(),refresh:vi.fn(),prefetch:vi.fn()}),
}));
vi.mock('next/link',()=>({default:({href,children,prefetch:_prefetch,...rest}:AnchorHTMLAttributes<HTMLAnchorElement>&{href:string;prefetch?:boolean;children?:ReactNode})=><a href={href} {...rest}>{children}</a>}));

const {RepShell}=await import('../../RepShell');
const {QuoteDetailView}=await import('../QuoteDetailView');

const SENT_AT='2026-09-25T18:00:05.000Z';
const sentDetail=()=>sampleDetail({editable:false,quote:{status:'sent',revision:1,sent_at:SENT_AT,valid_until:'2026-10-09',unread_for_customer:true},
  send_check:{can_send:false,status_problem:'Can\'t send Q-24817: it is Sent.',blockers:[],below_floor_count:1,subtotal:1122.4,total:1122.4,revision:2}});
const SENT={quote_id:'q-24817',quote_number:'Q-24817',revision:1,total:1122.4,valid_until:'2026-10-09',attach_pdf:true,headline:'Quote Q-24817 is ready: $1,122.40, valid until Oct 9',
  conversation_id:'conv-q-24817',message_id:'m-1'};

type Answer=()=>Response|Promise<Response>;
let api:{detail:QuoteDetail;send:Answer};
const fetchMock=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input),method=init?.method??'GET';
  if(url==='/api/rep/badges')return Response.json({quotes:0});
  if(url==='/api/rep/quotes/q-24817/read')return Response.json({id:'q-24817',quote_number:'Q-24817',unread:false});
  if(url==='/api/rep/quotes/q-24817/send'&&method==='POST')return api.send();
  if(url==='/api/rep/quotes/q-24817')return Response.json(api.detail);
  return Response.json({detail:'Not found.'},{status:404});
});
const sends=()=>fetchMock.mock.calls.filter(([url,init])=>String(url)==='/api/rep/quotes/q-24817/send'&&init?.method==='POST');
const sentBody=(i=0)=>JSON.parse(String(sends()[i][1]!.body));
const sentKey=(i=0)=>(sends()[i][1]!.headers as Record<string,string>)['idempotency-key'];
/** A promise the test settles by hand, to hold a request in flight. */
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}

beforeEach(()=>{
  api={detail:sampleDetail(),send:()=>Response.json({detail:sentDetail(),sent:SENT,replayed:false})};
  fetchMock.mockClear();vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>{vi.unstubAllGlobals();});

function renderPage(detail:QuoteDetail=sampleDetail()){
  api.detail=detail;
  return render(<RepShell rep={{id:'brandi',name:'Brandi Gallegos',initials:'BG',title:'Inside Sales'}} org="Herrick Industrial Supply"
    initialBadges={{quotes:0,attention:0}}><QuoteDetailView initial={detail}/></RepShell>);
}
/** Clicks Approve & send; a real click focuses the button first (jsdom doesn't). */
const approve=()=>{const button=screen.getByRole('button',{name:'Approve & send'});button.focus();fireEvent.click(button);};
const sendDialog=()=>screen.getByRole('dialog',{name:'Send quote to Dana Ortiz'});
const confirmDialog=()=>screen.getByRole('alertdialog',{name:'Confirm send'});
const settle=()=>act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});

describe('the send dialog (screen 07)',()=>{
  it('says who gets what, lists what is still open, and offers Querent chat only with Attach PDF on',()=>{
    renderPage();
    approve();
    const dialog=sendDialog();
    expect(dialog).toHaveAttribute('aria-modal','true');
    expect(dialog).toHaveAccessibleDescription('4 items · $1,122.40 before tax · Will call at SLC, Thu Sep 24 · valid until Oct 9');
    expect(within(dialog).getByText(/^Still open:/)).toHaveTextContent(
      'Still open: Nitrile disposable gloves: 26.6% margin, below Brandi\'s 30% Safety & PPE floor; Ratchet strap 2 in x 27 ft: short 5 at SLC. 20 at Ogden. 24 on order at SLC, due Sep 26. You can send anyway.');
    const via=within(dialog).getByRole('group',{name:'Send by'});
    expect(within(via).getAllByRole('checkbox').map(box=>(box as HTMLInputElement).labels?.[0]?.textContent)).toEqual(['Querent chat','Attach PDF']);
    expect(within(via).getByRole('checkbox',{name:'Querent chat'})).toBeChecked();
    expect(within(via).getByRole('checkbox',{name:'Querent chat'})).toBeDisabled();
    expect(within(via).getByRole('checkbox',{name:'Attach PDF'})).toBeChecked();
    expect(within(dialog).queryByText(/Email|Text/)).toBeNull();
    expect(within(via).getByRole('link',{name:'Preview PDF'})).toHaveAttribute('href','/api/quotes/q-24817/pdf?variant=customer&rev=draft');
    const message=within(dialog).getByRole('textbox',{name:'Message to Dana'});
    expect(message).toHaveValue('Hi Dana, your quote is ready: 4 items, $1,122.40 before tax, pickup at SLC on Thu, Sep 24. You can accept it or ask for changes from the link. Thanks, Brandi');
    expect(message).toHaveFocus();
    expect(message).toHaveAccessibleDescription('Dana’s chat shows it under “Quote Q-24817 is ready: $1,122.40, valid until Oct 9 — View quote”.');
    expect(within(dialog).getByRole('button',{name:'Send quote'})).toBeEnabled();
  });

  it('Cancel and Escape close it, sending nothing, and focus goes back to Approve & send',()=>{
    renderPage();
    approve();
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Cancel'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button',{name:'Approve & send'})).toHaveFocus();
    approve();
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sends()).toHaveLength(0);
  });

  it('keeps Tab inside the dialog',()=>{
    renderPage();
    approve();
    const dialog=sendDialog();
    const send=within(dialog).getByRole('button',{name:'Send quote'});
    send.focus();
    fireEvent.keyDown(document,{key:'Tab'});
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(within(dialog).getByRole('checkbox',{name:'Attach PDF'})).toHaveFocus();
  });
});

describe('blockers disable Send',()=>{
  it('lists why the quote can’t go and disables Send quote; nothing is sent',()=>{
    const lines=[...SAMPLE_LINES.slice(0,3),detailLine(ITEMS.straps,{n:4,qty:12,unit_price:null,price_basis:null})];
    renderPage(sampleDetail({lines,send_check:{can_send:false,status_problem:null,blockers:[{code:'no_price',line_id:'q-24817-4',message:'Line 4 (RS-2-27-JH) has no price.'}],
      below_floor_count:1,subtotal:847,total:847,revision:1}}));
    approve();
    const dialog=sendDialog();
    const blocked=within(dialog).getAllByRole('alert')[0];
    expect(blocked).toHaveTextContent('Can’t send yet:Line 4 (RS-2-27-JH) has no price.');
    const send=within(dialog).getByRole('button',{name:'Send quote'});
    expect(send).toBeDisabled();
    expect(send).toHaveAccessibleDescription('Can’t send yet: Line 4 (RS-2-27-JH) has no price.');
    fireEvent.click(send);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(sends()).toHaveLength(0);
  });

  it('waits for edits that are still saving before it lets the rep send',async()=>{
    const save=deferred<Response>();
    fetchMock.mockImplementationOnce(async()=>save.promise);
    renderPage();
    const qty=screen.getByRole('textbox',{name:'Quantity for HCS-12-13-2G8'});
    fireEvent.change(qty,{target:{value:'11'}});
    fireEvent.blur(qty);
    approve();
    expect(within(sendDialog()).getByRole('button',{name:'Send quote'})).toBeDisabled();
    expect(within(sendDialog()).getByRole('status')).toHaveTextContent('Saving your changes…');
    await act(async()=>{save.resolve(Response.json(sampleDetail()));});
    await settle();
    expect(within(sendDialog()).getByRole('button',{name:'Send quote'})).toBeEnabled();
  });
});

describe('Confirm send',()=>{
  it('is a separate, centered dialog that repeats the quote and revision, recipient, total and below-floor count',()=>{
    renderPage();
    approve();
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Send quote'}));
    expect(screen.queryByRole('dialog',{name:'Send quote to Dana Ortiz'})).toBeNull();
    const confirm=confirmDialog();
    expect(confirm).toHaveAttribute('aria-modal','true');
    expect(confirm).toHaveAccessibleDescription('Quote Q-24817 rev 1 To Dana Ortiz, Wasatch Mechanical Contractors Querent chat, PDF attached Total $1,122.40 before tax Below floor 1 line a warning only');
    const [cancel,send]=within(confirm).getAllByRole('button');
    expect([cancel.textContent,send.textContent]).toEqual(['Cancel','Send']);
    // Red Cancel, Querent-green Send (Send.module.css .cancel / .go).
    expect(cancel.className).toMatch(/cancel/);
    expect(send.className).toMatch(/go/);
    expect(confirm).toHaveFocus();
    expect(sends()).toHaveLength(0);
  });

  it('Cancel goes back to the send dialog with the message and Attach PDF as the rep left them',()=>{
    renderPage();
    approve();
    const message=within(sendDialog()).getByRole('textbox',{name:'Message to Dana'});
    fireEvent.change(message,{target:{value:'Hi Dana, updated pricing attached.'}});
    fireEvent.click(within(sendDialog()).getByRole('checkbox',{name:'Attach PDF'}));
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Send quote'}));
    expect(confirmDialog()).toHaveTextContent('Querent chat');
    expect(confirmDialog()).not.toHaveTextContent('PDF attached');
    fireEvent.click(within(confirmDialog()).getByRole('button',{name:'Cancel'}));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(sendDialog()).getByRole('textbox',{name:'Message to Dana'})).toHaveValue('Hi Dana, updated pricing attached.');
    expect(within(sendDialog()).getByRole('checkbox',{name:'Attach PDF'})).not.toBeChecked();
    expect(within(sendDialog()).getByRole('button',{name:'Send quote'})).toHaveFocus();
    expect(sends()).toHaveLength(0);
  });

  it('shows “None” with no line below floor',()=>{
    renderPage(sampleDetail({send_check:{can_send:true,status_problem:null,blockers:[],below_floor_count:0,subtotal:1122.4,total:1122.4,revision:1}}));
    approve();
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Send quote'}));
    expect(confirmDialog()).toHaveTextContent('Below floorNone');
  });
});

describe('sending',()=>{
  it('a double click on Send sends once, with what the rep confirmed, then shows the quote as sent',async()=>{
    const answer=deferred<Response>();
    api.send=()=>answer.promise;
    renderPage();
    approve();
    fireEvent.change(within(sendDialog()).getByRole('textbox',{name:'Message to Dana'}),{target:{value:'  Hi Dana,\n\nhere it is.  '}});
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Send quote'}));
    const send=within(confirmDialog()).getByRole('button',{name:'Send'});
    fireEvent.click(send);
    fireEvent.click(send);
    await settle();
    expect(sends()).toHaveLength(1);
    expect(sentBody()).toEqual({message:'  Hi Dana,\n\nhere it is.  ',attach_pdf:true,revision:1,total:1122.4});
    expect(sentKey()).toMatch(/\S{8,}/);
    expect(within(confirmDialog()).getByRole('button',{name:'Sending…'})).toBeDisabled();
    expect(within(confirmDialog()).getByRole('button',{name:'Cancel'})).toBeDisabled();
    await act(async()=>{answer.resolve(Response.json({detail:sentDetail(),sent:SENT,replayed:false}));});
    await settle();
    expect(sends()).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByText('Sent Q-24817 rev 1 to Dana in Querent chat')).toBeInTheDocument();
    expect(screen.getByText(/^Sent to Dana as rev 1 on Sep 25\./)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Approve & send'})).toBeDisabled();
  });

  it('two clicks before the page re-renders (Send still enabled for both) still send once',async()=>{
    renderPage();
    approve();
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Send quote'}));
    const send=within(confirmDialog()).getByRole('button',{name:'Send'});
    await act(async()=>{send.click();send.click();send.click();});
    await settle();
    expect(sends()).toHaveLength(1);
  });

  it('sends Attach PDF off when the rep unticks it',async()=>{
    renderPage();
    approve();
    fireEvent.click(within(sendDialog()).getByRole('checkbox',{name:'Attach PDF'}));
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Send quote'}));
    fireEvent.click(within(confirmDialog()).getByRole('button',{name:'Send'}));
    await settle();
    expect(sentBody()).toMatchObject({attach_pdf:false});
  });

  it('a conflict (the quote changed mid-send) says to review and send again, reloads the quote, and the retry is a new send',async()=>{
    api.send=()=>Response.json({detail:'Q-24817 was edited while it was being sent. Review it and send again.',code:'conflict'},{status:409});
    renderPage();
    approve();
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Send quote'}));
    // Meanwhile another tab changed the total: the reload brings it in.
    api.detail=sampleDetail({send_check:{can_send:true,status_problem:null,blockers:[],below_floor_count:1,subtotal:1150,total:1150,revision:1}});
    fireEvent.click(within(confirmDialog()).getByRole('button',{name:'Send'}));
    await settle();await settle();
    expect(within(confirmDialog()).getByRole('alert')).toHaveTextContent('Q-24817 was edited while it was being sent. Review it and send again.');
    expect(confirmDialog()).toHaveTextContent('Total$1,150.00');
    api.send=()=>Response.json({detail:sentDetail(),sent:SENT,replayed:false});
    fireEvent.click(within(confirmDialog()).getByRole('button',{name:'Send'}));
    await settle();
    expect(sends()).toHaveLength(2);
    expect(sentBody(1)).toMatchObject({total:1150});
    expect(sentKey(1)).not.toBe(sentKey(0));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('no answer: says it may not have gone, and the retry reuses the key so it can’t send twice',async()=>{
    let calls=0;
    api.send=()=>{calls++;if(calls===1)throw new TypeError('Failed to fetch');return Response.json({detail:sentDetail(),sent:SENT,replayed:true});};
    renderPage();
    approve();
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Send quote'}));
    fireEvent.click(within(confirmDialog()).getByRole('button',{name:'Send'}));
    await settle();
    expect(within(confirmDialog()).getByRole('alert')).toHaveTextContent('No answer from the server, so Q-24817 may not have gone yet. Press Send again: it won’t be sent twice.');
    fireEvent.click(within(confirmDialog()).getByRole('button',{name:'Send'}));
    await settle();
    expect(sends()).toHaveLength(2);
    expect(sentKey(1)).toBe(sentKey(0));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('already sent from elsewhere: shows why and disables Send',async()=>{
    api.send=()=>Response.json({detail:'Can\'t send Q-24817: it is Sent.',code:'illegal_transition'},{status:409});
    renderPage();
    approve();
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Send quote'}));
    api.detail=sentDetail();
    fireEvent.click(within(confirmDialog()).getByRole('button',{name:'Send'}));
    await settle();await settle();
    expect(within(confirmDialog()).getByRole('alert')).toHaveTextContent('Can\'t send Q-24817: it is Sent.');
    expect(within(confirmDialog()).getByRole('button',{name:'Send'})).toBeDisabled();
    fireEvent.click(within(confirmDialog()).getByRole('button',{name:'Cancel'}));
    expect(screen.getByText(/^Sent to Dana as rev 1/)).toBeInTheDocument();
  });

  it('blocked on the server (422): back to the send dialog, where the reasons show and Send quote is disabled',async()=>{
    const blockedLines=[...SAMPLE_LINES.slice(0,3),detailLine(ITEMS.straps,{n:4,qty:0,unit_price:22.95,price_basis:'customer'})];
    api.send=()=>Response.json({detail:'Can\'t send Q-24817 yet. Line 4 (RS-2-27-JH) has a quantity of 0.',code:'send_blocked',
      blockers:[{code:'zero_qty',line_id:'q-24817-4',message:'Line 4 (RS-2-27-JH) has a quantity of 0.'}]},{status:422});
    renderPage();
    approve();
    fireEvent.click(within(sendDialog()).getByRole('button',{name:'Send quote'}));
    api.detail=sampleDetail({lines:blockedLines,send_check:{can_send:false,status_problem:null,blockers:[{code:'zero_qty',line_id:'q-24817-4',message:'Line 4 (RS-2-27-JH) has a quantity of 0.'}],
      below_floor_count:1,subtotal:847,total:847,revision:1}});
    fireEvent.click(within(confirmDialog()).getByRole('button',{name:'Send'}));
    await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
    const dialog=sendDialog();
    expect(within(dialog).getAllByRole('alert').map(a=>a.textContent)).toEqual(['Can’t send yet:Line 4 (RS-2-27-JH) has a quantity of 0.','Can\'t send Q-24817 yet. Line 4 (RS-2-27-JH) has a quantity of 0.']);
    expect(within(dialog).getByRole('button',{name:'Send quote'})).toBeDisabled();
  });
});
