import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {CustomerQuotePreview} from '@/domain';
import {fakeApi} from '../test-fixtures';
import {emitOpenQuote} from '../open-quote';
import {QUOTES_CHANGED_EVENT} from '../quotes-changed';
import {QuotePreview} from './QuotePreview';
import {NOW,previews} from './test-fixtures';

// Decline in the PDF preview modal (v3 spec §2.1, §6; decisions 13 to 15; task A1): the action bar's
// Decline opens a centered dialog with the five reasons as radio buttons (no "no response"), a
// 250-character plain field for Other, a red Cancel and an X that change nothing, and a confirm
// button labelled Decline that records the decline even with no reason chosen.

vi.mock('./PdfPages',()=>({PdfPages:({url,label}:{url:string;label:string})=><div role="document" aria-label={label} data-url={url}/>}));
const post=vi.hoisted(()=>vi.fn());
vi.mock('./respond',async original=>({...(await original<typeof import('./respond')>()),postResponse:post}));
const {ResponseRefused}=await import('./respond');

const DECLINED:CustomerQuotePreview={...previews.sent,status:'declined',response:{kind:'declined',revision:1}};
const REASONS=['Price too high','Found other source','Need it sooner than quoted','Wrong items or quantity','Other'];

function open(preview:CustomerQuotePreview=previews.sent){
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
const declineDialog=()=>screen.getByRole('alertdialog',{name:'Decline quote'});
async function startDecline(){
  const dialog=await modal();
  fireEvent.click(bar(dialog).getByRole('button',{name:'Decline'}));
  return {dialog,decline:declineDialog()};
}

beforeEach(()=>{post.mockReset();});

describe('the Decline button',()=>{
  it('sits in the action bar with Accept and Request changes, on while the quote waits for an answer',async()=>{
    open();
    const dialog=await modal();
    expect(bar(dialog).getAllByRole('button').map(b=>b.textContent)).toEqual(['Decline','Request changes','Accept']);
    expect(bar(dialog).getByRole('button',{name:'Decline'})).toBeEnabled();
  });

  it.each([['expired',previews.expired],['accepted',previews.accepted],['declined',DECLINED]] as const)('is off when %s',async(_,preview)=>{
    open(preview);
    const dialog=await modal();
    expect(bar(dialog).getByRole('button',{name:'Decline'})).toBeDisabled();
  });
});

describe('the Decline dialog',()=>{
  it('is centered over the modal with the five reasons, none chosen, and no “no response” option',async()=>{
    open();
    const {decline}=await startDecline();
    expect(decline).toHaveAccessibleDescription('Decline Q-24817 rev 1? Telling Brandi why is optional.');
    expect(decline).toHaveClass('qc-dialog');
    const radios=within(decline).getAllByRole('radio');
    expect(radios.map(r=>r.closest('label')!.textContent)).toEqual(REASONS);
    for(const r of radios)expect(r).not.toBeChecked();
    expect(within(decline).queryByText(/no response/i)).toBeNull();
    expect(within(decline).queryByRole('textbox')).toBeNull();
    expect(within(decline).getByRole('button',{name:'Cancel'})).toHaveClass('qc-cancel');
    expect(within(decline).getByRole('button',{name:'Decline'})).toHaveClass('qc-send');
    expect(within(decline).getByRole('button',{name:'Close'})).toBeInTheDocument();
  });

  it('Other shows a plain 250-character field with a counter',async()=>{
    open();
    const {decline}=await startDecline();
    fireEvent.click(within(decline).getByRole('radio',{name:'Other'}));
    const field=within(decline).getByRole('textbox',{name:'Tell Brandi more (optional)'});
    expect(field).toHaveAttribute('maxLength','250');
    expect(within(decline).getByText('0/250')).toBeInTheDocument();
    fireEvent.change(field,{target:{value:'Went with a local shop'}});
    expect(within(decline).getByText('22/250')).toBeInTheDocument();
  });

  it.each(['Cancel','Close'])('%s dismisses it with no change',async name=>{
    open();
    const {dialog,decline}=await startDecline();
    fireEvent.click(within(decline).getByRole('radio',{name:'Price too high'}));
    fireEvent.click(within(decline).getByRole('button',{name}));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(post).not.toHaveBeenCalled();
    expect(bar(dialog).getByRole('button',{name:'Decline'})).toBeEnabled();
    expect(within(dialog).getByText('Sent',{selector:'.cx-chip'})).toBeInTheDocument();
    // Opening it again starts over.
    fireEvent.click(bar(dialog).getByRole('button',{name:'Decline'}));
    for(const r of within(declineDialog()).getAllByRole('radio'))expect(r).not.toBeChecked();
  });

  it('Escape dismisses it with no change',async()=>{
    open();
    const {dialog}=await startDecline();
    fireEvent.keyDown(document.activeElement??document.body,{key:'Escape'});
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('dialog',{name:'Quote Q-24817'})).toBe(dialog);
    expect(post).not.toHaveBeenCalled();
  });

  it('Decline with no reason records the decline once; the modal reads Declined and the sidebar is told',async()=>{
    let resolve:(value:unknown)=>void=()=>{};
    post.mockReturnValue(new Promise(r=>{resolve=r;}));
    const changed=vi.fn();
    window.addEventListener(QUOTES_CHANGED_EVENT,changed);
    open();
    const {dialog,decline}=await startDecline();
    const confirm=within(decline).getByRole('button',{name:'Decline'});
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('q-24817','decline',{revision:1,reason:null},expect.any(String));
    expect(within(declineDialog()).getByRole('button',{name:'Declining…'})).toBeDisabled();
    await act(async()=>resolve({quote:DECLINED,replayed:false}));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(within(dialog).getByText('Declined',{selector:'.cx-chip'})).toBeInTheDocument();
    expect(bar(dialog).getByText('You declined rev 1. Ask Brandi for a new quote if you still need these items.')).toHaveFocus();
    for(const name of ['Decline','Request changes','Accept'])expect(bar(dialog).getByRole('button',{name})).toBeDisabled();
    expect(changed).toHaveBeenCalledTimes(1);
    window.removeEventListener(QUOTES_CHANGED_EVENT,changed);
  });

  it('sends the chosen reason without the Other note when another reason is picked last',async()=>{
    post.mockResolvedValue({quote:DECLINED,replayed:false});
    open();
    const {decline}=await startDecline();
    fireEvent.click(within(decline).getByRole('radio',{name:'Other'}));
    fireEvent.change(within(decline).getByRole('textbox'),{target:{value:'Went with a local shop'}});
    fireEvent.click(within(decline).getByRole('radio',{name:'Need it sooner than quoted'}));
    expect(within(decline).queryByRole('textbox')).toBeNull();
    fireEvent.click(within(decline).getByRole('button',{name:'Decline'}));
    await waitFor(()=>expect(post).toHaveBeenCalledWith('q-24817','decline',{revision:1,reason:'need_sooner'},expect.any(String)));
  });

  it('sends Other with its note, trimmed',async()=>{
    post.mockResolvedValue({quote:DECLINED,replayed:false});
    open();
    const {decline}=await startDecline();
    fireEvent.click(within(decline).getByRole('radio',{name:'Other'}));
    fireEvent.change(within(decline).getByRole('textbox'),{target:{value:'  Went with a local shop '}});
    fireEvent.click(within(decline).getByRole('button',{name:'Decline'}));
    await waitFor(()=>expect(post).toHaveBeenCalledWith('q-24817','decline',{revision:1,reason:'other',note:'Went with a local shop'},expect.any(String)));
  });

  it('when the quote moved on (expired, answered elsewhere) it says so and reloads the quote',async()=>{
    post.mockRejectedValue(new ResponseRefused('Q-24817 expired: it was valid until Oct 7. Ask Brandi for a new quote.',409,'expired'));
    const api=open();
    const {dialog,decline}=await startDecline();
    fireEvent.click(within(decline).getByRole('button',{name:'Decline'}));
    expect(await bar(dialog).findByRole('alert')).toHaveTextContent('Q-24817 expired: it was valid until Oct 7. Ask Brandi for a new quote.');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(()=>expect(api.get).toHaveBeenCalledTimes(2));
  });

  it('a refused note stays in the dialog with the reason',async()=>{
    post.mockRejectedValue(new ResponseRefused('Keep the note to 250 characters.',400,'invalid_input'));
    open();
    const {decline}=await startDecline();
    fireEvent.click(within(decline).getByRole('radio',{name:'Other'}));
    fireEvent.change(within(decline).getByRole('textbox'),{target:{value:'x'}});
    fireEvent.click(within(decline).getByRole('button',{name:'Decline'}));
    expect(await within(declineDialog()).findByRole('alert')).toHaveTextContent('Keep the note to 250 characters.');
  });
});
