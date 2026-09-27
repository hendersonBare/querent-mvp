import {fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';

// The customer PDF inline (task 5.1): fetched from the customer PDF route and drawn by pdf.js
// (./render-pdf, mocked here: jsdom has no canvas), with the pages' text for screen readers. The
// real drawing is covered by e2e/quote-delivery.spec.ts in Chromium.

const renderPdf=vi.fn();
vi.mock('./render-pdf',()=>({renderPdf:(...args:unknown[])=>renderPdf(...args),renderScale:()=>2}));
const {PdfPages,pdfLoadError}=await import('./PdfPages');

const URL='/api/quotes/q-24817/pdf?variant=customer&rev=1';
const pdfResponse=()=>new Response(new Uint8Array([37,80,68,70,45]),{status:200,headers:{'content-type':'application/pdf'}});
let fetchMock:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  fetchMock=vi.fn(async()=>pdfResponse());
  vi.stubGlobal('fetch',fetchMock);
  renderPdf.mockReset();
  renderPdf.mockImplementation(async(_data:Uint8Array,into:HTMLElement)=>{
    const canvas=document.createElement('canvas');canvas.className='qp-sheet';into.append(canvas);
    return {pages:1,text:['Herrick Industrial Supply QUOTATION Q-24817 Rev 1 Total $1,122.40']};
  });
});
afterEach(()=>{vi.unstubAllGlobals();});

describe('PdfPages',()=>{
  it('fetches the PDF, draws its pages and keeps their text for screen readers',async()=>{
    render(<PdfPages url={URL} label="Quote Q-24817, revision 1"/>);
    const doc=screen.getByRole('document',{name:'Quote Q-24817, revision 1'});
    expect(doc).toHaveAttribute('aria-busy','true');
    expect(within(doc).getByRole('status')).toHaveTextContent('Loading the PDF…');
    expect(await within(doc).findByText(/QUOTATION Q-24817 Rev 1/)).toBeInTheDocument();
    expect(doc).toHaveAttribute('aria-busy','false');
    expect(doc.querySelectorAll('canvas.qp-sheet')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(URL,{cache:'no-store'});
    expect([...(renderPdf.mock.calls[0][0] as Uint8Array)]).toEqual([37,80,68,70,45]);
    expect(within(doc).getByText('1 page')).toBeInTheDocument();
  });

  it('zooms in so the print is readable on a phone, and back to the width',async()=>{
    render(<PdfPages url={URL} label="Quote Q-24817, revision 1"/>);
    const doc=screen.getByRole('document');
    const zoom=await within(doc).findByRole('button',{name:'Zoom in'});
    expect(zoom).toHaveAttribute('aria-pressed','false');
    expect(doc).toHaveAttribute('data-zoom','fit');
    fireEvent.click(zoom);
    expect(within(doc).getByRole('button',{name:'Fit to width'})).toHaveAttribute('aria-pressed','true');
    expect(doc).toHaveAttribute('data-zoom','in');
  });

  it('says the PDF isn’t available when the route answers 404 (a quote the customer can’t see), and can try again',async()=>{
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({detail:'Quote not found.'}),{status:404}));
    render(<PdfPages url={URL} label="Quote Q-24817, revision 1"/>);
    const alert=await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This quote’s PDF isn’t available.');
    expect(renderPdf).not.toHaveBeenCalled();
    fireEvent.click(within(alert).getByRole('button',{name:'Try again'}));
    expect(await screen.findByText(/QUOTATION Q-24817/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says it couldn’t be shown when pdf.js can’t read it',async()=>{
    renderPdf.mockRejectedValueOnce(new Error('Invalid PDF structure.'));
    render(<PdfPages url={URL} label="Quote Q-24817, revision 1"/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('The quote PDF couldn’t be shown here.');
  });

  it('pdfLoadError words the failures for the customer',()=>{
    expect(pdfLoadError(404)).toBe('This quote’s PDF isn’t available.');
    expect(pdfLoadError(500)).toBe('The quote PDF couldn’t be loaded. Check your connection and try again.');
  });
});
