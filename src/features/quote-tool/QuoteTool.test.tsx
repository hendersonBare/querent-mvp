import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {MatchOutcome} from './client';
import {QuoteTool} from './QuoteTool';
import {sampleRun} from './test-fixtures';
import type {ProgressEvent} from './types';

// The quote creation tool's input page (docs/boxt/plan.md B5): paste a list or upload a PDF, the live
// line counter and the 200-line cap, Find matches, the progress bar with its stage text, one-line
// errors, and the review dialog on a result (saving goes to the quote's page).

const router=vi.hoisted(()=>({push:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>router}));

type Match=(form:FormData,onProgress:(e:ProgressEvent)=>void)=>Promise<MatchOutcome>;

function setup(match:Match=async()=>({ok:true,run:sampleRun()})){
  const spy=vi.fn(match);
  render(<QuoteTool match={spy} save={async()=>({id:'q-1'})} search={async()=>[]}/>);
  return {match:spy};
}

const textarea=()=>screen.getByLabelText('Paste the customer\'s list, one item per line');
const find=()=>screen.getByRole('button',{name:'Find matches'});
const pdfInput=()=>screen.getByLabelText('Upload PDF') as HTMLInputElement;
const pick=(file:File)=>fireEvent.change(pdfInput(),{target:{files:[file]}});
const PDF_MAGIC=[0x25,0x50,0x44,0x46,0x2d];
const pdf=(bytes=10,name='po.pdf',type='application/pdf')=>{const data=new Uint8Array(Math.max(bytes,5));data.set(PDF_MAGIC);return new File([data],name,{type});};

beforeEach(()=>router.push.mockReset());

describe('QuoteTool',()=>{
  it('counts the non-empty lines as the list is typed, and needs a list to start',()=>{
    setup();
    expect(screen.getByText('0 of 200 lines')).toBeInTheDocument();
    expect(find()).toBeDisabled();
    fireEvent.change(textarea(),{target:{value:'12x10x8 boxes 10\n\n  \nstretch wrap 4 rolls\ntape'}});
    expect(screen.getByText('3 of 200 lines')).toBeInTheDocument();
    expect(find()).toBeEnabled();
  });

  it('refuses more than 200 lines with a plain error and a disabled button',()=>{
    setup();
    fireEvent.change(textarea(),{target:{value:Array.from({length:201},(_,i)=>`item ${i}`).join('\n')}});
    expect(screen.getByText('201 of 200 lines')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This list has 201 lines. The limit is 200, so split it into smaller lists.');
    expect(find()).toBeDisabled();
  });

  it('takes a PDF instead of the pasted list, and only a PDF up to 4 MB',async()=>{
    setup();
    expect(pdfInput()).toHaveAttribute('accept','application/pdf,.pdf');
    pick(new File(['hello'],'list.txt',{type:'text/plain'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only PDF files can be uploaded.');
    pick(pdf(4*1024*1024+1,'huge.pdf'));
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('That PDF is larger than 4 MB.'));
    pick(pdf(10,'po-1182.pdf'));
    expect(await screen.findByText('po-1182.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByLabelText('Paste the customer\'s list, one item per line')).toBeNull();
    expect(find()).toBeEnabled();
    fireEvent.click(screen.getByRole('button',{name:'Remove PDF'}));
    expect(textarea()).toBeInTheDocument();
  });

  it('checks the first bytes before upload: a ".pdf" that is not a PDF is refused, a PDF with a generic type is taken',async()=>{
    setup();
    pick(new File([new TextEncoder().encode('<html>not a pdf</html>')],'fake.pdf',{type:'application/pdf'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only PDF files can be uploaded.');
    expect(screen.queryByText('fake.pdf')).toBeNull();
    pick(pdf(10,'scan.pdf','application/octet-stream'));
    expect(await screen.findByText('scan.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Remove PDF'}));
    pick(pdf(10,'untyped.pdf',''));
    expect(await screen.findByText('untyped.pdf')).toBeInTheDocument();
  });

  it('sends the pasted list as `text`, or the PDF as `file`',async()=>{
    const {match}=setup();
    fireEvent.change(textarea(),{target:{value:'boxes 10'}});
    fireEvent.click(find());
    await screen.findByRole('dialog',{name:'Review quote'});
    expect(match.mock.calls[0][0].get('text')).toBe('boxes 10');
    expect(match.mock.calls[0][0].get('file')).toBeNull();
  });

  it('shows progress with the stage in words while matching',async()=>{
    let report!:(e:ProgressEvent)=>void;
    let finish!:(o:MatchOutcome)=>void;
    setup((_,onProgress)=>{report=onProgress;return new Promise(resolve=>{finish=resolve;});});
    fireEvent.change(textarea(),{target:{value:'boxes 10'}});
    fireEvent.click(find());
    const bar=await screen.findByRole('progressbar');
    expect(find()).toBeDisabled();
    act(()=>report({stage:'parse',done:0,total:1}));
    expect(screen.getByText('Reading the list…')).toBeInTheDocument();
    act(()=>report({stage:'match',done:37,total:120}));
    expect(screen.getByText('Matching 37 of 120…')).toBeInTheDocument();
    const mid=Number(bar.getAttribute('aria-valuenow'));
    act(()=>report({stage:'judge',done:12,total:40}));
    expect(screen.getByText('Checking 12 of 40 with Claude…')).toBeInTheDocument();
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThan(mid);
    await act(async()=>finish({ok:true,run:sampleRun()}));
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.getByRole('dialog',{name:'Review quote'})).toBeInTheDocument();
  });

  it('shows a failed run as one plain line and lets the rep try again',async()=>{
    const {match}=setup(async()=>({ok:false,error:'Could not read that list. Try pasting it as text.'}));
    fireEvent.change(textarea(),{target:{value:'boxes 10'}});
    fireEvent.click(find());
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read that list. Try pasting it as text.');
    expect(find()).toBeEnabled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(match).toHaveBeenCalledTimes(1);
  });

  it('goes to the saved quote\'s page after Save quote',async()=>{
    setup();
    fireEvent.change(textarea(),{target:{value:'boxes 10'}});
    fireEvent.click(find());
    const dialog=await screen.findByRole('dialog',{name:'Review quote'});
    fireEvent.change(within(dialog).getByLabelText('Unit price for 12108-BDL'),{target:{value:'0.79'}});
    fireEvent.change(within(dialog).getByLabelText('Unit price for SF188CAST'),{target:{value:'24.5'}});
    fireEvent.change(within(dialog).getByLabelText('Quantity for SF188CAST'),{target:{value:'3'}});
    fireEvent.click(within(dialog).getByRole('button',{name:'Save quote'}));
    await waitFor(()=>expect(router.push).toHaveBeenCalledWith('/quotes/q-1'));
  });

  it('closing the review keeps the list for another run',async()=>{
    setup();
    fireEvent.change(textarea(),{target:{value:'boxes 10'}});
    fireEvent.click(find());
    const dialog=await screen.findByRole('dialog',{name:'Review quote'});
    fireEvent.keyDown(dialog,{key:'Escape'});
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(textarea()).toHaveValue('boxes 10');
  });
});
