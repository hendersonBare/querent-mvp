import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {SAMPLE_LINES,sampleDetail} from '../test-fixtures';
import {ExportMenu} from './ExportMenu';
import {filenameFrom} from './download';

// The quote's Export menu (task 4.3, spec §4, docs/design/screens/05): the mockup's four items
// and hints; the PDFs and the CSV download for the revision on screen (the draft while the rep
// can edit it, else the latest sent) after queued edits save; Copy quote summary writes plain
// text to the clipboard, with a fallback, and says so.

const PDF_NAME='Herrick Industrial Supply quote Q-24817 rev 1 draft.pdf';
let fetchMock:ReturnType<typeof vi.fn>;
let saved:{href:string;download:string}[];
let writeText:ReturnType<typeof vi.fn>|undefined;

function respond(url:string){
  if(url.includes('/pdf?'))return new Response(new Uint8Array([37,80,68,70,45]),{headers:{'content-type':'application/pdf','content-disposition':`inline; filename="${PDF_NAME}"; filename*=UTF-8''${encodeURIComponent(PDF_NAME)}`}});
  return new Response('﻿Line,SKU\r\n',{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="Q-24817 rev 1 draft line items.csv"'}});
}

beforeEach(()=>{
  fetchMock=vi.fn(async(input:RequestInfo|URL)=>respond(String(input)));
  vi.stubGlobal('fetch',fetchMock);
  saved=[];
  vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(function(this:HTMLAnchorElement){saved.push({href:this.href,download:this.download});});
  URL.createObjectURL=vi.fn(()=>'blob:export-1');
  URL.revokeObjectURL=vi.fn();
  writeText=vi.fn(async()=>{});
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

function renderMenu(detail=sampleDetail(),flush=vi.fn(async()=>{})){
  render(<ExportMenu detail={detail} lines={detail.lines} flush={flush}/>);
  return flush;
}
const openMenu=()=>{fireEvent.click(screen.getByRole('button',{name:'Export'}));return screen.getByRole('menu',{name:'Export'});};
const choose=(name:RegExp)=>fireEvent.click(within(openMenu()).getByRole('menuitem',{name}));
const toast=()=>screen.getByRole('status');

describe('the menu',()=>{
  it('lists the mockup\'s four exports with their hints, naming the customer\'s contact',()=>{
    renderMenu();
    expect(within(openMenu()).getAllByRole('menuitem').map(i=>i.textContent)).toEqual([
      'Customer quote (PDF)What Dana sees. No cost or margin.',
      'Internal worksheet (PDF)Adds cost, margin, last paid and open checks',
      'Line items (CSV)Opens in Excel or Google Sheets',
      'Copy quote summaryPlain text for an email or text message',
    ]);
  });

  it('says "the customer" when the quote has no contact',()=>{
    renderMenu(sampleDetail({quote:{contact_name:null}}));
    expect(within(openMenu()).getByRole('menuitem',{name:/Customer quote/})).toHaveTextContent('What the customer sees. No cost or margin.');
  });
});

describe('downloads',()=>{
  it('saves the draft\'s customer PDF once queued edits are saved, under the server\'s filename',async()=>{
    const order:string[]=[];
    const flush=vi.fn(async()=>{order.push('flush');});
    fetchMock.mockImplementation(async(input:RequestInfo|URL)=>{order.push('fetch');return respond(String(input));});
    renderMenu(sampleDetail(),flush);
    choose(/Customer quote/);
    await waitFor(()=>expect(toast()).toHaveTextContent(`Exported ${PDF_NAME}`));
    expect(order).toEqual(['flush','fetch']);
    expect(fetchMock).toHaveBeenCalledWith('/api/quotes/q-24817/pdf?variant=customer&rev=draft',{cache:'no-store'});
    expect(saved).toEqual([{href:'blob:export-1',download:PDF_NAME}]);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('asks for the internal worksheet and the CSV of the same revision',async()=>{
    renderMenu();
    choose(/Internal worksheet/);
    await waitFor(()=>expect(toast()).toHaveTextContent('Exported'));
    choose(/Line items/);
    await waitFor(()=>expect(toast()).toHaveTextContent('Exported Q-24817 rev 1 draft line items.csv'));
    expect(fetchMock.mock.calls.map(c=>c[0])).toEqual(['/api/quotes/q-24817/pdf?variant=internal&rev=draft','/api/rep/quotes/q-24817/lines.csv?rev=draft']);
  });

  it('exports the latest sent revision of a quote the rep can no longer edit',async()=>{
    renderMenu(sampleDetail({editable:false,quote:{status:'accepted',revision:2}}));
    for(const item of [/Customer quote/,/Internal worksheet/,/Line items/]){
      choose(item);
      await waitFor(()=>expect(toast()).toHaveTextContent('Exported'));
    }
    expect(fetchMock.mock.calls.map(c=>c[0])).toEqual([
      '/api/quotes/q-24817/pdf?variant=customer&rev=2','/api/quotes/q-24817/pdf?variant=internal&rev=2','/api/rep/quotes/q-24817/lines.csv?rev=2']);
  });

  it('exports the draft (the next revision) of a quote the customer asked to change, not the revision they have',async()=>{
    renderMenu(sampleDetail({quote:{status:'changes_requested',revision:1}}));
    choose(/Customer quote/);
    await waitFor(()=>expect(toast()).toHaveTextContent('Exported'));
    expect(fetchMock).toHaveBeenCalledWith('/api/quotes/q-24817/pdf?variant=customer&rev=draft',{cache:'no-store'});
  });

  it('shows the server\'s refusal instead of saving it, until dismissed',async()=>{
    fetchMock.mockResolvedValueOnce(Response.json({detail:'Q-24817 has no draft to preview: it is sent. Open rev 1 instead.'},{status:409}));
    renderMenu();
    choose(/Line items/);
    const alert=await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Q-24817 has no draft to preview: it is sent. Open rev 1 instead.');
    expect(saved).toEqual([]);
    fireEvent.click(within(alert).getByRole('button',{name:'Dismiss'}));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says so when the network fails',async()=>{
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderMenu();
    choose(/Internal worksheet/);
    expect(await screen.findByRole('alert')).toHaveTextContent('The internal worksheet didn’t download. Check your connection and try again.');
  });

  it('runs one download at a time',async()=>{
    let release=()=>{};
    fetchMock.mockImplementationOnce(async(input:RequestInfo|URL)=>{await new Promise<void>(r=>{release=r;});return respond(String(input));});
    renderMenu();
    choose(/Customer quote/);
    await waitFor(()=>expect(toast()).toHaveTextContent('Preparing the customer quote…'));
    const busy=within(openMenu()).getByRole('menuitem',{name:/Preparing/});
    expect(busy).toHaveAttribute('aria-disabled','true');
    fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem',{name:/Line items/}));
    await act(async()=>{release();});
    await waitFor(()=>expect(toast()).toHaveTextContent('Exported'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Copy quote summary',()=>{
  const SUMMARY_START='Quote Q-24817 rev 1 (draft, not sent) for Wasatch Mechanical Contractors (Dana Ortiz)\nValid until Oct 9, 2026 · Will call at SLC\n\n10 x HCS-12-13-2G8';

  it('writes the plain-text summary of the lines on screen to the clipboard and says so',async()=>{
    renderMenu();
    choose(/Copy quote summary/);
    await waitFor(()=>expect(toast()).toHaveTextContent('Quote summary copied'));
    expect(writeText).toHaveBeenCalledTimes(1);
    const text=writeText!.mock.calls[0][0] as string;
    expect(text.startsWith(SUMMARY_START)).toBe(true);
    expect(text.endsWith('Items $1,122.40 · Freight $0.00 · Total $1,122.40 before tax')).toBe(true);
    expect(text).not.toMatch(/21\.40|margin|cost|%/i);
    // Nothing to fetch: it is built from the page.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the lines as edited, not as last saved',async()=>{
    const detail=sampleDetail();
    render(<ExportMenu detail={detail} lines={[{...SAMPLE_LINES[0],qty:12}]} flush={async()=>{}}/>);
    choose(/Copy quote summary/);
    await waitFor(()=>expect(writeText).toHaveBeenCalled());
    expect(writeText!.mock.calls[0][0]).toContain('12 x HCS-12-13-2G8 Hex cap screw 1/2-13 x 2 in (Box of 50) @ $31.50 = $378.00');
  });

  it('falls back to the copy command where the Clipboard API is missing or refused',async()=>{
    const exec=vi.fn(()=>true);
    Object.defineProperty(document,'execCommand',{configurable:true,value:exec});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
    renderMenu();
    choose(/Copy quote summary/);
    await waitFor(()=>expect(toast()).toHaveTextContent('Quote summary copied'));
    expect(exec).toHaveBeenCalledWith('copy');

    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn(async()=>{throw new DOMException('Denied','NotAllowedError');})}});
    exec.mockClear();
    choose(/Copy quote summary/);
    await waitFor(()=>expect(exec).toHaveBeenCalledWith('copy'));
  });

  it('says so when the browser refuses every way to copy',async()=>{
    Object.defineProperty(document,'execCommand',{configurable:true,value:vi.fn(()=>false)});
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});
    renderMenu();
    choose(/Copy quote summary/);
    expect(await screen.findByRole('alert')).toHaveTextContent('The browser blocked copying. Allow clipboard access for this site and try again.');
  });
});

describe('filenameFrom',()=>{
  it('prefers the UTF-8 name, then the quoted or bare one',()=>{
    expect(filenameFrom(`inline; filename="Quote.pdf"; filename*=UTF-8''Quote%20%C2%BD.pdf`)).toBe('Quote ½.pdf');
    expect(filenameFrom('attachment; filename="Q-24817 rev 1 line items.csv"')).toBe('Q-24817 rev 1 line items.csv');
    expect(filenameFrom('attachment; filename=plain.csv')).toBe('plain.csv');
    expect(filenameFrom('attachment')).toBeNull();
    expect(filenameFrom(null)).toBeNull();
  });
});
