import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {TranscriptMessage} from './api';
import {ChatButton} from './ViewFullChat';

// The Chat icon button and the chat drawer (plan U4, C_QE6; B1, decision 26, spec §6, §9): the button's
// name carries the message count, and it opens the side drawer. Customer messages are emphasised,
// assistant turns are one line until expanded, notices (item pop-up, quote requested or sent) are one
// muted line, and "Load earlier" fetches the next page of 50. Escape and the x close it. fetch fakes
// GET /api/rep/quotes/<id>/messages.

const REQUEST='Do you have the 1/2 in grade 8 hex bolts in stock? Need 10 boxes plus the usual cut-off wheels and gloves.';
const msg=(id:string,role:TranscriptMessage['role'],content:string,kind='text',minute=0):TranscriptMessage=>
  ({id,role,kind,content,created_at:new Date(Date.parse('2026-09-23T16:12:00.000Z')+minute*60_000).toISOString()});
const SAMPLE=[
  msg('m-1','customer',REQUEST),
  msg('m-2','assistant','Yes, the hex cap screws are in stock at SLC (64 boxes).\nFor the 2 in ratchet straps, do you want 27 ft with J-hooks or 30 ft with flat hooks?','text',1),
  msg('m-3','customer','27 ft with J-hooks.','text',2),
  msg('m-4','assistant','Here is your list. Check the quantities, then press Request quote.','item_popup',3),
  msg('m-5','assistant','Thanks, Dana. Brandi Gallegos is pricing your request now.','quote_requested',4),
];

let pages:Record<string,{total:number;messages:TranscriptMessage[];next_before:string|null}>;
const fetchMock=vi.fn(async(input:RequestInfo|URL)=>{
  const url=new URL(String(input),'http://127.0.0.1');
  if(url.pathname!=='/api/rep/quotes/q-24817/messages')return Response.json({detail:'Not found.'},{status:404});
  const page=pages[url.searchParams.get('before')??''];
  return page?Response.json(page):Response.json({detail:'Not found.'},{status:404});
});

beforeEach(()=>{
  pages={'':{total:5,messages:SAMPLE,next_before:null}};
  fetchMock.mockClear();
  vi.stubGlobal('fetch',fetchMock);
});
afterEach(()=>vi.unstubAllGlobals());

const renderButton=()=>render(<ChatButton quoteId="q-24817" customer="Dana Ortiz" hasChat/>);
async function openDrawer(){
  renderButton();
  const button=await screen.findByRole('button',{name:/Customer chat, 5 messages/});
  fireEvent.click(button);
  return screen.getByRole('dialog',{name:'Full chat'});
}

describe('the chat button and drawer',()=>{
  it('shows the message count on the button, from the first page',async()=>{
    renderButton();
    const button=await screen.findByRole('button',{name:'Customer chat, 5 messages'});
    // An icon button (C_QEBase): the count is in its name.
    expect(button).toHaveTextContent('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/rep/quotes/q-24817/messages');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('says "1 message" for one',async()=>{
    pages={'':{total:1,messages:[SAMPLE[0]],next_before:null}};
    renderButton();
    expect(await screen.findByRole('button',{name:'Customer chat, 1 message'})).toBeInTheDocument();
  });

  it('opens a drawer with focus inside it, the customer emphasised, assistant turns on one line and notices muted',async()=>{
    const drawer=await openDrawer();
    expect(drawer).toHaveAttribute('aria-modal','true');
    expect(drawer.contains(document.activeElement)).toBe(true);
    expect(within(drawer).getByText('Dana Ortiz, 5 messages, via Querent chat')).toBeInTheDocument();
    // No AI summary: only the messages.
    expect(within(drawer).queryByText(/summary/i)).not.toBeInTheDocument();
    const items=within(drawer).getAllByRole('listitem');
    expect(items).toHaveLength(5);
    // The customer's words in full, emphasised.
    expect(items[0]).toHaveAttribute('data-role','customer');
    expect(within(items[0]).getByText(REQUEST)).toHaveAttribute('data-role','customer');
    expect(within(items[0]).getByText('Dana Ortiz')).toBeInTheDocument();
    expect(items[2]).toHaveAttribute('data-role','customer');
    // The assistant's turn: its first line only, with an ellipsis, until expanded.
    const turn=within(items[1]).getByRole('button',{name:/Yes, the hex cap screws are in stock/});
    expect(turn).toHaveAttribute('aria-expanded','false');
    expect(turn).toHaveTextContent('Yes, the hex cap screws are in stock at SLC (64 boxes).…');
    expect(within(drawer).queryByText(/30 ft with flat hooks/)).not.toBeInTheDocument();
    // Notices: one muted line each, labelled by kind.
    expect(items[3]).toHaveAttribute('data-kind','item_popup');
    expect(items[3]).toHaveTextContent('Item pop-up: Here is your list.');
    expect(within(items[3]).queryByRole('button')).not.toBeInTheDocument();
    expect(items[4]).toHaveTextContent('Quote requested: Thanks, Dana.');
  });

  it('expands an assistant turn on click and on Enter, and collapses it again',async()=>{
    const drawer=await openDrawer();
    const turn=within(drawer).getByRole('button',{name:/Yes, the hex cap screws/});
    fireEvent.click(turn);
    expect(turn).toHaveAttribute('aria-expanded','true');
    expect(within(drawer).getByText(/30 ft with flat hooks/)).toBeInTheDocument();
    fireEvent.click(turn);
    expect(turn).toHaveAttribute('aria-expanded','false');
    expect(within(drawer).queryByText(/30 ft with flat hooks/)).not.toBeInTheDocument();
    // A native button: Enter clicks it.
    fireEvent.keyDown(turn,{key:'Enter'});
    expect(turn).toHaveAttribute('aria-expanded','true');
  });

  it('loads earlier pages of 50, oldest at the top, until there are none',async()=>{
    const older=Array.from({length:50},(_,i)=>msg(`o-${i+11}`,i%2?'assistant':'customer',`Older ${i+11}`,'text',-100+i));
    const oldest=Array.from({length:10},(_,i)=>msg(`o-${i+1}`,'customer',`Oldest ${i+1}`,'text',-200+i));
    pages={'':{total:65,messages:SAMPLE,next_before:'m-1'},'m-1':{total:65,messages:older,next_before:'o-11'},'o-11':{total:65,messages:oldest,next_before:null}};
    renderButton();
    fireEvent.click(await screen.findByRole('button',{name:'Customer chat, 65 messages'}));
    const drawer=screen.getByRole('dialog',{name:'Full chat'});
    expect(within(drawer).getAllByRole('listitem')).toHaveLength(5);
    fireEvent.click(within(drawer).getByRole('button',{name:'Load earlier'}));
    await waitFor(()=>expect(within(drawer).getAllByRole('listitem')).toHaveLength(55));
    expect(String(fetchMock.mock.calls.at(-1)![0])).toBe('/api/rep/quotes/q-24817/messages?before=m-1');
    expect(within(drawer).getAllByRole('listitem')[0]).toHaveTextContent('Older 11');
    fireEvent.click(within(drawer).getByRole('button',{name:'Load earlier'}));
    await waitFor(()=>expect(within(drawer).getAllByRole('listitem')).toHaveLength(65));
    expect(within(drawer).getAllByRole('listitem')[0]).toHaveTextContent('Oldest 1');
    expect(within(drawer).queryByRole('button',{name:'Load earlier'})).not.toBeInTheDocument();
  });

  it('says so when a page doesn’t load, and lets the rep retry',async()=>{
    pages={'':{total:65,messages:SAMPLE,next_before:'m-1'}};
    renderButton();
    fireEvent.click(await screen.findByRole('button',{name:'Customer chat, 65 messages'}));
    const drawer=screen.getByRole('dialog',{name:'Full chat'});
    fireEvent.click(within(drawer).getByRole('button',{name:'Load earlier'}));
    expect(await within(drawer).findByRole('alert')).toHaveTextContent('The chat didn’t load. Try again.');
    expect(within(drawer).getByRole('button',{name:'Load earlier'})).toBeEnabled();
  });

  it('closes on Escape and on the X, and gives focus back to the button',async()=>{
    await openDrawer();
    const button=screen.getByRole('button',{name:/Customer chat/});
    act(()=>{fireEvent.keyDown(document,{key:'Escape'});});
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'Close chat'}));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(button);
    // Reopening doesn't fetch again.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
