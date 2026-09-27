import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {CustomerQuotePreview} from '@/domain';
import {fakeApi} from '../test-fixtures';
import {emitOpenQuote} from '../open-quote';
import {QUOTES_CHANGED_EVENT} from '../quotes-changed';
import {QuotePreview} from './QuotePreview';
import {NOW,previews} from './test-fixtures';

// Accept / Request changes in the PDF preview modal (spec §3, §5.4; task 5.2): the action bar, both
// forms (branch and pickup or delivery locked on Accept), the centered Confirm dialogs (red Cancel,
// Querent-green Send) and what happens after Send. NOW is Thu Sep 24, 6:00 AM Mountain time.

vi.mock('./PdfPages',()=>({PdfPages:({url,label}:{url:string;label:string})=><div role="document" aria-label={label} data-url={url}/>}));
const post=vi.hoisted(()=>vi.fn());
vi.mock('./respond',async original=>({...(await original<typeof import('./respond')>()),postResponse:post}));
const {ResponseRefused}=await import('./respond');

const ACCEPTED:CustomerQuotePreview={...previews.sent,status:'accepted',response:{kind:'accepted',revision:1,fulfillment_time:'2026-09-29T16:00:00.000Z',customer_po:'7781'}};
const CHANGES:CustomerQuotePreview={...previews.sent,status:'changes_requested',response:{kind:'changes_requested',revision:1,note:'Make the bolts 12 boxes.'}};

function open(preview:CustomerQuotePreview|Record<string,unknown>=previews.sent){
  const api=fakeApi({'customer/quotes/q-24817':preview});
  render(<QuotePreview api={api} now={NOW}/>);
  act(()=>emitOpenQuote({id:'q-24817',quote_number:'Q-24817'}));
  return api;
}
async function modal(){
  const dialog=await screen.findByRole('dialog',{name:'Quote Q-24817'});
  await within(dialog).findByRole('document');
  return dialog;
}
const bar=(dialog:HTMLElement)=>within(within(dialog).getByRole('group',{name:'Respond to this quote'}));
async function fillAccept(dialog:HTMLElement,{day='2026-09-29',time='10:00',po='7781'}={}){
  fireEvent.click(bar(dialog).getByRole('button',{name:'Accept'}));
  const form=within(dialog).getByRole('form',{name:'Accept Q-24817 rev 1'});
  fireEvent.change(within(form).getByLabelText('Pickup day'),{target:{value:day}});
  fireEvent.change(within(form).getByLabelText('Pickup time'),{target:{value:time}});
  fireEvent.change(within(form).getByLabelText('PO number'),{target:{value:po}});
  return form;
}
const confirm=(name:string)=>screen.getByRole('alertdialog',{name});

beforeEach(()=>{post.mockReset();});

describe('the action bar',()=>{
  it('on the latest sent revision: Accept and Request changes are on, and the chat placeholder is gone',async()=>{
    open();
    const dialog=await modal();
    expect(bar(dialog).getByRole('button',{name:'Accept'})).toBeEnabled();
    expect(bar(dialog).getByRole('button',{name:'Request changes'})).toBeEnabled();
    expect(bar(dialog).getByRole('button',{name:'Accept'})).toHaveAccessibleDescription('Accept it with a pickup time and your PO, or ask Brandi for changes.');
    expect(within(dialog).queryByText(/reply to Brandi in chat/)).toBeNull();
  });

  it.each([
    ['expired',previews.expired,'This quote expired: it was valid until Oct 7. Ask Brandi for a new one.'],
    ['an older revision',{...previews.older,shown:{...previews.older.shown}},'Revision 2 replaced this one.'],
    ['accepted',ACCEPTED,'You accepted rev 1 with PO 7781: pickup Tue Sep 29, 10:00 AM at SLC.'],
    ['changes requested',CHANGES,'You asked for changes to rev 1. Brandi is revising the quote.'],
  ] as const)('is off when %s, and says why',async(_,preview,note)=>{
    open(preview);
    const dialog=await modal();
    expect(bar(dialog).getByRole('button',{name:'Accept'})).toBeDisabled();
    expect(bar(dialog).getByRole('button',{name:'Request changes'})).toBeDisabled();
    expect(bar(dialog).getByRole('button',{name:'Accept'})).toHaveAccessibleDescription(note);
  });

  it('shows Dana’s own change request note while Brandi revises',async()=>{
    open(CHANGES);
    const dialog=await modal();
    expect(bar(dialog).getByText('Make the bolts 12 boxes.',{selector:'q'})).toBeInTheDocument();
  });
});

describe('Accept',()=>{
  it('opens a form with branch and pickup locked, the date starting at the earliest open day, and the rep’s PO to start from',async()=>{
    open({...previews.sent,shown:{...previews.sent.shown,customer_po:'WMC-1'}});
    const dialog=await modal();
    fireEvent.click(bar(dialog).getByRole('button',{name:'Accept'}));
    const form=within(dialog).getByRole('form',{name:'Accept Q-24817 rev 1'});
    expect(within(form).getByText('$1,122.40 before tax')).toBeInTheDocument();
    const pickup=within(form).getByRole('radio',{name:'Pickup'});
    expect(pickup).toBeChecked();
    expect(pickup).toBeDisabled();
    expect(within(form).getByRole('radio',{name:'Delivery'})).toBeDisabled();
    expect(within(form).getByRole('combobox',{name:'Branch'})).toHaveValue('SLC');
    expect(within(form).getByRole('combobox',{name:'Branch'})).toBeDisabled();
    expect(form).toHaveTextContent('Set by Brandi on this quote. To change the branch or pickup, use Request changes.');
    const day=within(form).getByLabelText('Pickup day');
    expect(day).toHaveFocus();
    expect(day).toHaveAttribute('type','date');
    expect(day).toHaveAttribute('min','2026-09-24');
    expect(day).toHaveAttribute('max','2026-11-23');
    expect(within(form).getByLabelText('PO number')).toHaveValue('WMC-1');
    // The action bar's buttons give way to the form.
    expect(bar(dialog).queryByRole('button',{name:'Accept'})).toBeNull();
  });

  it('a delivery quote says delivery, and where it goes',async()=>{
    open(previews.delivery);
    const dialog=await modal();
    fireEvent.click(bar(dialog).getByRole('button',{name:'Accept'}));
    const form=within(dialog).getByRole('form',{name:'Accept Q-24817 rev 1'});
    expect(within(form).getByRole('radio',{name:'Delivery'})).toBeChecked();
    expect(within(form).getByLabelText('Delivery day')).toBeInTheDocument();
    expect(form).toHaveTextContent('Delivers to 1800 W 10950 S, South Jordan, UT 84095.');
  });

  it('offers only the slots left on the chosen day, and says at once why a weekend or past day won’t do',async()=>{
    open();
    const dialog=await modal();
    const form=await fillAccept(dialog,{day:'2026-09-26',time:'',po:''});
    expect(within(form).getByRole('alert')).toHaveTextContent('Pickup is Monday to Friday. Choose a weekday.');
    fireEvent.change(within(form).getByLabelText('Pickup day'),{target:{value:'2026-09-24'}});
    expect(within(form).queryByRole('alert')).toBeNull();
    const options=within(within(form).getByLabelText('Pickup time')).getAllByRole('option').map(o=>o.textContent);
    expect(options[0]).toBe('Choose a time');
    expect(options[1]).toBe('7:00 AM');
    expect(options.at(-1)).toBe('4:00 PM');
  });

  it('won’t go on without a time or a PO',async()=>{
    open();
    const dialog=await modal();
    const form=await fillAccept(dialog,{time:'',po:''});
    fireEvent.click(within(form).getByRole('button',{name:'Review and accept'}));
    expect(within(form).getByRole('alert')).toHaveTextContent('Choose a pickup time.');
    fireEvent.change(within(form).getByLabelText('Pickup time'),{target:{value:'10:00'}});
    fireEvent.click(within(form).getByRole('button',{name:'Review and accept'}));
    expect(within(form).getByRole('alert')).toHaveTextContent('Enter your PO number.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('Confirm repeats what will be sent; Cancel goes back to the form as it was',async()=>{
    open();
    const dialog=await modal();
    const form=await fillAccept(dialog);
    fireEvent.click(within(form).getByRole('button',{name:'Review and accept'}));
    const c=confirm('Confirm acceptance');
    expect(c).toHaveAccessibleDescription('Accept Q-24817 rev 1 for $1,122.40, pickup Tue Sep 29, 10:00 AM at SLC, PO 7781?');
    expect([...c.querySelectorAll('dt')].map(d=>`${d.textContent}: ${d.nextElementSibling!.textContent}`)).toEqual([
      'Quote: Q-24817 rev 1','Total: $1,122.40before tax','Pickup: Tue Sep 29, 10:00 AM at SLC','PO: 7781','To: Brandi Gallegos']);
    expect(within(c).getByRole('button',{name:'Cancel'})).toHaveClass('qc-cancel');
    expect(within(c).getByRole('button',{name:'Send'})).toHaveClass('qc-send');
    fireEvent.click(within(c).getByRole('button',{name:'Cancel'}));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(form).getByLabelText('PO number')).toHaveValue('7781');
    expect(within(form).getByLabelText('Pickup time')).toHaveValue('10:00');
    expect(post).not.toHaveBeenCalled();
  });

  it('Send accepts the revision on screen once, then the modal shows it accepted and the sidebar is told',async()=>{
    let resolve:(value:unknown)=>void=()=>{};
    post.mockReturnValue(new Promise(r=>{resolve=r;}));
    const changed=vi.fn();
    window.addEventListener(QUOTES_CHANGED_EVENT,changed);
    open();
    const dialog=await modal();
    fireEvent.click(within(await fillAccept(dialog)).getByRole('button',{name:'Review and accept'}));
    const send=within(confirm('Confirm acceptance')).getByRole('button',{name:'Send'});
    fireEvent.click(send);
    fireEvent.click(send);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('q-24817','accept',{revision:1,day:'2026-09-29',time:'10:00',po:'7781'},expect.any(String));
    expect(within(confirm('Confirm acceptance')).getByRole('button',{name:'Sending…'})).toBeDisabled();
    await act(async()=>resolve({quote:ACCEPTED,replayed:false}));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(dialog).getByText('Accepted',{selector:'.cx-chip'})).toBeInTheDocument();
    const note=bar(dialog).getByText('You accepted rev 1 with PO 7781: pickup Tue Sep 29, 10:00 AM at SLC.');
    expect(note).toHaveFocus();
    expect(bar(dialog).getByRole('button',{name:'Accept'})).toBeDisabled();
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener(QUOTES_CHANGED_EVENT,changed);
  });

  it('no answer: the Confirm stays with a retry, and Send again reuses the key so it can’t go twice',async()=>{
    post.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce({quote:ACCEPTED,replayed:true});
    open();
    const dialog=await modal();
    fireEvent.click(within(await fillAccept(dialog)).getByRole('button',{name:'Review and accept'}));
    fireEvent.click(within(confirm('Confirm acceptance')).getByRole('button',{name:'Send'}));
    expect(await within(confirm('Confirm acceptance')).findByRole('alert')).toHaveTextContent('No answer from the server, so your acceptance may not have gone through. Press Send again: it won’t be sent twice.');
    fireEvent.click(within(confirm('Confirm acceptance')).getByRole('button',{name:'Send'}));
    await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(post.mock.calls[1][3]).toBe(post.mock.calls[0][3]);
  });

  it('a refused input goes back to the form with the reason',async()=>{
    post.mockRejectedValue(new ResponseRefused('Choose a pickup time at least an hour from now.',400,'invalid_input'));
    open();
    const dialog=await modal();
    const form=await fillAccept(dialog);
    fireEvent.click(within(form).getByRole('button',{name:'Review and accept'}));
    fireEvent.click(within(confirm('Confirm acceptance')).getByRole('button',{name:'Send'}));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Choose a pickup time at least an hour from now.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('when the quote moved on (a newer revision, expired, answered elsewhere) it says so and reloads the quote',async()=>{
    post.mockRejectedValue(new ResponseRefused('Q-24817 rev 1 is out of date: rev 2 is the latest. Review it first.',409,'conflict'));
    const api=open();
    const dialog=await modal();
    fireEvent.click(within(await fillAccept(dialog)).getByRole('button',{name:'Review and accept'}));
    fireEvent.click(within(confirm('Confirm acceptance')).getByRole('button',{name:'Send'}));
    expect(await bar(dialog).findByRole('alert')).toHaveTextContent('Q-24817 rev 1 is out of date: rev 2 is the latest. Review it first.');
    expect(within(dialog).queryByRole('form')).toBeNull();
    await waitFor(()=>expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('Escape closes the Confirm only, then backs out of the form, then closes the modal',async()=>{
    open();
    const dialog=await modal();
    fireEvent.click(within(await fillAccept(dialog)).getByRole('button',{name:'Review and accept'}));
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(dialog).getByRole('form',{name:'Accept Q-24817 rev 1'})).toBeInTheDocument();
    fireEvent.keyDown(document,{key:'Escape'});
    expect(within(dialog).queryByRole('form')).toBeNull();
    expect(bar(dialog).getByRole('button',{name:'Accept'})).toHaveFocus();
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a click outside backs out of the form and keeps what was typed; a click outside the Confirm does nothing',async()=>{
    open();
    const dialog=await modal();
    const form=await fillAccept(dialog);
    fireEvent.click(within(form).getByRole('button',{name:'Review and accept'}));
    fireEvent.mouseDown(confirm('Confirm acceptance').parentElement!);
    expect(confirm('Confirm acceptance')).toBeInTheDocument();
    fireEvent.click(within(confirm('Confirm acceptance')).getByRole('button',{name:'Cancel'}));
    fireEvent.mouseDown(dialog.parentElement!);
    expect(screen.getByRole('dialog',{name:'Quote Q-24817'})).toBeInTheDocument();
    expect(within(dialog).queryByRole('form')).toBeNull();
    fireEvent.click(bar(dialog).getByRole('button',{name:'Accept'}));
    expect(within(dialog).getByLabelText('PO number')).toHaveValue('7781');
    expect(within(dialog).getByLabelText('Pickup day')).toHaveValue('2026-09-29');
  });

  it('keeps Tab inside the Confirm while it is open',async()=>{
    open();
    const dialog=await modal();
    fireEvent.click(within(await fillAccept(dialog)).getByRole('button',{name:'Review and accept'}));
    const c=confirm('Confirm acceptance');
    const cancel=within(c).getByRole('button',{name:'Cancel'}),send=within(c).getByRole('button',{name:'Send'});
    send.focus();
    fireEvent.keyDown(document,{key:'Tab'});
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(document,{key:'Tab',shiftKey:true});
    expect(send).toHaveFocus();
  });
});

describe('Request changes',()=>{
  it('needs a note, then Confirm repeats it and Send asks for changes on the revision on screen',async()=>{
    post.mockResolvedValue({quote:CHANGES,replayed:false});
    open();
    const dialog=await modal();
    fireEvent.click(bar(dialog).getByRole('button',{name:'Request changes'}));
    const form=within(dialog).getByRole('form',{name:'Request changes to Q-24817 rev 1'});
    const field=within(form).getByLabelText('What should Brandi change?');
    expect(field).toHaveFocus();
    fireEvent.click(within(form).getByRole('button',{name:'Review request'}));
    expect(within(form).getByRole('alert')).toHaveTextContent('Say what should change: a note is required.');
    fireEvent.change(field,{target:{value:'  Make the bolts 12 boxes.\n\nThanks '}});
    expect(form).toHaveTextContent('35/1,000');
    fireEvent.click(within(form).getByRole('button',{name:'Review request'}));
    const c=confirm('Confirm change request');
    expect(c).toHaveAccessibleDescription('Send your change request for Q-24817 rev 1 to Brandi?');
    expect([...c.querySelectorAll('dt')].map(d=>`${d.textContent}: ${d.nextElementSibling!.textContent}`)).toEqual([
      'Quote: Q-24817 rev 1','To: Brandi Gallegos','Note: Make the bolts 12 boxes.\n\nThanks']);
    fireEvent.click(within(c).getByRole('button',{name:'Send'}));
    expect(post).toHaveBeenCalledWith('q-24817','request-changes',{revision:1,note:'Make the bolts 12 boxes.\n\nThanks'},expect.any(String));
    await waitFor(()=>expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(within(dialog).getByText('Changes requested',{selector:'.cx-chip'})).toBeInTheDocument();
    expect(bar(dialog).getByText('You asked for changes to rev 1. Brandi is revising the quote.')).toHaveFocus();
    expect(bar(dialog).getByRole('button',{name:'Request changes'})).toBeDisabled();
  });

  it('says “your rep” when the quote has none on file',async()=>{
    open({...previews.sent,rep:null});
    const dialog=await modal();
    fireEvent.click(bar(dialog).getByRole('button',{name:'Request changes'}));
    const form=within(dialog).getByRole('form',{name:'Request changes to Q-24817 rev 1'});
    expect(within(form).getByLabelText('What should your rep change?')).toBeInTheDocument();
    expect(form).toHaveTextContent('Your rep revises the quote and sends it back here in chat.');
  });

  it('a form left open past valid-until closes, and the bar says the quote expired',async()=>{
    const api=fakeApi({'customer/quotes/q-24817':previews.sent});
    const {rerender}=render(<QuotePreview api={api} now={NOW}/>);
    act(()=>emitOpenQuote({id:'q-24817',quote_number:'Q-24817'}));
    const dialog=await modal();
    fireEvent.click(bar(dialog).getByRole('button',{name:'Request changes'}));
    expect(within(dialog).getByRole('form')).toBeInTheDocument();
    rerender(<QuotePreview api={api} now="2026-10-08T00:00:00.000Z"/>);
    await waitFor(()=>expect(within(dialog).queryByRole('form')).toBeNull());
    expect(bar(dialog).getByRole('button',{name:'Request changes'})).toBeDisabled();
    expect(bar(dialog).getByText('This quote expired: it was valid until Oct 7. Ask Brandi for a new one.')).toBeInTheDocument();
  });

  it('Back returns to the bar and focuses Request changes',async()=>{
    open();
    const dialog=await modal();
    fireEvent.click(bar(dialog).getByRole('button',{name:'Request changes'}));
    fireEvent.click(within(dialog).getByRole('button',{name:'Back'}));
    expect(bar(dialog).getByRole('button',{name:'Request changes'})).toHaveFocus();
  });
});
