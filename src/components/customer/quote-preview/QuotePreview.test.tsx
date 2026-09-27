import {act,fireEvent,render,screen,within} from '@testing-library/react';
import {describe,expect,it,vi} from 'vitest';
import {fakeApi} from '../test-fixtures';
import {emitOpenQuote} from '../open-quote';
import {QuotePreview} from './QuotePreview';
import {NOW,previews} from './test-fixtures';

// The PDF preview modal (spec §3, task 5.1). Accept / Request changes (task 5.2) are covered in
// QuotePreview.respond.test.tsx. The PDF's pages are drawn by pdf.js in the browser
// (./PdfPages, covered by its own test and the Playwright spec); here it is a stand-in that shows
// which PDF it was given.
vi.mock('./PdfPages',()=>({PdfPages:({url,label}:{url:string;label:string})=><div role="document" aria-label={label} data-url={url}/>}));

function open(routes:Record<string,unknown>,request:Parameters<typeof emitOpenQuote>[0]={id:'q-24817',quote_number:'Q-24817'}){
  const api=fakeApi(routes);
  render(<QuotePreview api={api} now={NOW}/>);
  act(()=>emitOpenQuote(request));
  return api;
}
const dialog=()=>screen.findByRole('dialog',{name:'Quote Q-24817'});

describe('QuotePreview',()=>{
  it('stays closed until a quote is opened',()=>{
    render(<QuotePreview api={fakeApi({})} now={NOW}/>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the sent revision’s customer PDF inline, Download at the top right, and the Accept / Request changes bar (task 5.2)',async()=>{
    const api=open({'customer/quotes/q-24817':previews.sent});
    const modal=await dialog();
    expect(api.get).toHaveBeenCalledWith('customer/quotes/q-24817');
    expect(await within(modal).findByRole('document',{name:'Quote Q-24817, revision 1'})).toHaveAttribute('data-url','/api/quotes/q-24817/pdf?variant=customer&rev=1');
    expect(within(modal).getByText('Sent',{selector:'.cx-chip'})).toBeInTheDocument();
    expect([...modal.querySelectorAll('.qp-facts > div')].map(d=>d.textContent)).toEqual(['Total$1,122.40','Valid untilOct 7','Revision1 of 1']);
    const download=within(modal).getByRole('link',{name:'Download'});
    expect(download).toHaveAttribute('href','/api/quotes/q-24817/pdf?variant=customer&rev=1');
    expect(download).toHaveAttribute('download');
    // Top right: in the header's tools, next to Close, after the title.
    const tools=modal.querySelector('.qp-head .qp-tools')!;
    expect(tools).toContainElement(download);
    expect(within(tools as HTMLElement).getByRole('button',{name:'Close'})).toBeInTheDocument();
    const bar=within(modal).getByRole('group',{name:'Respond to this quote'});
    expect(within(bar).getByRole('button',{name:'Accept'})).toBeEnabled();
    expect(within(bar).getByRole('button',{name:'Request changes'})).toBeEnabled();
    expect(within(bar).getByRole('button',{name:'Accept'})).toHaveAccessibleDescription('Accept it with a pickup time and your PO, or ask Brandi for changes.');
  });

  it('offers no Download when the rep turned Attach PDF off, but still shows the PDF',async()=>{
    open({'customer/quotes/q-24817':previews.noAttachment});
    const modal=await dialog();
    expect(await within(modal).findByRole('document')).toBeInTheDocument();
    expect(within(modal).queryByRole('link',{name:'Download'})).toBeNull();
  });

  it('before the first send: no PDF and no Download, the rep is pricing it (Awaiting rep)',async()=>{
    open({'customer/quotes/q-24817':previews.awaiting});
    const modal=await dialog();
    expect(await within(modal).findByText('Brandi is pricing this quote')).toBeInTheDocument();
    expect(within(modal).getByText('Awaiting rep',{selector:'.cx-chip'})).toBeInTheDocument();
    expect(within(modal).queryByRole('document')).toBeNull();
    expect(within(modal).queryByRole('link',{name:'Download'})).toBeNull();
    expect(within(modal).getByRole('link',{name:/\(801\) 111-2222/})).toHaveAttribute('href','tel:8011112222');
    expect(within(modal).getByRole('button',{name:'Accept'})).toHaveAccessibleDescription('You can accept it or ask for changes once Brandi sends it.');
  });

  it('an expired quote: the PDF stays readable, the action bar stays off and says why',async()=>{
    open({'customer/quotes/q-24817':previews.expired});
    const modal=await dialog();
    expect(await within(modal).findByRole('document')).toBeInTheDocument();
    expect(within(modal).getByText('Expired',{selector:'.cx-chip'})).toBeInTheDocument();
    expect(within(modal).getByRole('button',{name:'Accept'})).toBeDisabled();
    expect(within(modal).getByText('This quote expired: it was valid until Oct 7. Ask Brandi for a new one.')).toBeInTheDocument();
  });

  it('opens the revision a chat message announced, and offers the latest when a newer one exists',async()=>{
    const api=open({'customer/quotes/q-24817?rev=1':previews.older,'customer/quotes/q-24817?rev=2':previews.latest},{id:'q-24817',quote_number:'Q-24817',revision:1});
    let modal=await dialog();
    expect(await within(modal).findByRole('document',{name:'Quote Q-24817, revision 1'})).toBeInTheDocument();
    expect(within(modal).getByText('You’re looking at revision 1. Revision 2 is the latest.')).toBeInTheDocument();
    expect(within(modal).queryByRole('link',{name:'Download'})).toBeNull();
    fireEvent.click(within(modal).getByRole('button',{name:'View revision 2'}));
    modal=await dialog();
    expect(await within(modal).findByRole('document',{name:'Quote Q-24817, revision 2'})).toHaveAttribute('data-url','/api/quotes/q-24817/pdf?variant=customer&rev=2');
    expect(api.get).toHaveBeenLastCalledWith('customer/quotes/q-24817?rev=2');
    expect(within(modal).queryByText(/You’re looking at revision/)).toBeNull();
    expect(within(modal).getByRole('link',{name:'Download'})).toHaveAttribute('href','/api/quotes/q-24817/pdf?variant=customer&rev=2');
  });

  it('says so when the quote can’t be found (a tampered or stale id)',async()=>{
    open({'customer/quotes/q-99999':()=>{throw new Error('Quote not found.');}},{id:'q-99999',quote_number:'Q-99999'});
    const modal=await screen.findByRole('dialog',{name:'Quote Q-99999'});
    expect(await within(modal).findByRole('alert')).toHaveTextContent('Quote not found.');
    expect(within(modal).queryByRole('document')).toBeNull();
    expect(within(modal).queryByRole('link',{name:'Download'})).toBeNull();
    expect(within(modal).getByRole('button',{name:'Accept'})).toBeDisabled();
  });

  it('closes with Close, Escape or a click outside, and focus returns to what opened it',async()=>{
    const opener=document.createElement('button');
    document.body.append(opener);
    opener.focus();
    open({'customer/quotes/q-24817':previews.sent});
    let modal=await dialog();
    expect(within(modal).getByRole('button',{name:'Close'})).toHaveFocus();
    fireEvent.click(within(modal).getByRole('button',{name:'Close'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();

    act(()=>emitOpenQuote({id:'q-24817',quote_number:'Q-24817'}));
    modal=await dialog();
    fireEvent.keyDown(document,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();

    act(()=>emitOpenQuote({id:'q-24817',quote_number:'Q-24817'}));
    modal=await dialog();
    fireEvent.mouseDown(modal.parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
    opener.remove();
  });

  it('keeps focus inside the dialog',async()=>{
    open({'customer/quotes/q-24817':previews.sent});
    const modal=await dialog();
    await within(modal).findByRole('document');
    const download=within(modal).getByRole('link',{name:'Download'});
    // The last stop is the action bar's Accept (task 5.2).
    const accept=within(modal).getByRole('button',{name:'Accept'});
    download.focus();
    fireEvent.keyDown(document,{key:'Tab',shiftKey:true});
    expect(accept).toHaveFocus();
    fireEvent.keyDown(document,{key:'Tab'});
    expect(download).toHaveFocus();
  });
});
